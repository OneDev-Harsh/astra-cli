import {tool} from 'ai'
import {z} from 'zod'
import type { ToolExecutor } from './tool-executor'

interface AgentToolHooks {
    afterCreateFile?: (path: string) => Promise<string | void>;
}

export function createAgentTools(executor: ToolExecutor, hooks: AgentToolHooks = {}){
    return {

        read_file: tool({
            description: "Read a text file from the workspace. Use a path relative to the project root.",
            inputSchema: z.object({
                path: z.string().describe("Relative file path")
            }),
            execute: async({path:p}) => executor.readFile(p)
        }),

        create_file: tool({
            description:
                "Stage creation of a new file (not written until the user approves).",
            inputSchema: z.object({
                path: z.string(),
                content: z.string(),
            }),
            execute: async ({ path: p, content }) => {
                const staged = executor.createFile(p, content)
                const followUp = await hooks.afterCreateFile?.(executor.normalizePath(p))
                return followUp ?? staged
            },
        }),

        modify_file: tool({
            description:
                "Stage a full-file replacement for an existing file (pending approval).",
            inputSchema: z.object({
                path: z.string(),
                content: z.string().describe("Complete new file contents"),
            }),
            execute: async ({ path: p, content }) => executor.modifyFile(p, content),
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
                "Read multiple files in a single tool call.",
            inputSchema: z.object({
                paths: z.array(z.string())
            }),
            execute: async ({ paths }) =>
                executor.readMultipleFiles(paths)
        }),

        grep: tool({
        description:
            "Search file contents using a text query.",
        inputSchema: z.object({
            root: z.string().default("."),
            query: z.string(),
            caseSensitive: z.boolean().default(false)
        }),
        execute: async (args) =>
            executor.grep(args)
        }),

        replace_in_file: tool({
        description:
            "Replace text inside a file while preserving the rest.",
        inputSchema: z.object({
            path: z.string(),
            search: z.string(),
            replace: z.string()
        }),
        execute: async ({path, search, replace}) =>
            executor.replaceInFile(path, search, replace)
        }),

        append_to_file: tool({
        description:
            "Append content to the end of a file.",
        inputSchema: z.object({
            path: z.string(),
            content: z.string()
        }),
        execute: async ({ path, content }) =>
            executor.appendToFile( path, content )
        }),

        insert_at_line: tool({
        description:
            "Insert content at a specific line.",
        inputSchema: z.object({
            path: z.string(),
            line: z.number(),
            content: z.string()
        }),
        execute: async ({path, line, content}) =>
            executor.insertAtLine(path, line, content)
        }),

        run_command: tool({
        description:
            "Run a command immediately and capture output.",
        inputSchema: z.object({
            command: z.string(),
            cwd: z.string().optional()
        }),
        execute: async ({command, cwd}) =>
            executor.runCommand(command, cwd)
        }),

        run_background_command: tool({
        description:
            "Start a long-running process.",
        inputSchema: z.object({
            command: z.string(),
            cwd: z.string().optional()
        }),
        execute: async (args) =>
            executor.runBackgroundCommand(args)
        }),

        git_status: tool({
        description:
            "Get git status.",
        inputSchema: z.object({}),
        execute: async () =>
            executor.gitStatus()
        }),

        git_diff: tool({
        description:
            "Get git diff.",
        inputSchema: z.object({
            staged: z.boolean().default(false)
        }),
        execute: async ({ staged }) =>
            executor.gitDiff(staged)
        }),

        git_log: tool({
        description:
            "Get recent commits.",
        inputSchema: z.object({
            limit: z.number().default(20)
        }),
        execute: async ({ limit }) =>
            executor.gitLog(limit)
        }),

        run_tests: tool({
        description:
            "Run the project's test suite.",
        inputSchema: z.object({
            filter: z.string().optional()
        }),
        execute: async ({ filter }) =>
            executor.runTests(filter)
        }),

        run_test_file: tool({
        description:
            "Run a specific test file.",
        inputSchema: z.object({
            path: z.string()
        }),
        execute: async ({ path }) =>
            executor.runTestFile(path)
        }),

        lint_project: tool({
        description:
            "Run linting.",
        inputSchema: z.object({}),
        execute: async () =>
            executor.lintProject()
        }),

        format_project: tool({
        description:
            "Run formatting.",
        inputSchema: z.object({}),
        execute: async () =>
            executor.formatProject()
        }),

        detect_framework: tool({
        description:
            "Detect framework, package manager and language.",
        inputSchema: z.object({}),
        execute: async () =>
            executor.detectFramework()
        }),

        read_package_json: tool({
        description:
            "Read package.json summary.",
        inputSchema: z.object({}),
        execute: async () =>
            executor.readPackageJson()
        }),

        web_search: tool({
        description:
            "Search the web for documentation.",
        inputSchema: z.object({
            query: z.string()
        }),
        execute: async ({ query }) =>
            executor.webSearch(query)
        }),

        fetch_url: tool({
        description:
            "Fetch and summarize a URL.",
        inputSchema: z.object({
            url: z.string()
        }),
        execute: async ({ url }) =>
            executor.fetchUrl(url)
        }),

        create_plan: tool({
        description:
            "Create a task execution plan.",
        inputSchema: z.object({
            goal: z.string()
        }),
        execute: async ({ goal }) =>
            executor.createPlan(goal)
        }),

        get_plan: tool({
        description:
            "Retrieve current plan.",
        inputSchema: z.object({}),
        execute: async () =>
            executor.getPlan()
        }),

        show_pending_changes: tool({
        description:
            "Show staged file operations (read-only display - does NOT apply changes). Use this to review what would be modified before user approval.",
        inputSchema: z.object({}),
        execute: async () =>
            executor.showPendingChanges()
        }),

        // ❌ REMOVED: apply_changes
        // This tool has been removed because applying changes must go through
        // the runApprovalFlow() in orchestrator.ts which requires explicit
        // user approval. Agents should never auto-apply changes without
        // user consent.

        discard_changes: tool({
        description:
            "Discard all staged operations (useful if you want to start over).",
        inputSchema: z.object({}),
        execute: async () =>
            executor.discardChanges()
        }),

        execute_shell: tool({
            description:
                "Queue a shell command to run in the workspace after user approval. Use with care.",
            inputSchema: z.object({
                command: z.string().describe("Single command; runs with shell: true"),
            }),
            execute: async ({ command }) => executor.queueShell(command),
        }),

        list_skills: tool({
            description:
                "List absolute paths to SKILL.md files under configured skill directories (Cursor / Claude).",
            inputSchema: z.object({}),
            execute: async () => executor.listSkills(),
        }),

        read_skill: tool({
            description:
                "Read a SKILL.md file. Path must be absolute and under skill roots, or use a path returned by list_skills.",
            inputSchema: z.object({
                path: z.string(),
            }),
            execute: async ({ path: p }) => executor.readSkill(p),
        }),
    }
}
