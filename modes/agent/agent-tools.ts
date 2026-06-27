import { tool } from "ai";
import { z } from "zod";
import type { ToolExecutor } from "./tool-executor";
import path from "path";
import os from "os";
import fs from "fs";
import { execSync } from "child_process";
import { McpProxyManager } from "../mcp/manager";

interface AgentToolHooks {
    afterCreateFile?: (path: string) => Promise<string | void>;
    afterQueueComponentInstall?: (
        componentName: string,
        installationPath: string,
    ) => Promise<string | void>;
    afterMutation?: (path: string) => Promise<string | void>;
}

export function createAgentTools(executor: ToolExecutor, hooks: AgentToolHooks = {}) {
    const mcpManager = McpProxyManager.getInstance();

    return {
        read_file: tool({
            description: "Read a text file from the workspace. Use a path relative to the project root.",
            inputSchema: z.object({
                path: z.string().describe("Relative file path"),
            }),
            execute: async ({ path: p }) => executor.readFile(p),
        }),

        create_file: tool({
            description: "Stage creation of a new file (not written until the user approves).",
            inputSchema: z.object({
                path: z.string(),
                content: z.string(),
            }),
            execute: async ({ path: p, content }) => {
                const staged = executor.createFile(p, content);
                const followUp = await hooks.afterCreateFile?.(executor.normalizePath(p));
                return followUp ?? staged;
            },
        }),

        modify_file: tool({
            description:
                "Stage a full-file replacement for an existing file (pending approval).",
            inputSchema: z.object({
                path: z.string(),
                content: z.string().describe("Complete new file contents"),
            }),
            execute: async ({ path: p, content }) => {
                const staged = executor.modifyFile(p, content);
                const followUp = await hooks.afterMutation?.(executor.normalizePath(p));
                return followUp ?? staged;
            },
        }),

        delete_file: tool({
            description: "Stage deletion of a file (pending approval).",
            inputSchema: z.object({
                path: z.string(),
            }),
            execute: async ({ path: p }) => executor.deleteFile(p),
        }),

        create_folder: tool({
            description:
                "Stage creation of a directory tree (pending approval). Uses mkdir -p on apply.",
            inputSchema: z.object({
                path: z.string().describe("Relative directory path"),
            }),
            execute: async ({ path: p }) => executor.createFolder(p),
        }),

        list_files: tool({
            description: "List files and directories under a path.",
            inputSchema: z.object({
                path: z.string(),
                recursive: z.boolean().optional().default(false),
            }),
            execute: async ({ path: p, recursive }) =>
                executor.listFiles(p, recursive),
        }),

        search_files: tool({
            description:
                'Find files matching a glob pattern (e.g. "*.ts", "**/*.md"). Optional content substring filter.',
            inputSchema: z.object({
                root: z.string().describe("Directory to search, relative to root"),
                pattern: z
                    .string()
                    .describe("Glob-like pattern using * and ** (forward slashes)"),
                content_contains: z.string().optional(),
            }),
            execute: async ({ root, pattern, content_contains }) =>
                executor.searchFiles(root, pattern, content_contains),
        }),

        analyze_codebase: tool({
            description:
                "Summarize structure: file counts, size, extensions. Read-only.",
            inputSchema: z.object({
                path: z.string().default("."),
            }),
            execute: async ({ path: p }) => executor.analyzeCodebase(p),
        }),

        read_multiple_files: tool({
            description:
                "Read multiple files in a single tool call. Each file is individually logged to the action trail.",
            inputSchema: z.object({
                paths: z.array(z.string()),
            }),
            execute: async ({ paths }) =>
                executor.readMultipleFiles(paths),
        }),

        grep: tool({
            description: "Search file contents using a text query.",
            inputSchema: z.object({
                root: z.string().default("."),
                query: z.string(),
                caseSensitive: z.boolean().default(false),
            }),
            execute: async (args) => executor.grep(args),
        }),

        replace_in_file: tool({
            description: "Replace text inside a file while preserving the rest.",
            inputSchema: z.object({
                path: z.string(),
                search: z.string(),
                replace: z.string(),
            }),
            execute: async ({ path, search, replace }) => {
                const staged = executor.replaceInFile(path, search, replace);
                const followUp = await hooks.afterMutation?.(executor.normalizePath(path));
                return followUp ?? staged;
            },
        }),

        append_to_file: tool({
            description: "Append content to the end of a file.",
            inputSchema: z.object({
                path: z.string(),
                content: z.string(),
            }),
            execute: async ({ path, content }) => {
                const staged = executor.appendToFile(path, content);
                const followUp = await hooks.afterMutation?.(executor.normalizePath(path));
                return followUp ?? staged;
            },
        }),

        insert_at_line: tool({
            description: "Insert content at a specific line.",
            inputSchema: z.object({
                path: z.string(),
                line: z.number(),
                content: z.string(),
            }),
            execute: async ({ path, line, content }) => {
                const staged = executor.insertAtLine(path, line, content);
                const followUp = await hooks.afterMutation?.(executor.normalizePath(path));
                return followUp ?? staged;
            },
        }),

        query_global_design_system: tool({
            description:
                "Queries the global UI/UX Pro Max intelligence database for verified industry color systems, typography scales, layout rules, and UX guidelines. Use this tool whenever a prompt asks to build a website, dashboard, landing page, component, or frontend interface.",
            inputSchema: z.object({
                dataset: z
                    .enum([
                        "colors",
                        "typography",
                        "design",
                        "landing",
                        "app-interface",
                        "charts",
                        "ux-guidelines",
                        "styles",
                        "ui-reasoning",
                        "react-performance",
                    ])
                    .describe(
                        "The specific design data sheet to inspect based on UI requirements.",
                    ),
                filterKeyword: z
                    .string()
                    .optional()
                    .describe(
                        "Optional query keyword to filter data rows (e.g., 'SaaS', 'Fintech', 'dark', 'hero', 'navbar').",
                    ),
            }),
            execute: async ({ dataset, filterKeyword }) => {
                try {
                    const globalDir = path.join(
                        os.homedir(),
                        ".astra",
                        "ui-ux-pro-max-skill",
                    );
                    const localDir = path.join(process.cwd(), ".skills", "ui-ux-pro-max-skill");
                    const altLocalDir = path.join(
                        process.cwd(),
                        ".skills",
                        "ui-ux-pro-max-source",
                    );

                    if (!fs.existsSync(globalDir) && !fs.existsSync(localDir) &&
                        !fs.existsSync(altLocalDir)
                    ) {
                        const astraBaseDir = path.join(os.homedir(), ".astra");
                        if (!fs.existsSync(astraBaseDir)) {
                            fs.mkdirSync(astraBaseDir, { recursive: true });
                        }

                        try {
                            console.log(
                                `\n⚙️ Astra: Global design intelligence database missing. Provisioning automatically...\n`,
                            );
                            execSync(
                                `git clone --depth 1 https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git "${globalDir}"`,
                                { stdio: "ignore" },
                            );
                            console.log(
                                `✅ UI/UX Pro Max intelligence engine successfully provisioned globally!\n`,
                            );
                        } catch (cloneError) {
                            if (!fs.existsSync(globalDir)) {
                                return `Error: Auto-provisioning failed. Ensure you have git installed and internet connectivity.`;
                            }
                        }
                    }

                    const structuralCandidatePaths = [
                        path.join(localDir, "data", `${dataset}.csv`),
                        path.join(localDir, "src", "ui-ux-pro-max", "data", `${dataset}.csv`),
                        path.join(altLocalDir, "data", `${dataset}.csv`),
                        path.join(globalDir, "src", "ui-ux-pro-max", "data", `${dataset}.csv`),
                        path.join(globalDir, "data", `${dataset}.csv`),
                        path.join(globalDir, "cli", "assets", "data", `${dataset}.csv`),
                    ];

                    let resolvedFilePath = "";
                    for (const targetPath of structuralCandidatePaths) {
                        if (fs.existsSync(targetPath)) {
                            resolvedFilePath = targetPath;
                            break;
                        }
                    }

                    if (!resolvedFilePath) {
                        return `Error: Design matrix database for '${dataset}' could not be located in any standard repository folders.`;
                    }

                    const rawCsv = fs.readFileSync(resolvedFilePath, "utf-8");
                    const lines = rawCsv.split("\n");
                    const csvHeader = lines[0];

                    if (!filterKeyword) {
                        return lines.slice(0, 100).join("\n");
                    }

                    const matchWord = filterKeyword.toLowerCase();
                    const filteredRows = lines
                        .slice(1)
                        .filter((row: string) => row.toLowerCase().includes(matchWord));

                    if (filteredRows.length === 0) {
                        return `Dataset '${dataset}' parsed. No specific layout rules matched your keyword '${filterKeyword}'. Available structure headers: ${csvHeader}`;
                    }

                    return [csvHeader, ...filteredRows].join("\n");
                } catch (error: any) {
                    return `Failed to query design system context matrix: ${error.message}`;
                }
            },
        }),

        fetch_premium_ui_component: tool({
            description:
                "Fetches official, production-ready shadcn/ui components. Use this whenever the user requests standard UI primitives, accessible building blocks, form inputs, layout skeletons, or modular interactive design elements.",
            inputSchema: z.object({
                componentQuery: z.string().describe(
                    "The exact name of the shadcn component to install. Valid core components include: " +
                    "'accordion', 'alert', 'alert-dialog', 'aspect-ratio', 'avatar', 'badge', 'breadcrumb', " +
                    "'button', 'calendar', 'card', 'carousel', 'chart', 'checkbox', 'collapsible', 'command', " +
                    "'context-menu', 'dialog', 'drawer', 'dropdown-menu', 'form', 'hover-card', 'input', " +
                    "'input-otp', 'label', 'menubar', 'navigation-menu', 'pagination', 'popover', 'progress', " +
                    "'radio-group', 'resizable', 'scroll-area', 'select', 'separator', 'sheet', 'sidebar', " +
                    "'skeleton', 'slider', 'sonner', 'switch', 'table', 'tabs', 'textarea', 'toast', 'toggle', " +
                    "'toggle-group', 'tooltip'.",
                ),
                installationPath: z
                    .string()
                    .default("components/ui")
                    .describe(
                        "The destination directory. Note: shadcn automatically resolves paths using your local components.json configuration.",
                    ),
            }),
            execute: async ({ componentQuery, installationPath }) => {
                try {
                    const componentName = componentQuery
                        .toLowerCase()
                        .trim()
                        .replace(/\s+/g, "-");

                    const command = `npx shadcn@latest add "${componentName}" --yes`;

                    await executor.queueShell(command);

                    if (hooks.afterQueueComponentInstall) {
                        const followUp = await hooks.afterQueueComponentInstall(
                            componentName,
                            installationPath,
                        );
                        return (
                            followUp ??
                            `Successfully installed shadcn component '${componentName}'.`
                        );
                    }

                    return `Successfully staged installation instruction for shadcn component '${componentName}'. Astra will apply this primitive UI block to your project upon your confirmation approval.`;
                } catch (error: any) {
                    return `Failed to stage shadcn component installation: ${error.message}`;
                }
            },
        }),

        list_mcp_servers: tool({
            description: "List all currently registered Model Context Protocol (MCP) servers and their health statuses.",
            inputSchema: z.object({}),
            execute: async () => {
                const servers = mcpManager.listServers();
                if (servers.length === 0) return "No MCP servers are currently registered.";
                return JSON.stringify(servers, null, 2);
            },
        }),

        add_mcp_server: tool({
            description: "Register and connect a new MCP runtime server.",
            inputSchema: z.object({
                serverName: z.string().describe("Unique identifier for the server"),
                command: z.string().describe("The execution command binary (e.g., 'node', 'python')"),
                args: z.array(z.string()).describe("Command line arguments passed to execution entrypoints"),
                env: z.record(z.string()).optional().describe("Optional environment variable overrides string-map"),
            }),
            execute: async ({ serverName, command, args, env }) => {
                return mcpManager.addServer(serverName, { command, args, env });
            },
        }),

        remove_mcp_server: tool({
            description: "Unregister and disconnect an MCP server.",
            inputSchema: z.object({
                serverName: z.string().describe("Name of the MCP server to remove"),
            }),
            execute: async ({ serverName }) => {
                return mcpManager.removeServer(serverName);
            },
        }),
 
        invoke_mcp_tool: tool({
            description: "Execute a tool explicitly from an MCP server target when not automatically bound natively.",
            inputSchema: z.object({
                serverName: z.string().describe("Name of the MCP server"),
                toolName: z.string().describe("Name of the tool to execute"),
                arguments: z.record(z.any()).optional().default({}).describe("Tool execution parameters mapping"),
            }),
            execute: async ({ serverName, toolName, arguments: args = {} }) => {
                try {
                    const output = await mcpManager.executeTool(serverName, toolName, args);
                    if (typeof output === "string") return output;
                    return JSON.stringify(output, null, 2);
                } catch (error: any) {
                    return `Error: ${error.message}`;
                }
            },
        }),
    };
}