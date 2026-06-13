# Astra CLI — Complete Technical Documentation

> **Version:** 0.1.5
> **Runtime:** Bun (>=1.0.0)
> **License:** MIT
> **Package name:** `astrabot`
> **Bin name:** `astra`

---

## Table of Contents

1. [What Is Astra CLI?](#1-what-is-astra-cli)
2. [Feature Overview](#2-feature-overview)
3. [Prerequisites & Installation](#3-prerequisites--installation)
4. [Environment Variables & Configuration](#4-environment-variables--configuration)
5. [Commands](#5-commands)
6. [Interaction Modes — Deep Dive](#6-interaction-modes--deep-dive)
   - 6.1 [Wakeup & Top-Level Mode Selection](#61-wakeup--top-level-mode-selection)
   - 6.2 [CLI Mode Loop](#62-cli-mode-loop)
   - 6.3 [Agent Mode](#63-agent-mode)
   - 6.4 [Ask Mode](#64-ask-mode)
   - 6.5 [Plan Mode](#65-plan-mode)
   - 6.6 [Multi-Agent Mode](#66-multi-agent-mode)
7. [Tool System — Complete Reference](#7-tool-system--complete-reference)
8. [Staging & Approval Pipeline](#8-staging--approval-pipeline)
9. [Action Tracking System](#9-action-tracking-system)
10. [Session Management](#10-session-management)
11. [Multi-Agent Orchestration](#11-multi-agent-orchestration)
12. [Sandbox Mode & Secure Storage](#12-sandbox-mode--secure-storage)
13. [Skills System](#13-skills-system)
14. [Error Logging](#14-error-logging)
15. [Project Structure — Every File](#15-project-structure--every-file)
16. [Dependencies](#16-dependencies)
17. [Roadmap](#17-roadmap)

---

## 1. What Is Astra CLI?

Astra CLI (package name: `astrabot`) is an **AI-native development companion** that brings **agentic coding capabilities** to your terminal. Rather than being a simple chatbot or code-completion engine, Astra gives a Large Language Model (LLM) **full programmatic access** to your filesystem, shell, and the web — all gated behind a **carefully designed approval system** that keeps the human developer in control at all times.

It is built on **[Bun](https://bun.sh)** (a fast JavaScript/TypeScript runtime), uses **[OpenRouter](https://openrouter.ai)** as its LLM provider (supporting any model available on that platform), and leverages the **[Vercel AI SDK](https://sdk.vercel.ai)**'s `ToolLoopAgent` for autonomous, multi-step tool-driven workflows.

Astra provides **five distinct interaction modes** within a CLI interface:

| Mode | Purpose | Mutations? |
|------|---------|------------|
| **Auto** | LLM-powered intent router — automatically picks the best mode | Depends on route |
| **Agent** | Autonomous multi-step code modifications | Yes (staged) |
| **Ask** | Read-only Q&A about your codebase | No (except optional save) |
| **Plan** | Structured multi-step planning with selective execution | Yes (staged) |
| **Multi-Agent** | Multiple agents working together in configurable topologies | Yes (staged) |

A standalone **arcade** with multiple mini-games (HTML canvas) is also included.

---

## 2. Feature Overview

### Core Features

- **Five interaction modes** — Auto, Agent, Ask, Plan, and Multi-Agent, each tailored to a different development workflow
- **Streaming output** — all modes use `agent.stream()` with real-time chunk display and live token telemetry (↑input / ↓output counters, tok/s velocity)
- **Full filesystem access** — read, create, modify, and delete files and directories through an AI agent, all via an in-memory staging overlay
- **Shell execution** — queue arbitrary shell commands for agent-driven workflows (sync and background)
- **Git integration** — `git status`, `git diff`, and `git log` tools for repository awareness
- **Project-aware tooling** — run tests, linting, formatting, and framework detection by reading `package.json`
- **Web research** — built-in web search (via DuckDuckGo curl or Firecrawl), URL crawling, and HTTP fetching
- **Staging-first mutations** — no file is ever written or deleted without explicit user approval; all changes are staged in memory and presented for review before apply
- **Per-file diff review** — granular approval flow with unified diffs so you can inspect exactly what changed
- **Skill system** — discover and load `SKILL.md` files from built-in skills (`.skills/`), Cursor (`~/.cursor/skills-cursor`), and Claude (`~/.claude/skills`) skill directories, plus custom directories via `SKILLS_DIRS` env var
- **Configurable safety** — exclude patterns (e.g., `node_modules`, `.git`, `dist`, `build`, `.next`, `*.log`, `.env*`), file size limits (default 1 MB), and per-tool permission toggles per agent role
- **Session management** — sessions are persisted to disk with context summaries, enabling resumption after interruption. In-memory cache layer for fast reads/writes.
- **Session tools** — `session_status`, `session_search`, and `session_resume_context` built-in tools the agent can call to recall previous work
- **Rich terminal UI** — interactive prompts via `@clack/prompts`, markdown rendering in the terminal via `marked` + `marked-terminal`, a figlet ASCII banner on startup, animated spinners with live token telemetry and elapsed time, streaming output display, and colored logging
- **Multi-model support** — per-agent model override in Multi-Agent mode (different agents can use different LLMs)
- **Retry on failure** — configurable retry logic for flaky AI provider calls and multi-agent step failures
- **Sandbox mode** — optional secure execution environment with OS keychain credential storage and HMAC-signed server communication
- **Cross-platform installers** — automated setup scripts for Linux/macOS (`install.sh`) and Windows (`install.bat`)
- **Centralised error logging** — rotating log file at `~/.astra/logs/astra.log` with ring buffer for post-mortem debugging

---

## 3. Prerequisites & Installation

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| [Bun](https://bun.sh) | >= 1.0.0 | Runtime and package manager |
| [OpenRouter](https://openrouter.ai) API key | — | LLM provider access (required) |
| [Firecrawl](https://www.firecrawl.dev/) API key | — | Web search and crawling (optional) |

### Installation Options

#### Option 1: Cross-Platform Installer (Recommended)

- **Linux/macOS:** `bash install/install.sh`
- **Windows:** Run `install/install.bat`

The installers automatically detect and install Node.js, Bun, and the `astrabot` npm package, then configure your PATH.

#### Option 2: npm (Global)

```bash
npm install -g astrabot
```

#### Option 3: npx (No Installation)

```bash
npx astrabot setup
npx astrabot wakeup
```

#### Option 4: From Source

```bash
git clone <repository-url>
cd Astra
bun install
bun run index.ts setup
```

---

## 4. Environment Variables & Configuration

Astra is configured entirely through environment variables, loaded from `~/.astra/.env` (created by `astra setup` or manually).

### Required Variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM access |
| `OPENROUTER_DEFAULT_MODEL` | Model identifier (e.g., `anthropic/claude-3.5-sonnet`) |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `FIRECRAWL_API_KEY` | Enables `web_search`, `web_crawl`, and `fetch_url` tools via the Firecrawl SDK (otherwise falls back to curl-based DuckDuckGo search) |
| `SKILLS_DIRS` | Semicolon-separated paths to additional custom skill directories (e.g., `/path/to/skills;/another/dir`) |

### Sandbox Variables

| Variable | Description |
|----------|-------------|
| `ASTRA_SANDBOX_ENABLED` | Set to `true` when sandbox mode is active (managed by `astra sandbox`, not manually) |

> **Note:** In sandbox mode, the API key is stored in the OS keychain (or encrypted file), **not** in `~/.astra/.env`. Only the boolean flag `ASTRA_SANDBOX_ENABLED=true` is stored in the config file.

### Retry Configuration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASTRA_AGENT_RETRY_ENABLED` | `true` | Enable automatic retry for agent AI calls |
| `ASTRA_AGENT_RETRY_MAX` | `3` | Maximum retry attempts for agent calls |
| `ASTRA_AGENT_RETRY_PROGRESS` | `true` | Show retry progress in the terminal |
| `ASTRA_MULTI_RETRY_ENABLED` | `true` | Enable retry for multi-agent steps |
| `ASTRA_MULTI_RETRY_MAX` | `2` | Maximum retry attempts for multi-agent steps |
| `ASTRA_MULTI_RETRY_BACKOFF` | `2` | Backoff multiplier for multi-agent retries |

### Config File Locations

| Path | Purpose |
|------|---------|
| `~/.astra/.env` | Environment variables (API keys, model, optional settings) |
| `~/.astra/sessions/index.json` | Session store (persisted conversation history) |
| `~/.astra/sessions/<session-id>.json` | Individual session action logs |
| `~/.astra/.secure/sandbox.enc` | Encrypted sandbox credentials (if OS keychain unavailable) |
| `~/.astra/logs/astra.log` | Rotating error log file (5 MiB max, 3 backups) |

### Setup Wizard (`astra setup`)

Running `astra setup` launches an interactive configuration wizard that:
1. Prompts for OpenRouter API key
2. Fetches available models from OpenRouter and lets you search and select one with pricing
3. Optionally prompts for Firecrawl API key
4. Optionally prompts for custom skills directories
5. Saves all values to `~/.astra/.env`, merging with existing values

### TypeScript Configuration (`tsconfig.json`)

- Target: `ESNext`
- Module: `Preserve` (Bun-native resolution)
- Module resolution: `bundler`
- Strict mode enabled
- Types: `bun`
- Key strict flags: `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `noImplicitOverride`
- Looser flags: `noUnusedLocals: false`, `noUnusedParameters: false`

---

## 5. Commands

Astra uses **Commander** (`commander@^15.0.0`) for CLI argument parsing.

### `astra` (Default Action — Auto-Router)

```
astra [prompt...]
```

The default action (no subcommand) uses Commander's variadic `[prompt...]` argument:

- **With prompt:** `astra "fix the bug"` → joins the words, passes the string to `runAutoMode()` as a pre-captured goal, skips the interactive goal prompt, and runs the auto-router silently.
- **Without prompt:** `astra` → falls back to `runWakeup()`, showing the animated banner and top-level mode selection.

This is the fastest way to get work done: `astra "your task here"` classifies intent and dispatches to the right mode automatically.

### `astra wakeup`

```bash
astra wakeup
```

Displays the ASCII art banner and presents a top-level mode selection menu:
- **CLI** → enters the CLI mode loop (Auto / Agent / Plan / Ask / Multi-Agent)
- **Telegram** → placeholder (not yet implemented)
- **Exit** → quits

Before the mode menu, it checks for a resumable (interrupted) session and offers to resume it.

### `astra setup`

```bash
astra setup
```

Interactive configuration wizard for API keys and settings.

### `astra sandbox`

```bash
astra sandbox
```

Activates sandbox mode — a secure execution environment. The command:
1. Connects to the sandbox server (default: `https://astra-server-oh6s.onrender.com`)
2. Performs a health check
3. Bootstraps with the server (exchanges auth token)
4. Stores the API key in OS keychain (or encrypted fallback file)
5. Sets `ASTRA_SANDBOX_ENABLED=true` in config

If sandbox mode is already active, offers to reconfigure.

### `astra play`

```bash
astra play
```

Launches the arcade easter egg — an interactive game selector (Retro Snake Classic, Neon Brick Breaker, Neon Pong, Cosmic Drifter). Spawns a local Bun HTTP server on port `4321` and opens the game in the default browser.

### `astra reset`

```bash
astra reset
```

Interactive danger-zone command that completely purges all stored configurations, sessions, and credentials from `~/.astra/`. Requires explicit confirmation.

---

## 6. Interaction Modes — Deep Dive

### 6.1 Wakeup & Top-Level Mode Selection

**File:** `tui/wakeup.ts`

1. A spinner renders the ASCII banner using `figlet` with the **"ANSI Shadow"** font (falls back to **"Standard"** if unavailable)
2. The banner is printed in **gold/enamel** color (`#ffd000`)
3. Version and tagline "AI-native development companion" are shown
4. The screen is cleared and re-rendered in a `while(true)` loop
5. **Session resume check:** Before the mode menu, `getResumableSession(cwd)` checks `~/.astra/sessions/index.json` (served from the in-memory cache) for the most recent session. If it has `status === "interrupted"`, the user is offered to resume it. On resume, the session ID is stored in `globalThis.__ASTRA_RESUME_SESSION__` and `runCliMode()` is called directly.
6. The mode selection prompt uses `@clack/prompts`' `select()` with options: **CLI**, **Telegram**, **Exit**
7. **Default action without subcommand:** When `astra` is run without a subcommand, Commander's default action handler checks for `[prompt...]` arguments. If a prompt is provided, it runs `runAutoMode(combinedGoal)` directly. If not, it falls back to `runWakeup()`.

### 6.2 CLI Mode Loop

**File:** `modes/cli.ts`

An infinite `while(true)` loop presents a `@clack/prompts` `select()` with:
- **Auto Mode** → calls `runAutoMode()`
- **Agent Mode** → calls `runAgentMode()`
- **Plan Mode** → calls `runPlanMode()`
- **Ask Mode** → calls `runAskMode()`
- **Multi-Agent Mode** → calls `runMultiAgentMode()`
- **⬅ Back to main menu** → `return` to the wakeup loop
- Ctrl+C (cancel) also returns to wakeup
- Any unrecognized mode prints "This mode is not implemented yet"

Each mode runs to completion before the loop renders the menu again.

### 6.3 Agent Mode

**File:** `modes/agent/orchestrator.ts`

Agent mode is the primary autonomous coding mode. Here is the exact flow:

#### Step 1: Goal Input
- User is prompted: "What would you like the agent to do for you?"
- Placeholder: "Concrete task for this codebase..."
- Cancel or empty input returns to CLI menu

#### Step 2: Initialization
- A `defaultAgentConfig()` is created:
  - `codebasePath`: `process.cwd()`
  - `maxFileSizeToRead`: 1 MB
  - `excludePatterns`: `['node_modules', '.git', 'dist', 'build', '.next', '*.log', '.env*']`
  - All tool permissions enabled
- A new `ActionTracker` and `ToolExecutor` are instantiated

#### Step 3: File Creation Approval Hook
- An `approveCreatedFile` callback is defined that:
  1. Runs the single-file approval flow (`runApprovalFlow` with `skipBatchPrompt: true`)
  2. If rejected: discards the staged file and returns a message telling the agent not to rely on it
  3. If approved: applies via `executor.applyApprovedFromTracker()`, or throws on error

#### Step 4: Session Begin
- `beginSession()` is called with workspace path, mode "agent", and the goal
- If resuming (`__ASTRA_RESUME_SESSION__` is set), the previous session's context summary is loaded and injected into instructions

#### Step 5: Agent Construction
- A `ToolLoopAgent` (Vercel AI SDK) is created with:
  - Model from `getAgentModel()` (OpenRouter provider, or sandbox model if sandbox mode is active)
  - `stopWhen: stepCountIs(50)` (max 50 tool-calling steps)
  - Instructions: workspace root + "All mutations are staged until approval." + optional context summary
  - Tools: all `createAgentTools()` + `createSessionTools()`

#### Step 6: Agent Execution (with retry)
- Wrapped in `withSpinner()` showing "Agent is working on your task..."
- The agent uses `agent.stream()` for real-time output with token telemetry
- The agent's `onStepFinish` callback logs each tool call in **green** with the tool name in bold and a human-readable description
- On error: `promptToRetryAiCall()` offers to retry. If declined, the session is marked **interrupted** and all staged changes are discarded.

#### Step 7: Final Response
- If the agent produced text, it's rendered as markdown in the terminal via `renderTerminalMarkdown()`

#### Step 8: Approval Flow
- `runApprovalFlow(tracker)` presents all staged changes
- If no changes approved → session ends, all discarded
- If changes approved → proceed to step 9

#### Step 9: Apply Changes
- `executor.applyApprovedFromTracker()` replays all approved actions:
  1. Creates folders (with `mkdirSync recursive`)
  2. For each file path, takes the **last** action (create/modify/delete) and applies it
  3. Executes queued shell commands via `spawnSync`
- Errors are collected and displayed

#### Step 10: Session End
- `endSession()` extracts touched files and generates an LLM summary of the session
- All staged changes are discarded from the overlay

### 6.4 Ask Mode

**File:** `modes/ask/orchestrator.ts`

A read-only Q&A interface. Flow:

#### Step 1: Question Input
- "What would you like to ask?"

#### Step 2: Read-Only Configuration
- `AgentConfig` is copied from defaults with all mutation permissions **disabled**:
  - `allowShellExecution: false`
  - `allowFileModification: false`
  - `allowFileCreation: false`
  - `allowFolderCreation: false`

#### Step 3: Tool Set
- `createReadOnlyTools()` strips all mutation tools from `createAgentTools()`:
  - **Removed:** `create_file`, `modify_file`, `delete_file`, `create_folder`, `replace_in_file`, `append_to_file`, `insert_at_line`, `run_command`, `run_background_command`, `execute_shell`, `run_tests`, `run_test_file`, `lint_project`, `format_project`
  - **Kept:** All read-only tools (`read_file`, `list_files`, `search_files`, `analyze_codebase`, `grep`, `read_multiple_files`, `read_package_json`, `detect_framework`, `git_status`, `git_diff`, `git_log`, `list_skills`, `read_skill`, `show_pending_changes`, `create_plan`, `get_plan`)
  - Plus web tools via `createWebTools()` (if Firecrawl key is set)
  - Plus session tools via `createSessionTools()`

#### Step 4: Agent Execution
- `ToolLoopAgent` with `stopWhen: stepCountIs(25)`
- Spinner message: "Thinking..."
- Tool calls logged in **cyan** with `-` prefix (vs green `*` in Agent mode)
- Uses `agent.stream()` for real-time output

#### Step 5: Display Answer
- Response rendered as markdown in terminal

#### Step 6: Optional Save
- User is asked: "Do you want to save this response to a .md file?"
- If yes, prompted for filename (must end with `.md`, no path separators)
- **File creation is temporarily enabled** for this one file, the Q&A is formatted as markdown with `## Question` and `## Answer` headings
- The create goes through the approval flow
- After creation attempt, file creation is disabled again

### 6.5 Plan Mode

**File:** `modes/plan/orchestrator.ts`

Breaks a high-level goal into a structured, executable plan.

#### Step 1: Goal Input
- "What is your goal?"

#### Step 2: Plan Generation
- `generatePlan(goal)` is called:
  1. Creates a read-only `ToolExecutor` (all mutation tools stripped)
  2. Web tools from `createWebTools()` (Firecrawl) are added if key is available
  3. A `generateText()` call is made with `Output.object({ schema: planSchema })` where the schema expects:
     ```typescript
     {
       researchSummary?: string,
       steps: Array<{
         title: string,
         description: string,
         hints?: string[],
         complexity?: 'low' | 'medium' | 'high'
       }> // min 1, max 20
     }
     ```
  4. Steps are assigned IDs (`step-1`, `step-2`, ...)

#### Step 3: Display Plan
- `printPlan()` shows the research summary and numbered steps with complexity color tags:
  - `low` → green
  - `medium` → yellow
  - `high` → red

#### Step 4: Step Selection
- `selectSteps()` uses `@clack/prompts` `multiselect()` — all steps pre-selected, space toggles, enter confirms

#### Step 5: Execution
- User confirms: "Execute N step(s)"
- Each selected step runs as an **independent** `ToolLoopAgent` (50 steps max each) with the full Agent tool set + web tools + session tools
- Each agent receives: `Goal: ...\nStep: ...\nStep description: ...`
- Tool calls logged in green `*`
- After each step's agent responds, its text output is rendered as markdown

#### Step 6: Approval & Apply
- Single `runApprovalFlow(tracker)` for **all** changes across **all** steps
- Approved changes applied via `executor.applyApprovedFromTracker()`

### 6.6 Multi-Agent Mode

**File:** `modes/multi/orchestrator.ts`

Coordinates multiple AI agents working together.

#### Step 1: Workflow Design
- **AI-powered workflow designer** — the LLM analyzes your goal and either selects a pre-built template or designs a custom agent team
- **Use predefined template** → choose from 6 templates
- **Create custom workflow** → interactive builder

#### Step 2: Validation
- `WorkflowBuilder.validate()` runs 10+ validation checks (see §11)

#### Step 3: Execution
- `MultiAgentOrchestrator.execute()` dispatches based on strategy (see §11)

#### Step 4: Results Display
- Summary with status, duration, pool stats, execution results

#### Step 5: Approval Flow
- Per-agent review groups with diff viewing
- Approved changes applied via each agent's own `ToolExecutor`

---

## 7. Tool System — Complete Reference

### Architecture

The tool system has **two layers**:

1. **`ToolExecutor`** (`modes/agent/tool-executor.ts`) — The core execution engine. All filesystem operations, shell commands, and skill lookups are implemented here. Mutations are staged in an in-memory overlay (`Map<string, string>` for file contents, `Set<string>` for deletions) and never touch disk until explicitly approved.

2. **`createAgentTools()`** (`modes/agent/agent-tools.ts`) — Wraps every `ToolExecutor` method as a Vercel AI SDK `tool()` with a Zod input schema, making them available to the LLM agent.

3. **`createWebTools()`** (`modes/plan/web-tools.ts`) — Firecrawl-based web search, crawl, and fetch tools.

4. **`createSessionTools()`** (`session/session-tools.ts`) — `session_status`, `session_search`, and `session_resume_context` tools injected into every agent.

### Complete Tool List

| Tool Name | Zod Input Schema | Return Type | Description |
|-----------|-----------------|-------------|-------------|
| `read_file` | `{ path: string }` | `string` | Read a text file from the workspace |
| `create_file` | `{ path: string, content: string }` | `string` | Stage creation of a new file (pending approval) |
| `modify_file` | `{ path: string, content: string }` | `string` | Stage a full-file replacement (pending approval) |
| `delete_file` | `{ path: string }` | `string` | Stage deletion of a file (pending approval) |
| `create_folder` | `{ path: string }` | `string` | Stage creation of a directory tree (pending approval) |
| `list_files` | `{ path: string, recursive?: boolean }` | `string` | List files and directories, sorted alphabetically |
| `search_files` | `{ root: string, pattern: string, content_contains?: string }` | `string` | Find files matching a glob pattern with optional content filter |
| `analyze_codebase` | `{ path?: string }` | `string` | Summarize structure: "Files: N | Directories: N" |
| `read_multiple_files` | `{ paths: string[] }` | `Record<string, string>` | Read multiple files in one call |
| `grep` | `{ root?: string, query: string, caseSensitive?: boolean }` | `string` | Text search across files, returns `file:line: match` lines |
| `replace_in_file` | `{ path: string, search: string, replace: string }` | `string` | Replace text inside a file (pending approval) |
| `append_to_file` | `{ path: string, content: string }` | `string` | Append content to end of a file (pending approval) |
| `insert_at_line` | `{ path: string, line: number, content: string }` | `string` | Insert content at a specific line number (pending approval) |
| `run_command` | `{ command: string, cwd?: string }` | `{ exitCode, stdout, stderr }` | Run a shell command synchronously, capture output (10 MB buffer) |
| `run_background_command` | `{ command: string, cwd?: string }` | `string` | Start a detached background process |
| `git_status` | `{}` | `string` | `git status --short` |
| `git_diff` | `{ staged?: boolean }` | `string` | `git diff` or `git diff --staged` |
| `git_log` | `{ limit?: number }` | `string` | `git log --oneline -N` (default 20) |
| `run_tests` | `{ filter?: string }` | `{ exitCode, stdout, stderr }` | Auto-detects test runner from `package.json` (npm test, vitest, or jest) |
| `run_test_file` | `{ path: string }` | `{ exitCode, stdout, stderr }` | Run a specific test file |
| `lint_project` | `{}` | `{ exitCode, stdout, stderr }` | Auto-detects: `npm run lint` or `npx eslint .` |
| `format_project` | `{}` | `{ exitCode, stdout, stderr }` | Auto-detects: `npm run format` or `npx prettier --write .` |
| `detect_framework` | `{}` | `{ framework: string }` | Detects from `package.json` deps: Next.js, React, Vue, Svelte, or Node.js |
| `read_package_json` | `{}` | `string` | Reads and summarizes `package.json` (name, version, scripts, deps) |
| `web_search` | `{ query: string }` | `string` | **Two implementations:** (a) In `ToolExecutor`: curl DuckDuckGo HTML, strips tags, returns ~4000 chars (b) In `createWebTools`: Firecrawl SDK search with title/url/snippet, up to 5 results |
| `fetch_url` | `{ url: string }` | `string` | **Two implementations:** (a) In `ToolExecutor`: curl with 15s timeout, strips HTML, ~8000 chars (b) In `createWebTools`: native `fetch()`, returns up to 16,000 chars with HTTP status |
| `web_crawl` | `{ url: string }` | `string` | Firecrawl SDK `scrape()` returning markdown (only in `createWebTools`) |
| `create_plan` | `{ goal: string }` | `string` | Create an in-memory plan object |
| `get_plan` | `{}` | `string` | Retrieve the current plan as JSON |
| `show_pending_changes` | `{}` | `ActionLog[]` | Return pending mutations from action tracker |
| `discard_changes` | `{}` | `string` | Clear the entire staging overlay |
| `execute_shell` | `{ command: string }` | `string` | Queue a shell command for post-approval execution |
| `list_skills` | `{}` | `string` | List absolute paths to `SKILL.md` files from skill directories |
| `read_skill` | `{ path: string }` | `string` | Read a specific `SKILL.md` file (path must be within skill roots) |
| `session_status` | `{ limit?: number }` | `string` | Show recent sessions with mode, goal, and status (limit 1–20, default 5) |
| `session_search` | `{ query: string, limit?: number }` | `string` | Search previous sessions by keyword, file name, or goal |
| `session_resume_context` | `{ session_id: string, transcript_turns?: number }` | `string` | Get full context of a previous session (transcript_turns 1–30, default 10) |

### Tool-to-Executor Mapping

Each tool's `execute` function calls the corresponding `ToolExecutor` method directly. The `create_file` tool has special handling: it passes an `afterCreateFile` hook from the orchestrator that runs the single-file approval flow immediately during agent execution (so files are created on-the-fly during the agent loop, not batched at the end).

### Staging Overlay Internals

`ToolExecutor` maintains three internal data structures:

```typescript
private overlay = new Map<string, string>()  // staged file contents
private deleted = new Set<string>()          // staged deletions
private appliedActionIds = new Set<string>() // already-applied action IDs
```

- `createFile()`: removes from `deleted`, adds to `overlay`
- `modifyFile()`: adds to `overlay` (reads `before` from overlay or disk)
- `deleteFile()`: removes from `overlay`, adds to `deleted`
- `getEffectiveText()`: checks `deleted` → `overlay` → disk, in that order
- `discardStagedPath()`: removes from both `overlay` and `deleted`

---

## 8. Staging & Approval Pipeline

This is the **safety backbone** of Astra. No mutation ever touches the disk without explicit user consent.

### Phase 1: Staging (during agent execution)

When the agent calls a mutation tool (`create_file`, `modify_file`, `delete_file`, `create_folder`, `execute_shell`):
1. The `ToolExecutor` validates path safety (must be within workspace root, not excluded)
2. The operation is recorded in the in-memory overlay
3. An `ActionLog` entry is created with `status: "pending"` and appended to the `ActionTracker`
4. The tool returns a message like "Staged new file: path/to/file.ts"

### Phase 2: Approval Flow (`modes/agent/approval.ts`)

After the agent completes all its steps:

1. `tracker.getPendingMutations()` collects all actions with `status: "pending"` where type is mutation-capable (`file_create`, `file_modify`, `file_delete`, `folder_create`, `tool_execute`)
2. If no pending mutations → returns `false` immediately with a dim message
3. User is prompted with three options:
   - **"Approve and apply all"** → marks all as `"approved"`, returns `true`
   - **"Review one by one"** → groups pending by file path (see below), iterates with accept/reject/diff per group
   - **"Cancel"** → marks all as `"rejected"`, returns `false`
4. Ctrl+C during review also rejects all

#### Review Groups

`groupPending()` sorts pending actions into `ReviewGroup[]`:
- File mutations are grouped by path, ordered alphabetically
- Multiple actions on the same path get a combined `composeBeforeAfter()` diff
- Folder creation groups show no diff
- Shell commands are shown individually as "Shell: <command>"

#### Diff Generation (`modes/agent/diff-view.ts`)

- `formatPatch()`: Uses `diff.createTwoFilesPatch()` with context of 3 lines
- `composeBeforeAfter()`: For a sorted list of actions on one path:
  - First action's `before` (empty if `file_create`)
  - Last action's `after` (empty if `file_delete`)

### Phase 3: Application (`applyApprovedFromTracker`)

1. **Folder creation** first (sorted by time)
2. **File operations** sorted by timestamp, grouped by path → only the **last** action per path is applied (the latest staged state)
   - `file_delete` → `fs.rmSync()`
   - `file_create`/`file_modify` → `fs.mkdirSync()` for parent dir + `fs.writeFileSync()`
3. **Shell commands** executed via `spawnSync` with 16 MB buffer
4. Action IDs tracked in `appliedActionIds` to prevent double-application
5. Returns `{ errors: string[] }`

---

## 9. Action Tracking System

**File:** `modes/agent/action-tracker.ts`

The `ActionTracker` maintains an **append-only log** of every action the agent takes.

### Data Structures

```typescript
type ActionType = 'file_create' | 'file_modify' | 'file_delete' | 'folder_create' | 'code_analysis' | 'tool_execute'
type ActionStatus = 'pending' | 'executed' | 'approved' | 'rejected'

interface ActionLog {
    id: string              // auto-generated: "action_0", "action_1", ...
    timestamp: Date
    type: ActionType
    path: string            // file path or "shell" or "skills" or "web"
    details: {
        before?: string     // file content before mutation
        after?: string      // file content after mutation
        toolName?: string
        toolResult?: string
        error?: string
        command?: string    // for shell executions
    }
    status: ActionStatus
    userApproved?: boolean
}
```

### Key Methods

| Method | Description |
|--------|-------------|
| `log(entry)` | Append a new action, auto-assigns `action_N` ID and current timestamp unless overridden |
| `getActions()` | Returns the full readonly array |
| `getPendingMutations()` | Filters to mutation-type actions with `status === "pending"` |
| `getPendingMutationsForPath(path)` | Filters pending mutations to a specific path |
| `updateStatus(id, status, userApproved?)` | Updates an action's status and optional approval flag |

### `isMutationType()` (`modes/agent/types.ts`)

```typescript
function isMutationType(t: ActionType): boolean {
    return t === 'file_create' || t === 'file_modify' ||
           t === 'file_delete' || t === 'folder_create' ||
           t === 'tool_execute'
}
```

`code_analysis` actions (read_file, search_files, etc.) are tracked for auditability but are never subject to approval (they're read-only and marked `"executed"` immediately).

---

## 10. Session Management

### Storage

**File:** `session/store.ts`

Sessions are stored in `~/.astra/sessions/index.json` as a JSON file with:
```typescript
interface SessionStoreIndex {
    version: number          // currently 2
    sessions: SessionEntry[]
    maxSessions: number      // 100
}
```

Writes are **atomic**: data is written to a temp file (`index.json.tmp_PID_TIMESTAMP`) then `renameSync`'d to prevent corruption.

### Cache Layer

**File:** `session/session-cache.ts`

The session store is wrapped by an in-memory cache (`SessionStoreCache`) that:
- Serves reads from memory (no file I/O) when clean
- Batches writes with a 500ms debounce interval
- Maintains an LRU entry cache for O(1) lookups by session ID
- Tracks dirty entries individually
- Provides `flushSync()` for critical shutdown paths
- Exposes a singleton via `getSessionStoreCache()` with `resetSessionStoreCache()` for testing

### Session Entry Schema

```typescript
interface SessionEntry {
    id: string               // e.g., "sess_m5k2x3_abc123"
    workspacePath: string    // absolute path
    mode: 'agent' | 'ask' | 'plan' | 'multi' | 'auto'
    status: 'active' | 'completed' | 'interrupted'
    summary: string          // LLM-generated summary
    lastGoal: string         // the user's prompt/goal
    allGoals: string[]       // all user goals tracked across the session
    touchedFiles: string[]   // unique file paths touched
    appliedActions: number
    rejectedActions: number
    createdAt: string         // ISO-8601
    updatedAt: string        // ISO-8601
    previousSessionId?: string  // chaining support
    transcript?: TranscriptMessage[]  // full conversation transcript (capped at 60)
    pendingTasks?: string[]  // incomplete tasks for resumption
    lastAgentResponse?: string  // last agent response (truncated to 2000 chars)
}
```

### Session Lifecycle

1. **Begin** (`beginSession`): Creates entry with `status: "active"`. If resuming, loads prior context summary.
2. **Active**: Agent performs work, actions accumulate in tracker.
3. **End** (`endSession`):
   - Collects touched files from tracker actions
   - Counts approved/rejected actions
   - **Generates an LLM summary** via `generateText()` (2-3 sentences focusing on goal, files changed, outcome). Falls back to a templated summary if LLM fails.
   - Updates entry to `status: "completed"`
4. **Interrupt** (`markSessionInterrupted`): Sets `status: "interrupted"` — shown on next `wakeup` as resumable.
5. **Resume**: On wakeup, if the most recent session is `"interrupted"`, offers to resume. Sets `globalThis.__ASTRA_RESUME_SESSION__` to the session ID.

### Session Tools

Injected into every agent:

| Tool | Description |
|------|-------------|
| `session_status` | Accepts optional `limit` (1–20, default 5). Shows recent sessions with ID, summary, and pending tasks. |
| `session_search` | Search previous sessions by keyword, file name, or goal across `lastGoal`, `summary`, `touchedFiles`, and `allGoals`. |
| `session_resume_context` | Takes `session_id` and optional `transcript_turns` (1–30, default 10). Returns full resumption context block. |

### Context Summary Format

```
[Previous Session Context]
Mode: agent
Last goal: Add unit tests for the user service
Summary: <LLM-generated>
Files touched: src/user.ts, src/user.test.ts, ...
Applied changes: 3 actions approved.
Discarded: 1 actions rejected.
```

This is injected into the agent's instructions on resume, giving it short-term memory.

---

## 11. Multi-Agent Orchestration

**Files:** `modes/multi/`

### Key Components

#### Agent Types (`modes/multi/types.ts`)

| Role | Permissions | Default Max Steps | Default Tools Count |
|------|------------|-------------------|---------------------|
| `researcher` | Read-only | 30 | 16 |
| `implementer` | Full read/write/execute | 50 | 26 |
| `reviewer` | Read + execute (no write) | 25 | 15 |
| `coordinator` | Read-only + planning | 20 | 8 |
| `custom` | Based on selected tools | 30 | Variable |

#### Orchestration Strategies

| Strategy | Behavior |
|----------|----------|
| **Sequential** | Agents run one after another. Each agent's output is visible to subsequent agents via `buildAgentPrompt()`. Supports retry on failure. |
| **Parallel** | Agents run in batches of `maxConcurrentAgents` (default 3). Each batch uses `Promise.all()`. Supports timeout per agent. |
| **Hierarchical** | Coordinator runs first (planning phase), then specialists execute. Coordinator's output is shared with all specialists. |
| **Collaborative** | Each agent takes a turn. After each turn, the agent's output is broadcast via `MessageBroker` to all other agents. Agents receive queued messages on their next turn. |
| **DAG** | Agents run as soon as all their dependencies are satisfied. Supports cycle detection and deadlock handling by skipping blocked agents. |

#### Message Broker (`message-broker.ts`)

A publish-subscribe system:
- `broadcast(msg)`: Sends to a specific agent or all (if `toAgentId` is undefined)
- `subscribe(agentId, callback)`: Registers a callback; returns an unsubscribe function
- `getMessagesFor(agentId)`: Filters messages (direct or broadcast)
- `getConversation(a1, a2)`: Filters to messages between two specific agents
- `replayMessages(agentId, callback)`: Async iteration over an agent's messages

#### Prompt Building

`buildAgentPrompt()` constructs a prompt with:
1. The workflow goal
2. The agent's role and description
3. Recent conversation history from other agents (last 20 messages, each truncated to 500 chars)
4. Any messages queued specifically for this agent

#### Multi-Agent Approval Flow

Separate from single-agent approval:
- Iterates through each agent's tracker separately
- Groups pending mutations by path per agent
- Shows agent ID header for each batch
- Applies via each agent's own `ToolExecutor` (each has its own overlay state)
- Errors are tagged with `[agentId]`

#### Workflow Builder (`workflow-builder.ts`)

Fluent API:
```typescript
new WorkflowBuilder(id, goal)
  .addResearcher(...)     // read-only, 16 tools
  .addImplementer(...)    // full write, 26 tools
  .addReviewer(...)       // execute-only, 15 tools
  .addCoordinator(...)    // plan-only, 8 tools
  .addCustomAgent(...)    // selective tools
  .withSequentialStrategy()
  .withParallelStrategy(maxConcurrent, timeout)
  .withHierarchicalStrategy()
  .withCollaborativeStrategy(timeout)
  .withDagStrategy(maxConcurrent, timeout)
  .withRetryOnFailure(maxRetries)
  .withFallbackAgents(ids)
  .withExpectedOutput(desc)
  .build()
```

#### Workflow Templates (`WorkflowTemplates`)

Six predefined templates:
1. `codeReviewWorkflow`: Sequential, retry(1) — Researcher → Implementer → Reviewer
2. `featureDevelopmentWorkflow`: DAG — Coordinator → Backend Dev + Frontend Dev → QA
3. `bugFixingWorkflow`: Sequential, retry(2) — Debug Agent → Fix Agent → Test Agent
4. `collaborativeResearchWorkflow`: Parallel (3 concurrent, 45s timeout) — Researcher 1 + 2 + 3
5. `securityAuditWorkflow`: DAG — Scanner → Static Auditor + Dependency Auditor → Report Coordinator
6. `fullStackFeatureWorkflow`: DAG — Architect → DB Dev + API Dev + UI Dev → Integration Tester

#### Validation Checks

The workflow builder performs 10+ validation checks:
- Workflow ID and goal are present
- At least one agent exists
- No duplicate agent IDs
- No empty agent names or IDs
- `maxSteps > 0` for each agent
- At least 1 tool per agent
- Valid strategy type
- Hierarchical strategy requires a coordinator
- Collaborative strategy with >1 agent needs a timeout
- Fallback agent IDs exist in the workflow
- Dependency references exist and are not self-referencing
- **DAG cycle detection** — detects and reports dependency cycles
- Warns if DAG strategy is used but no agent has dependencies

---

## 12. Sandbox Mode & Secure Storage

### Sandbox Configuration (`ai/sandbox-config.ts`)

Sandbox mode provides a secure, self-contained execution environment with the following security model:

- **NO secrets in config files** — API keys never touch `~/.astra/.env`
- **OS keychain storage** — Credentials live only in the OS keychain or encrypted fallback file
- **HMAC-signed requests** — All server communication uses SHA-256 HMAC with timestamps (replay protection)
- **Fixed model** — Sandbox mode uses `openrouter/owl-alpha`
- **Remote server** — Default sandbox server is `https://astra-server-oh6s.onrender.com` (deployed on Render)
- **Key caching** — In-memory cache with 5-minute TTL
- **Key validation** — Sanitizes and validates API keys (strips brackets/quotes, validates `sk-or-v1-*` format)

#### Activation Flow (`activateSandbox()`)

1. Health check the sandbox server
2. Generate a secure random auth token (32 bytes hex)
3. Bootstrap with the server (POST `/bootstrap` with auth token)
4. Server returns API key + signing secret
5. Validate and sanitize the API key
6. Store auth token, API key, and signing secret in secure storage
7. Set `ASTRA_SANDBOX_ENABLED=true` in config

#### Key Retrieval Flow (`getSandboxApiKey()`)

1. Check secure storage (persists across restarts)
2. Check memory cache (5-minute TTL)
3. Fetch fresh from server with HMAC-signed request (GET `/api/key`)
4. Validate, store in secure storage + memory cache

### Secure Storage (`ai/secure-storage.ts`)

Provides encrypted on-device storage for sensitive values:

- **Primary:** OS native credential managers via `keytar`
  - macOS: Keychain
  - Windows: Credential Vault
  - Linux: Secret Service (libsecret)
- **Fallback:** AES-256-GCM encrypted file at `~/.astra/.secure/sandbox.enc`
  - Encryption key derived from machine-id via `scrypt`
  - Device-bound (non-portable across machines)
  - File permissions restricted to owner-only (0o600)
  - Atomic writes (temp file + rename)

#### Stored Credentials

| Key | Purpose |
|-----|---------|
| `sandbox-api-key` | OpenRouter API key for sandbox mode |
| `sandbox-auth-token` | Auth token for sandbox server communication |
| `sandbox-signing-secret` | HMAC signing secret for request authentication |

---

## 13. Skills System

### Overview

Skills are `SKILL.md` files that provide structured guidance to the AI agent for specific tasks. They are discoverable via the `list_skills` and `read_skill` tools.

### Skill Directories

Skills are loaded from four sources (in order):

1. **Built-in:** `.skills/` directory in the project
2. **Cursor:** `~/.cursor/skills-cursor/` (if exists)
3. **Claude:** `~/.claude/skills/` (if exists)
4. **Custom:** Paths specified in `SKILLS_DIRS` env var (semicolon-separated)

### Built-in Skills

| Skill | File | Purpose |
|-------|------|---------|
| `code-review` | `.skills/code-review/SKILL.md` | Structured code review checklist (quality, error handling, security, performance, testing) with standardized output format |
| `documentation` | `.skills/documentation/SKILL.md` | Documentation standards and templates for README, CHANGELOG, and TSDoc comments |
| `git-workflow` | `.skills/git-workflow/SKILL.md` | Branch naming conventions, conventional commits, workflow steps, and pre-commit checklist |
| `project-setup` | `.skills/project-setup/SKILL.md` | Development environment setup guide with prerequisites and common issues |
| `test-runner` | `.skills/test-runner/SKILL.md` | Test execution patterns, result interpretation, and reporting format |

### Skill File Format

Each `SKILL.md` uses YAML frontmatter for metadata:

```markdown
---
name: skill-name
description: When to use this skill
---

# Skill Title

Instructions for the agent...
```

---

## 14. Error Logging

**File:** `core/logger.ts`

Astra includes a centralised error logging subsystem that captures errors from every subsystem and writes them to a rotating log file.

### Design Principles

- **Zero behaviour change** — `logAndThrow` / `logAndContinue` never swallow errors; they only *add* a side-effect (the file file write).
- **Fire-and-forget file I/O** — errors in the logger itself are caught and silently ignored so they can never crash the host.
- **Singleton** — importing from anywhere returns the same instance.
- **No new runtime dependencies** — uses only Node.js built-in `fs` module.

### Log Output

- **Location:** `~/.astra/logs/astra.log`
- **Max size:** 5 MiB per file
- **Backups:** 3 rotating backups (`.astra.log.1`, `.astra.log.2`, `.astra.log.3`)
- **Format:** One JSON object per line with `timestamp`, `level`, `source`, `message`, `stack`, and optional `context`.

### Public API

| Function | Description |
|----------|-------------|
| `logAndThrow(source, error, context?)` | Log an error and re-throw it so the caller's control-flow is unchanged. |
| `logAndContinue(source, error, context?)` | Log an error but do **not** throw — the caller decides what to do. |
| `logWarn(source, message, context?)` | Log a non-fatal warning. |
| `logInfo(source, message, context?)` | Log an informational message. |
| `errorLogger.onError(fn)` | Subscribe to every log entry in real time. Returns an unsubscribe function. |
| `errorLogger.getRecentEntries(count?)` | Return a copy of the in-memory ring buffer (default 50 entries). |
| `errorLogger.getLogFilePath()` | Return the absolute path of the active log file. |

---

## 15. Project Structure — Every File

```
astrabot/                           # Project root
├── index.ts                        # CLI entry point (Commander). Registers all commands including default action with `[prompt...]` argument.
├── package.json                    # Package config: name "astrabot", bin "astra", dependencies.
├── tsconfig.json                   # TS config: ESNext, strict, Bun types, bundler module resolution.
├── bun.lock                        # Bun lockfile.
├── .gitignore                      # Standard ignores + private/
├── .npmignore                      # Excludes tests, .github, sandbox_home, private from npm package.
│
├── bin/astra                       # Binary entry point (shebang: #!/usr/bin/env bun)
│
├── install/                        # Cross-platform installer scripts.
│   ├── README.md                   # Installer documentation
│   ├── install.sh                  # Linux/macOS Bash installer
│   └── install.bat                 # Windows Batch installer
│
├── ai/                             # AI provider configuration and utilities.
│   ├── index.ts                    # Public API re-exports.
│   ├── ai.config.ts                # OpenRouter provider setup and model resolution.
│   ├── config-loader.ts            # ~/.astra/.env management (load, read, save).
│   ├── auto-retry.ts               # withAiRetry() and createRetryableAiCall().
│   ├── retry-prompt.ts             # Manual retry prompt (promptToRetryAiCall).
│   ├── sandbox-config.ts           # Sandbox mode: activation, key retrieval, HMAC signing.
│   └── secure-storage.ts           # Encrypted credential storage (OS keychain + AES-256-GCM fallback).
│
├── core/                           # Core utilities.
│   ├── logger.ts                   # Centralised error logger (rotating file + ring buffer).
│   ├── logger/                     # (Reserved for future logger extensions)
│   ├── retry/                      # Core retry engine.
│   │   ├── index.ts                # Public API re-exports.
│   │   ├── retry-config.ts         # ErrorCategory enum, RetryConfig, presets.
│   │   ├── retry-engine.ts         # withRetry(), withRetryOrNull(), RetryPresets.
│   │   └── error-classifier.ts     # Error classification (status codes, patterns, codes).
│   └── tools/                      # (Reserved for future core tools)
│
├── tui/                            # Terminal UI utilities.
│   ├── terminal-md.ts              # Markdown-to-terminal rendering (marked + marked-terminal).
│   ├── spinner.ts                  # Animated spinner with metabolic rate engine, token telemetry, streaming.
│   └── wakeup.ts                   # ASCII banner with breathing animation + star field, mode selection.
│
├── modes/                          # All interaction modes.
│   ├── cli.ts                      # CLI mode loop (mode selection).
│   ├── auto.ts                     # Auto mode (LLM intent classification router).
│   ├── setup.ts                    # Interactive setup wizard.
│   │
│   ├── agent/                      # Agent mode.
│   │   ├── types.ts                # ActionType, ActionStatus, ActionLog, AgentConfig.
│   │   ├── action-tracker.ts       # ActionTracker (append-only log).
│   │   ├── agent-tools.ts          # createAgentTools() — 35+ Vercel AI SDK tools.
│   │   ├── tool-executor.ts        # ToolExecutor — staging overlay + all implementations.
│   │   ├── diff-view.ts            # Unified diff generation.
│   │   ├── approval.ts             # runApprovalFlow() — approve/review/reject.
│   │   └── orchestrator.ts         # runAgentMode() — full agent lifecycle.
│   │
│   ├── ask/                        # Ask mode.
│   │   └── orchestrator.ts         # runAskMode() — read-only Q&A.
│   │
│   ├── plan/                       # Plan mode.
│   │   ├── types.ts                # PlanStep, Plan interfaces.
│   │   ├── planner.ts              # generatePlan() — LLM-structured planning.
│   │   ├── selection.ts            # printPlan(), selectSteps().
│   │   ├── web-tools.ts            # Firecrawl-based web_search, web_crawl, fetch_url.
│   │   └── orchestrator.ts         # runPlanMode() — plan → select → execute → approve.
│   │
│   └── multi/                      # Multi-agent mode.
│       ├── types.ts                # Full type system (AgentRole, AgentConfig, etc.).
│       ├── agent-pool-manager.ts   # AgentPoolManager — registration, tracking, stats.
│       ├── message-broker.ts       # MessageBroker — pub-sub communication.
│       ├── multi-agent-orchestrator.ts  # MultiAgentOrchestrator — strategy dispatch.
│       ├── workflow-builder.ts     # WorkflowBuilder (fluent API) + WorkflowTemplates.
│       ├── examples.ts             # 8 example workflow demonstrations.
│       └── orchestrator.ts         # runMultiAgentMode() — AI workflow designer + execution.
│
├── session/                        # Session persistence and management.
│   ├── index.ts                    # Public API re-exports.
│   ├── store.ts                    # JSON file store (atomic writes, CRUD).
│   ├── session-manager.ts          # beginSession, endSession, auto-resume logic.
│   ├── session-context.ts          # Context summary building for resumption.
│   ├── session-tools.ts            # session_status, session_resume_context, session_search.
│   └── session-cache.ts            # In-memory cache layer (debounced writes, LRU entries).
│
├── .skills/                        # Built-in skills.
│   ├── code-review/SKILL.md        # Code review checklist and output format.
│   ├── documentation/SKILL.md      # Documentation standards and templates.
│   ├── git-workflow/SKILL.md       # Git conventions and workflow.
│   ├── project-setup/SKILL.md      # Development environment setup.
│   └── test-runner/SKILL.md        # Test execution and interpretation.
│
├── game/                           # Arcade easter egg.
│   ├── index.html                  # Retro Snake Classic (HTML5 Canvas).
│   ├── neon-breaker.html           # Neon Brick Breaker (HTML5 Canvas).
│   ├── neon-pong.html              # Neon Pong (HTML5 Canvas).
│   └── cosmic-drifter/             # Cosmic Drifter game asset.
│
├── tests/
│   └── cli.test.ts                 # CLI smoke tests.
│
└── private/                        # Internal planning documents (not shipped).
    ├── available-tools.md          # Complete tool reference.
    ├── future.md                   # Feature ideas and priority analysis.
    └── suggestions.md              # Gap analysis and improvement suggestions.
```

### Notable Excluded Files (.gitignore)

- `node_modules`, `dist`, `out`, `*.tgz`
- `coverage`, `*.lcov`
- `logs`, `*.log`, `report.*.json`
- `.env`, `.env.*.local`
- `.eslintcache`, `.cache`, `*.tsbuildinfo`
- `.idea`, `.DS_Store`
- `.astra/sessions/`
- `private`

---

## 16. Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@openrouter/ai-sdk-provider` | ^2.9.0 | OpenRouter as LLM provider for Vercel AI SDK |
| `@clack/prompts` | ^1.4.0 | Interactive terminal prompts (select, confirm, text, multiselect, spinner) |
| `@clack/core` | ^1.3.1 | Core prompt primitives (peer of @clack/prompts) |
| `@mendable/firecrawl-js` | ^4.25.1 | Firecrawl SDK for web search, crawling, and scraping |
| `commander` | ^15.0.0 | CLI argument parsing |
| `chalk` | ^5.6.2 | Terminal string styling (colors) |
| `figlet` | ^1.11.0 | ASCII art banner generation |
| `marked` | ^18.0.4 | Markdown parser |
| `marked-terminal` | ^7.3.0 | Markdown renderer for terminal output |
| `diff` | ^9.0.0 | Unified diff generation for file comparison |
| `dotenv` | ^17.4.2 | .env file loading |
| `docx` | ^9.7.1 | Microsoft Word document generation |
| `@types/node` | ^25.9.1 | Node.js type definitions |
| `@types/marked-terminal` | ^6.1.1 | Type definitions for marked-terminal |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/bun` | latest | Bun runtime type definitions |

### Peer Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5 | TypeScript compiler |

### Optional Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `keytar` | — | OS keychain access for secure credential storage (falls back to encrypted file) |

---

## 17. Roadmap

- [x] ~~**Streaming token output**~~ — implemented in v0.1.2 via `agent.stream()` with real-time chunk display and token telemetry
- [x] ~~**Direct prompt argument**~~ — implemented: `astra "goal"` auto-runs via the auto-router, bypassing the interactive menu
- [x] ~~**Sandbox mode**~~ — implemented in v0.1.3 with secure credential storage and HMAC-signed communication
- [x] ~~**Session store cache**~~ — implemented in v0.1.3 with debounced writes and LRU entry cache
- [x] ~~**Cross-platform installers**~~ — implemented in v0.1.3 (`install.sh` and `install.bat`)
- [x] ~~**Skills system**~~ — 5 built-in skills documented and available
- [x] ~~**Centralised error logger**~~ — implemented with rotating file output and in-memory ring buffer
- [x] ~~**Sandbox remote server**~~ — migrated from local to remote Render deployment in v0.1.5
- [ ] **Telegram mode** — stub present in wakeup menu, not yet implemented
- [ ] **Undo/redo support** — via action log replay
- [ ] **Configurable tool allowlists per mode** — currently hardcoded per mode
- [ ] **Multi-model support with per-mode model selection** — partially implemented in multi-agent mode only
- [ ] **Persistent action history across sessions** — sessions store summaries but not full action logs

---

## Appendix: Data Flow Diagrams

### Agent Mode Flow

```
User Input (goal)
    │
    ▼
┌─────────────────┐
│  ToolExecutor    │◄──── Staging Overlay (Map + Set)
│  ActionTracker   │◄──── Append-only ActionLog[]
└────────┬────────┘
         │ agent.stream()
         ▼
┌─────────────────┐
│  ToolLoopAgent   │──── 35+ tools available
│  (Vercel AI SDK) │◄──── max 50 steps
│                  │◄──── context summary (if resuming)
└────────┬────────┘
         │ tool calls (onStepFinish)
         ▼
    ┌─────────┐
    │ Terminal │──── green * tool_name {params}
    └────┬────┘
         │ agent finishes
         ▼
┌─────────────────┐
│ runApprovalFlow  │◄──── pending mutations from tracker
│                  │──── "all" / "review" / "cancel"
│                  │──── grouped diffs per file
└────────┬────────┘
         │ approved
         ▼
┌──────────────────────────┐
│ applyApprovedFromTracker  │──── mkdir + writeFileSync + rmSync + spawnSync
│                          │──── replays to REAL filesystem
└────────┬─────────────────┘
         │
         ▼
    ┌──────────┐
    │ endSession│──── LLM summary + persist to ~/.astra/sessions/index.json
    └──────────┘      (via cache layer with debounced write)
```

### Multi-Agent Mode Flow

```
User selects template or builds custom workflow
    │
    ▼
┌──────────────────────────┐
│ MultiAgentOrchestrator    │
│  ├─ AgentPoolManager     │──── registers N agents
│  ├─ MessageBroker        │──── pub-sub for collaborative mode
│  └─ Shared ActionTracker  │
└────────┬─────────────────┘
         │ strategy.dispatch()
         ▼
┌──────────────────────────────────────────────┐
│ Sequential: for each agent → executeAgent()   │
│ Parallel: batch Promise.all(executeAgent())   │
│ Hierarchical: coordinator first, then specs   │
│ Collaborative: round-robin + MessageBroker    │
│ DAG: dependency-aware scheduling              │
└────────┬─────────────────────────────────────┘
         │ each agent:
         ▼
┌─────────────────────┐
│ createExecutorForAgent│──── role-based permissions
│ filterToolsForAgent  │──── role-based tool subset
│ getModelForAgent     │──── per-agent model override
│ ToolLoopAgent        │──── maxSteps (role-dependent)
└────────┬────────────┘
         │ timeline populated
         ▼
┌──────────────────────────┐
│ runMultiAgentApprovalFlow │◄──── per-agent tracker groups
│                          │◄──── per-agent diff display
└────────┬─────────────────┘
         │ each executor.applyApprovedFromTracker()
         ▼
    ┌──────────┐
    │ Applied   │
    └──────────┘
```

### Sandbox Mode Flow

```
User runs: astra sandbox
    │
    ▼
┌──────────────────────┐
│ 1. Health check      │──── GET /health → 200 OK?
│ 2. Generate token    │──── randomBytes(32).toString("hex")
│ 3. Bootstrap         │──── POST /bootstrap { authToken }
│ 4. Validate key      │──── sanitizeApiKey(data.key)
│ 5. Store credentials │──── OS keychain (or encrypted file)
│    - API key         │     ├─ sandbox-api-key
│    - Auth token      │     ├─ sandbox-auth-token
│    - Signing secret  │     └─ sandbox-signing-secret
│ 6. Enable flag       │──── ASTRA_SANDBOX_ENABLED=true
└──────────────────────┘
    │
    ▼
Subsequent AI calls:
    │
    ▼
┌──────────────────────┐
│ getSandboxApiKey()   │
│ 1. Check keychain    │
│ 2. Check mem cache   │──── 5-min TTL
│ 3. Fetch from server │──── GET /api/key (HMAC-signed)
│    + validate        │
│    + cache + store   │
└──────────────────────┘
    │
    ▼
Use key for OpenRouter API calls with owl-alpha model
```
