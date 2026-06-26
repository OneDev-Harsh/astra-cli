import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { tool } from "ai";
import { z } from "zod";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logAndContinue } from "../../core/logger";

interface MCPServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
    cachedTools?: CachedTool[];
    lastToolsRefresh?: number;
    lastHealthCheck?: number;
    healthStatus?: "healthy" | "unhealthy" | "unknown";
    connectionAttempts?: number;
    lastError?: string;
}

interface CachedTool {
    name: string;
    description: string;
    inputSchema?: Record<string, any>;
}

interface ClientMetadata {
    client: any;
    connectedAt: number;
    lastUsedAt: number;
    executionCount: number;
    failureCount: number;
    healthStatus?: "healthy" | "unhealthy" | "unknown";
}

interface ExecutionMetrics {
    executionCount: number;
    totalDuration: number;
    averageDuration: number;
    failureCount: number;
    lastError?: string;
    lastExecutedAt?: number;
}

interface MCPRetryConfig {
    maxAttempts: number;
    initialDelay: number;
    backoffFactor: number;
}

export class McpProxyManager {
    private static instance: McpProxyManager | null = null;
    private configPath: string;
    private clients: Map<string, ClientMetadata> = new Map();
    private metrics: Map<string, ExecutionMetrics> = new Map();
    private connectionPromises: Map<string, Promise<any>> = new Map();
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private retryConfig: MCPRetryConfig = {
        maxAttempts: 3,
        initialDelay: 1000,
        backoffFactor: 2,
    };

    private constructor() {
        const homeDir = os.homedir();
        const astraDir = path.join(homeDir, ".astra");
        if (!fs.existsSync(astraDir)) {
            fs.mkdirSync(astraDir, { recursive: true });
        }
        this.configPath = path.join(astraDir, "mcp.json");
        this.ensureConfigFile();
        this.startHealthCheckTimer();
    }

    public static getInstance(): McpProxyManager {
        if (!McpProxyManager.instance) {
            McpProxyManager.instance = new McpProxyManager();
        }
        return McpProxyManager.instance;
    }

    private ensureConfigFile() {
        if (!fs.existsSync(this.configPath)) {
            const initialConfig = { mcpServers: {} };
            fs.writeFileSync(this.configPath, JSON.stringify(initialConfig, null, 2), "utf-8");
        }
    }

    private readConfig(): { mcpServers: Record<string, MCPServerConfig> } {
        try {
            this.ensureConfigFile();
            const content = fs.readFileSync(this.configPath, "utf-8");
            return JSON.parse(content);
        } catch (error) {
            logAndContinue("mcp", new Error("Failed to read MCP config"), { error });
            return { mcpServers: {} };
        }
    }

    private writeConfigAtomic(config: { mcpServers: Record<string, MCPServerConfig> }) {
        try {
            const tempPath = `${this.configPath}.tmp`;
            fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
            fs.renameSync(tempPath, this.configPath);
        } catch (error) {
            logAndContinue("mcp", new Error("Failed to write MCP config atomically"), { error });
            throw error;
        }
    }

    private async connectToServer(serverName: string, serverConfig: MCPServerConfig): Promise<any> {
        if (this.connectionPromises.has(serverName)) {
            return this.connectionPromises.get(serverName);
        }

        const connectionPromise = (async () => {
            let attempt = 0;
            let delay = this.retryConfig.initialDelay;

            while (attempt < this.retryConfig.maxAttempts) {
                try {
                    // Type-safe environment variable sanitization filtering out undefined properties
                    const combinedEnv = {
                        ...process.env,
                        ...(serverConfig.env || {}),
                    };
                    const sanitizedEnv = Object.fromEntries(
                        Object.entries(combinedEnv).filter(([_, val]) => val !== undefined)
                    ) as Record<string, string>;

                    const transport = new Experimental_StdioMCPTransport({
                        command: serverConfig.command,
                        args: serverConfig.args,
                        env: sanitizedEnv,
                    });

                    const client = createMCPClient({ transport });
                    
                    this.clients.set(serverName, {
                        client,
                        connectedAt: Date.now(),
                        lastUsedAt: Date.now(),
                        executionCount: 0,
                        failureCount: 0,
                        healthStatus: "healthy",
                    });

                    const config = this.readConfig();
                    if (config.mcpServers[serverName]) {
                        config.mcpServers[serverName].healthStatus = "healthy";
                        config.mcpServers[serverName].connectionAttempts = attempt + 1;
                        config.mcpServers[serverName].lastHealthCheck = Date.now();
                        delete config.mcpServers[serverName].lastError;
                        this.writeConfigAtomic(config);
                    }

                    return client;
                } catch (error: any) {
                    attempt++;
                    logAndContinue("mcp", new Error(`Failed connection to MCP server '${serverName}' (attempt ${attempt})`), { error: error.message });
                    
                    if (attempt >= this.retryConfig.maxAttempts) {
                        const config = this.readConfig();
                        if (config.mcpServers[serverName]) {
                            config.mcpServers[serverName].healthStatus = "unhealthy";
                            config.mcpServers[serverName].lastError = error.message;
                            config.mcpServers[serverName].lastHealthCheck = Date.now();
                            this.writeConfigAtomic(config);
                        }
                        throw error;
                    }
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    delay *= this.retryConfig.backoffFactor;
                }
            }
        })();

        this.connectionPromises.set(serverName, connectionPromise);
        try {
            return await connectionPromise;
        } finally {
            this.connectionPromises.delete(serverName);
        }
    }

    public async addServer(serverName: string, serverConfig: Omit<MCPServerConfig, "healthStatus">): Promise<string> {
        try {
            const config = this.readConfig();
            config.mcpServers[serverName] = {
                ...serverConfig,
                healthStatus: "unknown",
                connectionAttempts: 0,
            };
            this.writeConfigAtomic(config);
            await this.connectToServer(serverName, config.mcpServers[serverName]);
            return `✅ Successfully registered and connected to MCP server '${serverName}'.`;
        } catch (error: any) {
            return `⚠️ Registered MCP server '${serverName}', but connection failed: ${error.message}`;
        }
    }

    public async removeServer(serverName: string): Promise<string> {
        try {
            const config = this.readConfig();
            if (!config.mcpServers[serverName]) {
                return `❌ MCP server '${serverName}' does not exist.`;
            }

            const metadata = this.clients.get(serverName);
            if (metadata?.client?.close && typeof metadata.client.close === "function") {
                try { await metadata.client.close(); } catch { /* fail-silent */ }
            }

            this.clients.delete(serverName);
            this.metrics.delete(serverName);
            delete config.mcpServers[serverName];
            this.writeConfigAtomic(config);

            return `✅ Removed MCP server '${serverName}'.`;
        } catch (error: any) {
            return `❌ Failed to remove: ${error.message}`;
        }
    }

    public listServers() {
        const config = this.readConfig();
        return Object.entries(config.mcpServers).map(([name, srv]) => {
            const clientMeta = this.clients.get(name);
            return {
                name,
                command: srv.command,
                args: srv.args,
                healthStatus: clientMeta?.healthStatus || srv.healthStatus || "unknown",
                executionCount: this.metrics.get(name)?.executionCount || 0,
                failureCount: this.metrics.get(name)?.failureCount || 0,
                lastError: srv.lastError,
            };
        });
    }

    /**
     * Elegant Dynamic Assembly Pattern: 
     * Uses `getTools()` asynchronously to map external capabilities directly into 
     * top-level options, allowing native parameter parsing without intermediate wrappers.
     */
    public async getAssembledTools(): Promise<Record<string, any>> {
        const config = this.readConfig();
        const assembledTools: Record<string, any> = {};

        const connectionPromises = Object.entries(config.mcpServers).map(async ([name, srv]) => {
            try {
                let clientMeta = this.clients.get(name);
                let client = clientMeta?.client;
                if (!client) {
                    client = await this.connectToServer(name, srv);
                    clientMeta = this.clients.get(name);
                }

                if (client) {
                    // ✅ FIXED: Using the correct async method to fetch tools from the AI-SDK wrapper client
                    const serverTools = await client.getTools();
                    
                    if (serverTools) {
                        for (const [toolName, toolObj] of Object.entries(serverTools)) {
                            const safeName = `${name}__${toolName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
                            
                            assembledTools[safeName] = {
                                description: (toolObj as any).description || `MCP action from ${name}`,
                                parameters: (toolObj as any).parameters || z.object({}).passthrough(),
                                execute: async (args: any) => {
                                    const startTime = Date.now();
                                    const metric = this.metrics.get(name) || {
                                        executionCount: 0,
                                        totalDuration: 0,
                                        averageDuration: 0,
                                        failureCount: 0,
                                    };

                                    try {
                                        if (clientMeta) clientMeta.lastUsedAt = Date.now();
                                        const result = await (toolObj as any).execute(args);
                                        
                                        metric.executionCount++;
                                        metric.lastExecutedAt = Date.now();
                                        metric.totalDuration += Date.now() - startTime;
                                        metric.averageDuration = metric.totalDuration / metric.executionCount;
                                        this.metrics.set(name, metric);
                                        if (clientMeta) clientMeta.executionCount++;

                                        return result;
                                    } catch (err: any) {
                                        metric.failureCount++;
                                        metric.lastError = err.message;
                                        this.metrics.set(name, metric);
                                        if (clientMeta) clientMeta.failureCount++;
                                        logAndContinue("mcp", new Error(`Failed tool execution: ${toolName} on server ${name}`), { error: err.message });
                                        throw err;
                                    }
                                }
                            };
                        }
                    }
                }
            } catch (error: any) {
                logAndContinue("mcp", new Error(`Could not load context maps from server ${name}`), { error: error.message });
            }
        });

        await Promise.all(connectionPromises);
        return assembledTools;
    }

    public async executeTool(serverName: string, toolName: string, args: Record<string, any> = {}): Promise<any> {
        const config = this.readConfig();
        const srv = config.mcpServers[serverName];
        if (!srv) throw new Error(`MCP server '${serverName}' is not registered.`);

        let clientMeta = this.clients.get(serverName);
        let client = clientMeta?.client;
        if (!client) {
            client = await this.connectToServer(serverName, srv);
            clientMeta = this.clients.get(serverName);
        }

        // ✅ FIXED: Resolving tools dynamically through the proper async API
        const serverTools = await client.getTools();
        const targetTool = serverTools?.[toolName];
        if (!targetTool) {
            throw new Error(`Tool '${toolName}' not found on server '${serverName}'.`);
        }

        const startTime = Date.now();
        const metric = this.metrics.get(serverName) || {
            executionCount: 0,
            totalDuration: 0,
            averageDuration: 0,
            failureCount: 0,
        };

        try {
            if (clientMeta) clientMeta.lastUsedAt = Date.now();
            const result = await (targetTool as any).execute(args);

            metric.executionCount++;
            metric.lastExecutedAt = Date.now();
            metric.totalDuration += Date.now() - startTime;
            metric.averageDuration = metric.totalDuration / metric.executionCount;
            this.metrics.set(serverName, metric);
            if (clientMeta) clientMeta.executionCount++;

            return result;
        } catch (error: any) {
            metric.failureCount++;
            metric.lastError = error.message;
            this.metrics.set(serverName, metric);
            if (clientMeta) clientMeta.failureCount++;
            throw error;
        }
    }

    private startHealthCheckTimer() {
        if (this.healthCheckInterval) return;
        this.healthCheckInterval = setInterval(async () => {
            const config = this.readConfig();
            for (const [name, srv] of Object.entries(config.mcpServers)) {
                try {
                    const clientMeta = this.clients.get(name);
                    if (clientMeta?.client) {
                        await clientMeta.client.getTools();
                        clientMeta.healthStatus = "healthy";
                    }
                } catch {
                    if (config.mcpServers[name]) {
                        config.mcpServers[name].healthStatus = "unhealthy";
                    }
                }
            }
        }, 60000);
    }

    public async shutdown() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        const closePromises = [];
        for (const [_, metadata] of this.clients.entries()) {
            try {
                if (metadata.client?.close && typeof metadata.client.close === "function") {
                    closePromises.push(Promise.resolve(metadata.client.close()).catch(() => {}));
                }
            } catch {}
        }

        await Promise.race([
            Promise.all(closePromises),
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);

        this.clients.clear();
        this.connectionPromises.clear();
        this.metrics.clear();
    }

    public static resetInstance() {
        McpProxyManager.instance = null;
    }
}