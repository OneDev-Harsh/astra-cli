# Astra CLI — Complete Technical Documentation

> **Version:** 0.1.6
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

Astra CLI (package name: `astrabot`) is an **AI-native development companion** that brings **agentic coding capabilities** to your terminal. It gives a Large Language Model (LLM) **full programmatic access** to your filesystem, shell, and the web — all gated behind a **carefully designed approval system** that keeps the human developer in control at all times.

Built on [Bun](https://bun.sh), powered by [OpenRouter](https://openrouter.ai), and leveraging the [Vercel AI SDK](https://sdk.vercel.ai)'s `ToolLoopAgent` for autonomous, multi-step tool-driven workflows.

| Mode | Purpose | Mutations? |
|------|---------|------------|
| **Auto** | LLM-powered intent router — automatically picks the best mode | Depends on route |
| **Agent** | Autonomous multi-step code modifications | Yes (staged) |
| **Ask** | Read-only Q&A about your codebase | No (except optional save) |
| **Plan** | Structured multi-step planning with selective execution | Yes (staged) |
| **Multi-Agent** | Multiple agents working together in configurable topologies | Yes (staged) |

A standalone **arcade** with 5 mini-games (HTML canvas) is also included.

---

## 2. Feature Overview

- **Five interaction modes** — Auto, Agent, Ask, Plan, and Multi-Agent
- **Streaming output** — all modes use `agent.stream()` with real-time chunk display and live token telemetry (↑input / ↓output counters, tok/s velocity)
- **Full filesystem access** — read, create, modify, and delete files and directories through an AI agent, all via an in-memory staging overlay
- **Shell execution** — queue arbitrary shell commands for agent-driven workflows (sync and background)
- **Git integration** — `git status`, `git diff`, and `git log` tools for repository awareness
- **Project-aware tooling** — run tests, linting, formatting, and framework detection by reading `package.json`
- **Web research** — built-in web search (via Firecrawl or DuckDuckGo fallback), URL crawling, and HTTP fetching
- **Staging-first mutations** — no file is ever written or deleted without explicit user approval
- **Per-file diff review** — granular approval flow with unified diffs
- **Skill system** — discover and load `SKILL.md` files from built-in, Cursor, Claude, and custom skill directories
- **Configurable safety** — exclude patterns (`node_modules`, `.git`, `dist`, `build`, `.next`, `*.log`, `.env*`), file size limits (default 1 MB), per-tool permission toggles per agent role
- **Session management** — persisted to disk with context summaries, auto-resume on interruption, in-memory cache layer
- **Session tools** — `session_status`, `session_search`, and `session_resume_context` built-in tools
- **Rich terminal UI** — interactive prompts via `@clack/prompts`, markdown rendering via `marked` + `marked-terminal`, figlet ASCII banner, animated spinners, colored logging
- **Multi-model support** — per-agent model override in Multi-Agent mode
- **Retry on failure** — configurable retry logic for AI provider calls and multi-agent step failures
- **Sandbox mode** — optional secure execution environment with OS keychain credential storage and HMAC-signed server communication
- **Cross-platform installers** — automated setup scripts for Linux/macOS and Windows
- **Centralised error logging** — rotating log file at `~/.astra/logs/astra.log` with ring buffer for post-mortem debugging
- **Persistent action history** *(upcoming v0.1.7)* — all approved actions logged to `~/.astra/history/actions.jsonl` with session ID, workspace path, and timestamps; queryable across sessions via `ActionHistoryManager`

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

Astra is configured entirely through environment variables, loaded from `~/.astra/.env`.

### Required Variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM access |
| `OPENROUTER_DEFAULT_MODEL` | Model identifier (e.g., `anthropic/claude-3.5-sonnet`) |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `FIRECRAWL_API_KEY` | Enables `web_search`, `web_crawl`, and `fetch_url` tools via Firecrawl SDK (otherwise falls back to DuckDuckGo) |
| `SKILLS_DIRS` | Semicolon-separated paths to additional custom skill directories |

### Sandbox Variables

| Variable | Description |
|----------|-------------|
| `ASTRA_SANDBOX_ENABLED` | Set to `true` when sandbox mode is active (managed by `astra sandbox`) |

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
| `~/.astra/history/actions.jsonl` | Persistent action history log (JSONL, all approved actions across sessions) |

### Setup Wizard (`astra setup`)

1. Prompts for OpenRouter API key
2. Fetches available models from OpenRouter with search and pricing
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

- **With prompt:** `astra "fix the bug"` → joins words, passes to `runAutoMode()`, skips interactive goal prompt.
- **Without prompt:** `astra` → falls back to `runWakeup()`.

### `astra wakeup`

Displays the ASCII art banner and presents a top-level mode selection:
- **CLI** → enters the CLI mode loop (Auto / Agent / Plan / Ask / Multi-Agent)
- **Telegram** → placeholder (not yet implemented)
- **Exit** → quits

Checks for resumable (interrupted) sessions before the mode menu.

### `astra setup`

Interactive configuration wizard for API keys and settings.

### `astra sandbox`

Activates sandbox mode. Connects to the sandbox server (`https://astra-server-oh6s.onrender.com`), performs health check, bootstraps with the server, and stores credentials in OS keychain.

### `astra play`

Launches the arcade — 5 mini-games (Retro Snake Classic, Neon Brick Breaker, Neon Pong, Neon Memory, Neon Tetris). Spawns a local Bun HTTP server on port `4321` and opens the default browser.

### `astra reset`

Interactive danger-zone command that completely purges all stored configurations, sessions, and credentials from `~/.astra/`. Requires explicit confirmation.

---

## 6. Interaction Modes — Deep Dive

### 6.1 Wakeup & Top-Level Mode Selection

**File:** `tui/wakeup.ts`

1. Spinner renders the ASCII banner using `figlet` with the **"ANSI Shadow"** font (falls back to **"Standard"**)
2. Banner printed in gold (`#ffd000`) with version and tagline
3. **Session resume check:** `getResumableSession(cwd)` checks for `status === "interrupted"` sessions. On resume, session ID is stored in `globalThis.__ASTRA_RESUME_SESSION__` and `runCliMode()` is called directly.
4. Mode selection via `@clack/prompts` `select()`: **CLI**, **Telegram**, **Exit**
5. Default action without subcommand: if `[prompt...]` is provided, runs `runAutoMode()` directly; otherwise falls back to `runWakeup()`.

### 6.2 CLI Mode Loop

**File:** `modes/cli.ts`

Infinite `while(true)` loop with `@clack/prompts` `select()`:
- **Auto Mode** → `runAutoMode()`
- **Agent Mode** → `runAgentMode()`
- **Plan Mode** → `runPlanMode()`
- **Ask Mode** → `runAskMode()`
- **Multi-Agent Mode** → `runMultiAgentMode()`
- **⬅ Back to main menu** → returns to wakeup loop
- Ctrl+C returns to wakeup

### 6.3 Agent Mode

**File:** `modes/agent/orchestrator.ts`

#### Flow

1. **Goal input** — "What would you like the agent to do for you?"
2. **Initialization** — `defaultAgentConfig()` with codebase path, 1 MB file size limit, exclude patterns, all tool permissions enabled
3. **File creation approval hook** — `approveCreatedFile` callback runs single-file approval flow immediately when the agent creates a file
4. **Session begin** — `beginSession()` with workspace path, mode "agent", and goal; loads context summary if resuming
5. **Agent construction** — `ToolLoopAgent` with model from `getAgentModel()`, `stopWhen: stepCountIs(50)`, workspace instructions, all agent tools + session tools
6. **Agent execution** — wrapped in `withSpinner()`, uses `agent.stream()`, `onStepFinish` logs each tool call in green; on error, `promptToRetryAiCall()` offers retry
7. **Final response** — rendered as markdown in terminal
8. **Approval flow** — `runApprovalFlow(tracker)` presents staged changes
9. **Apply changes** — `executor.applyApprovedFromTracker()` replays approved actions
10. **Session end** — `endSession()` extracts touched files, generates LLM summary

### 6.4 Ask Mode

**File:** `modes/ask/orchestrator.ts`

Read-only Q&A interface.

1. **Question input** — "What would you like to ask?"
2. **Read-only config** — all mutation permissions disabled (`allowShellExecution`, `allowFileModification`, `allowFileCreation`, `allowFolderCreation`)
3. **Tool set** — `createReadOnlyTools()` strips all mutation tools; keeps read-only tools + web tools + session tools
4. **Agent execution** — `ToolLoopAgent` with `stopWhen: stepCountIs(25)`, spinner "Thinking...", tool calls logged in cyan
5. **Display answer** — rendered as markdown
6. **Optional save** — user can save Q&A as `.md` file with `## Question` / `## Answer` headings; file creation temporarily enabled for this one file

### 6.5 Plan Mode

**File:** `modes/plan/orchestrator.ts`

1. **Goal input** — "What is your goal?"
2. **Plan generation** — `generatePlan(goal)` uses `Output.object()` with schema expecting `researchSummary` and `steps[]` (1–20 steps with `title`, `description`, `hints?`, `complexity?`)
3. **Display plan** — numbered steps with color-coded complexity (low=green, medium=yellow, high=red)
4. **Step selection** — `@clack/prompts` `multiselect()`, all pre-selected
5. **Execution** — each selected step runs as independent `ToolLoopAgent` (50 steps max) with full agent tool set
6. **Approval & apply** — single `runApprovalFlow()` for all changes across all steps

### 6.6 Multi-Agent Mode

**File:** `modes/multi/orchestrator.ts`

1. **Workflow design** — LLM analyzes goal and selects a pre-built template or designs a custom agent team
2. **Validation** — 10+ validation checks
3. **Execution** — `MultiAgentOrchestrator.execute()` dispatches by strategy
4. **Results display** — status, duration, pool stats, per-agent results
5. **Approval flow** — per-agent review groups with diff viewing

---

## 7. Tool System — Complete Reference

### Architecture

1. **`ToolExecutor`** (`modes/agent/tool-executor.ts`) — Core execution engine. Mutations staged in memory overlay.
2. **`createAgentTools()`** (`modes/agent/agent-tools.ts`) — Wraps `ToolExecutor` methods as Vercel AI SDK `tool()` with Zod schemas.
3. **`createWebTools()`** (`modes/plan/web-tools.ts`) — Firecrawl-based web tools.
4. **`createSessionTools()`** (`session/session-tools.ts`) — Session management tools injected into every agent.

### Complete Tool List

| Tool Name | Description | Mutates? |
|-----------|-------------|:--------:|
| `read_file` | Read a text file | ❌ |
| `create_file` | Stage creation of a new file | ✅ |
| `modify_file` | Stage a full-file replacement | ✅ |
| `delete_file` | Stage deletion of a file | ✅ |
| `create_folder` | Stage creation of a directory tree | ✅ |
| `list_files` | List files and directories | ❌ |
| `search_files` | Find files matching a glob pattern | ❌ |
| `analyze_codebase` | Summarize structure | ❌ |
| `read_multiple_files` | Read multiple files in one call | ❌ |
| `grep` | Text search across files | ❌ |
| `replace_in_file` | Replace text inside a file | ✅ |
| `append_to_file` | Append content to end of a file | ✅ |
| `insert_at_line` | Insert content at a specific line | ✅ |
| `run_command` | Run a shell command synchronously | ❌ |
| `run_background_command` | Start a detached background process | ❌ |
| `git_status` | `git status --short` | ❌ |
| `git_diff` | `git diff` (optionally staged) | ❌ |
| `git_log` | `git log --oneline` | ❌ |
| `run_tests` | Auto-detect and run test suite | ❌ |
| `run_test_file` | Run a specific test file | ❌ |
| `lint_project` | Auto-detect and run linting | ❌ |
| `format_project` | Auto-detect and run formatting | ❌ |
| `detect_framework` | Detect framework from `package.json` | ❌ |
| `read_package_json` | Read and summarize `package.json` | ❌ |
| `web_search` | Search the web | ❌ |
| `fetch_url` | HTTP GET, returns response body | ❌ |
| `web_crawl` | Scrape a URL into markdown | ❌ |
| `create_plan` | Create an in-memory plan object | ❌ |
| `get_plan` | Retrieve the current plan as JSON | ❌ |
| `show_pending_changes` | Return pending mutations | ❌ |
| `discard_changes` | Clear the staging overlay | ❌ |
| `execute_shell` | Queue a shell command for post-approval | ✅ |
| `list_skills` | List `SKILL.md` files | ❌ |
| `read_skill` | Read a specific `SKILL.md` file | ❌ |
| `session_status` | Show recent sessions | ❌ |
| `session_search` | Search previous sessions | ❌ |
| `session_resume_context` | Get full context of a previous session | ❌ |

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

### Phase 1: Staging (during agent execution)

1. `ToolExecutor` validates path safety (within workspace root, not excluded)
2. Operation recorded in the in-memory overlay
3. `ActionLog` entry created with `status: "pending"` and appended to `ActionTracker`
4. Tool returns "Staged new file: path/to/file.ts"

### Phase 2: Approval Flow (`modes/agent/approval.ts`)

1. `tracker.getPendingMutations()` collects mutation-type actions with `status: "pending"`
2. If no pending mutations → returns `false`
3. User chooses:
   - **"Approve and apply all"** → marks all as `"approved"`
   - **"Review one by one"** → groups by file path, iterates with accept/reject/diff
   - **"Cancel"** → marks all as `"rejected"`

#### Review Groups

`groupPending()` sorts into `ReviewGroup[]`:
- File mutations grouped by path, ordered alphabetically
- Multiple actions on same path → combined `composeBeforeAfter()` diff
- Folder creations show no diff
- Shell commands shown individually

#### Diff Generation (`modes/agent/diff-view.ts`)

- `formatPatch()`: `diff.createTwoFilesPatch()` with 3 lines of context
- `composeBeforeAfter()`: first action's `before` → last action's `after`

### Phase 3: Application (`applyApprovedFromTracker`)

1. Folder creation first (sorted by time)
2. File operations sorted by timestamp, grouped by path → only the **last** action per path applied
3. Shell commands executed via `spawnSync` with 16 MB buffer
4. Action IDs tracked in `appliedActionIds` to prevent double-application

---

## 9. Action Tracking System

**File:** `modes/agent/action-tracker.ts`

Append-only log of every action the agent takes.

```typescript
type ActionType = 'file_create' | 'file_modify' | 'file_delete' | 'folder_create' | 'code_analysis' | 'tool_execute'
type ActionStatus = 'pending' | 'executed' | 'approved' | 'rejected'

interface ActionLog {
    id: string              // "action_0", "action_1", ...
    timestamp: Date
    type: ActionType
    path: string            // file path or "shell" or "skills" or "web"
    details: {
        before?: string
        after?: string
        toolName?: string
        toolResult?: string
        error?: string
        command?: string
    }
    status: ActionStatus
    userApproved?: boolean
}
```

| Method | Description |
|--------|-------------|
| `log(entry)` | Append a new action, auto-assigns ID and timestamp |
| `getActions()` | Returns the full readonly array |
| `getPendingMutations()` | Filters to mutation-type actions with `status === "pending"` |
| `getPendingMutationsForPath(path)` | Filters pending mutations to a specific path |
| `updateStatus(id, status, userApproved?)` | Updates an action's status |

`code_analysis` actions are tracked for auditability but never subject to approval (read-only, marked `"executed"` immediately).

---

## 10. Session Management

### Storage

**File:** `session/store.ts`

Sessions stored in `~/.astra/sessions/index.json` with atomic writes (temp file + rename).

```typescript
interface SessionStoreIndex {
    version: number          // currently 2
    sessions: SessionEntry[]
    maxSessions: number      // 100
}
```

### Cache Layer

**File:** `session/session-cache.ts`

- Reads served from memory (no file I/O) when clean
- Writes batched with 500ms debounce
- LRU entry cache for O(1) lookups by session ID
- `flushSync()` for critical shutdown paths
- Singleton via `getSessionStoreCache()`

### Session Entry Schema

```typescript
interface SessionEntry {
    id: string               // "sess_m5k2x3_abc123"
    workspacePath: string
    mode: 'agent' | 'ask' | 'plan' | 'multi' | 'auto'
    status: 'active' | 'completed' | 'interrupted'
    summary: string          // LLM-generated
    lastGoal: string
    allGoals: string[]
    touchedFiles: string[]
    appliedActions: number
    rejectedActions: number
    createdAt: string
    updatedAt: string
    previousSessionId?: string
    transcript?: TranscriptMessage[]  // capped at 60
    pendingTasks?: string[]
    lastAgentResponse?: string  // truncated to 2000 chars
}
```

### Session Lifecycle

1. **Begin** — creates entry with `status: "active"`; loads prior context if resuming
2. **Active** — agent performs work, actions accumulate
3. **End** — collects touched files, counts actions, generates LLM summary, sets `status: "completed"`
4. **Interrupt** — sets `status: "interrupted"`, all state preserved
5. **Resume** — on wakeup, interrupted sessions offered for resumption

### Session Tools

| Tool | Description |
|------|-------------|
| `session_status` | Optional `limit` (1–20, default 5). Shows recent sessions with ID, summary, pending tasks. |
| `session_search` | Search by keyword across `lastGoal`, `summary`, `touchedFiles`, `allGoals`. |
| `session_resume_context` | Takes `session_id` and optional `transcript_turns` (1–30, default 10). Returns full resumption context. |

---

## 11. Multi-Agent Orchestration

### Agent Roles

| Role | Permissions | Max Steps | Tools |
|------|------------|:---------:|:-----:|
| `researcher` | Read-only | 30 | 16 |
| `implementer` | Full read/write/execute | 50 | 26 |
| `reviewer` | Read + execute (no write) | 25 | 15 |
| `coordinator` | Read-only + planning | 20 | 8 |
| `custom` | Configurable | 30 | Variable |

### Orchestration Strategies

| Strategy | Behavior |
|----------|----------|
| **Sequential** | Agents run one after another; each sees previous outputs |
| **Parallel** | Agents run in batches of `maxConcurrentAgents` (default 3) via `Promise.all()` |
| **Hierarchical** | Coordinator runs first, then specialists with coordinator's plan |
| **Collaborative** | Round-robin turns; output broadcast via `MessageBroker` |
| **DAG** | Agents run when dependencies satisfied; cycle detection and deadlock handling |

### Message Broker (`message-broker.ts`)

- `broadcast(msg)` — send to specific agent or all
- `subscribe(agentId, callback)` — register callback; returns unsubscribe function
- `getMessagesFor(agentId)` — filter messages (direct or broadcast)
- `replayMessages(agentId, callback)` — async iteration

### Workflow Builder (`workflow-builder.ts`)

Fluent API:

```typescript
new WorkflowBuilder(id, goal)
  .addResearcher(...)
  .addImplementer(...)
  .addReviewer(...)
  .withDagStrategy(maxConcurrent, timeout)
  .withRetryOnFailure(maxRetries)
  .build()
```

### Workflow Templates

1. `codeReviewWorkflow` — Sequential, retry(1): Researcher → Implementer → Reviewer
2. `featureDevelopmentWorkflow` — DAG: Coordinator → Backend + Frontend → QA
3. `bugFixingWorkflow` — Sequential, retry(2): Debug → Fix → Test
4. `collaborativeResearchWorkflow` — Parallel (3 concurrent, 45s): Researcher 1 + 2 + 3
5. `securityAuditWorkflow` — DAG: Scanner → Static + Dependency Auditor → Report
6. `fullStackFeatureWorkflow` — DAG: Architect → DB + API + UI Dev → Integration Tester

### Validation Checks

- Workflow ID and goal present
- At least one agent, no duplicate IDs, no empty names
- `maxSteps > 0`, at least 1 tool per agent
- Valid strategy type
- Hierarchical requires a coordinator
- Collaborative with >1 agent needs a timeout
- Fallback agent IDs exist
- Dependency references valid, no self-references
- DAG cycle detection
- Warning if DAG strategy used without dependencies

---

## 12. Sandbox Mode & Secure Storage

### Sandbox Configuration (`ai/sandbox-config.ts`)

- **NO secrets in config files** — API keys never touch `~/.astra/.env`
- **OS keychain storage** — macOS Keychain, Windows Credential Vault, Linux Secret Service
- **HMAC-signed requests** — SHA-256 HMAC with timestamps
- **Fixed model** — `openrouter/owl-alpha`
- **Remote server** — `https://astra-server-oh6s.onrender.com`
- **Key caching** — 5-minute TTL
- **Key validation** — sanitizes and validates `sk-or-v1-*` format

### Activation Flow

1. Health check the sandbox server
2. Generate secure random auth token (32 bytes hex)
3. Bootstrap with server (POST `/bootstrap`)
4. Validate and sanitize returned API key
5. Store credentials in secure storage
6. Set `ASTRA_SANDBOX_ENABLED=true`

### Secure Storage (`ai/secure-storage.ts`)

- **Primary:** OS native credential managers via `keytar`
- **Fallback:** AES-256-GCM encrypted file at `~/.astra/.secure/sandbox.enc`
  - Key derived from machine-id via `scrypt`
  - Device-bound, 0o600 permissions, atomic writes

| Key | Purpose |
|-----|---------|
| `sandbox-api-key` | OpenRouter API key |
| `sandbox-auth-token` | Server auth token |
| `sandbox-signing-secret` | HMAC signing secret |

---

## 13. Skills System

Skills are `SKILL.md` files providing structured guidance to the AI agent.

### Skill Directories (in order)

1. **Built-in:** `.skills/`
2. **Cursor:** `~/.cursor/skills-cursor/`
3. **Claude:** `~/.claude/skills/`
4. **Custom:** `SKILLS_DIRS` env var (semicolon-separated)

### Built-in Skills

| Skill | Purpose |
|-------|---------|
| `code-review` | Code review checklist (quality, error handling, security, performance, testing) |
| `documentation` | Documentation standards for README, CHANGELOG, TSDoc |
| `git-workflow` | Branch naming, conventional commits, pre-commit checklist |
| `project-setup` | Development environment setup guide |
| `test-runner` | Test execution patterns and result interpretation |

### Skill File Format

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

Centralised error logging with rotating file output.

- **Location:** `~/.astra/logs/astra.log`
- **Max size:** 5 MiB per file
- **Backups:** 3 rotating backups
- **Format:** One JSON object per line (`timestamp`, `level`, `source`, `message`, `stack`, `context`)

| Function | Description |
|----------|-------------|
| `logAndThrow(source, error, context?)` | Log and re-throw |
| `logAndContinue(source, error, context?)` | Log without throwing |
| `logWarn(source, message, context?)` | Log a warning |
| `logInfo(source, message, context?)` | Log informational |
| `errorLogger.onError(fn)` | Subscribe to log entries |
| `errorLogger.getRecentEntries(count?)` | Ring buffer copy (default 50) |
| `errorLogger.getLogFilePath()` | Absolute path of active log file |

---

## 15. Project Structure — Every File

```
astrabot/
├── index.ts                        # CLI entry point (Commander)
├── package.json                    # Package config
├── tsconfig.json                   # TS config: ESNext, strict, Bun types
├── bun.lock                        # Bun lockfile
├── .gitignore                      # Standard ignores + private/
├── .npmignore                      # Excludes tests, .github, private from npm
│
├── bin/astra                       # Binary entry point (#!/usr/bin/env bun)
│
├── install/                        # Cross-platform installer scripts
│   ├── README.md                   # Installer documentation
│   ├── install.sh                  # Linux/macOS
│   └── install.bat                 # Windows
│
├── ai/                             # AI provider configuration
│   ├── index.ts                    # Public API re-exports
│   ├── ai.config.ts                # OpenRouter provider setup
│   ├── config-loader.ts            # ~/.astra/.env management
│   ├── auto-retry.ts               # AI call retry wrapper
│   ├── retry-prompt.ts             # Manual retry prompt
│   ├── sandbox-config.ts           # Sandbox activation & HMAC signing
│   └── secure-storage.ts           # Encrypted credential storage
│
├── core/                           # Core utilities
│   ├── logger.ts                   # Centralised error logger
│   └── retry/                      # Retry engine
│       ├── index.ts                # Re-exports
│       ├── retry-config.ts         # ErrorCategory, RetryConfig, presets
│       ├── retry-engine.ts         # withRetry(), RetryPresets
│       └── error-classifier.ts     # Error classification
│
├── tui/                            # Terminal UI
│   ├── terminal-md.ts              # Markdown-to-terminal rendering
│   ├── spinner.ts                  # Animated spinner (metabolic rate engine)
│   └── wakeup.ts                   # ASCII banner + mode selection
│
├── modes/                          # Interaction modes
│   ├── cli.ts                      # CLI mode loop
│   ├── auto.ts                     # Auto mode (intent classifier)
│   ├── setup.ts                    # Setup wizard
│   ├── agent/                      # Agent mode
│   │   ├── types.ts                # ActionType, ActionLog, AgentConfig
│   │   ├── action-tracker.ts       # Append-only action log
│   │   ├── agent-tools.ts          # 35+ Vercel AI SDK tools
│   │   ├── tool-executor.ts        # Staging overlay + implementations
│   │   ├── diff-view.ts            # Unified diff generation
│   │   ├── approval.ts             # Approval flow
│   │   └── orchestrator.ts         # Full agent lifecycle
│   ├── ask/                        # Ask mode
│   │   └── orchestrator.ts         # Read-only Q&A
│   ├── plan/                       # Plan mode
│   │   ├── types.ts                # PlanStep, Plan interfaces
│   │   ├── planner.ts              # LLM-structured planning
│   │   ├── selection.ts            # Step selection UI
│   │   ├── web-tools.ts            # Firecrawl web tools
│   │   └── orchestrator.ts         # Plan → select → execute → approve
│   └── multi/                      # Multi-agent mode
│       ├── types.ts                # Full type system
│       ├── agent-pool-manager.ts   # Agent registration & tracking
│       ├── message-broker.ts       # Pub-sub communication
│       ├── multi-agent-orchestrator.ts  # Strategy dispatch
│       ├── workflow-builder.ts     # Fluent API + templates
│       ├── examples.ts             # Example workflows
│       └── orchestrator.ts         # AI workflow designer + execution
│
├── session/                        # Session management
│   ├── index.ts                    # Re-exports
│   ├── store.ts                    # JSON file store (atomic writes)
│   ├── session-manager.ts          # Lifecycle & auto-resume
│   ├── session-context.ts          # Context summary for resumption
│   ├── session-tools.ts            # session_status, search, resume
│   ├── session-cache.ts            # In-memory cache (debounced writes)
│   └── action-history.ts           # Persistent cross-session action log (v0.1.7)
│
├── .skills/                        # Built-in skills
│   ├── code-review/SKILL.md
│   ├── documentation/SKILL.md
│   ├── git-workflow/SKILL.md
│   ├── project-setup/SKILL.md
│   └── test-runner/SKILL.md
│
├── game/                           # Arcade easter egg
│   ├── index.html                  # Retro Snake Classic
│   ├── neon-breaker.html           # Neon Brick Breaker
│   ├── neon-pong.html              # Neon Pong
│   ├── neon-memory.html            # Neon Memory
│   └── neon-tetris.html            # Neon Tetris
│
├── tests/
│   └── cli.test.ts                 # CLI smoke tests
│
└── private/                        # Internal planning (not shipped)
    ├── available-tools.md
    ├── future.md
    ├── mcp.md
    └── suggestions.md
```

---

## 16. Dependencies

### Runtime

| Package | Version | Purpose |
|---------|---------|---------|
| `@openrouter/ai-sdk-provider` | ^2.9.0 | OpenRouter LLM provider |
| `@clack/prompts` | ^1.4.0 | Interactive terminal prompts |
| `@clack/core` | ^1.3.1 | Core prompt primitives |
| `@mendable/firecrawl-js` | ^4.25.1 | Firecrawl SDK |
| `commander` | ^15.0.0 | CLI argument parsing |
| `chalk` | ^5.6.2 | Terminal string styling |
| `figlet` | ^1.11.0 | ASCII art banner |
| `marked` | ^18.0.4 | Markdown parser |
| `marked-terminal` | ^7.3.0 | Markdown terminal renderer |
| `diff` | ^9.0.0 | Unified diff generation |
| `dotenv` | ^17.4.2 | .env file loading |
| `docx` | ^9.7.1 | Word document generation |
| `@types/node` | ^25.9.1 | Node.js type definitions |
| `@types/marked-terminal` | ^6.1.1 | Type definitions |

### Dev

| Package | Version | Purpose |
|---------|---------|---------|
| `@types/bun` | latest | Bun type definitions |

### Peer

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5 | TypeScript compiler |

### Optional

| Package | Purpose |
|---------|---------|
| `keytar` | OS keychain access for sandbox credentials |

---

## 17. Roadmap

- [x] ~~Streaming token output~~ — implemented in v0.1.2
- [x] ~~Direct prompt argument~~ — `astra "goal"` auto-runs via auto-router
- [x] ~~Sandbox mode~~ — implemented in v0.1.3
- [x] ~~Session store cache~~ — implemented in v0.1.3
- [x] ~~Cross-platform installers~~ — implemented in v0.1.3
- [x] ~~Skills system~~ — 5 built-in skills
- [x] ~~Centralised error logger~~ — implemented with rotating file output
- [x] ~~Sandbox remote server~~ — migrated in v0.1.5
- [x] ~~Persistent action history~~ — cross-session JSONL action log, implemented in v0.1.6
- [ ] Telegram mode
- [ ] Undo/redo support via action log replay
- [ ] Configurable tool allowlists per mode
- [ ] Per-mode model selection
- [ ] Persistent action history across sessions

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
│ runApprovalFlow  │◄──── pending mutations
│                  │──── "all" / "review" / "cancel"
└────────┬────────┘
         │ approved
         ▼
┌──────────────────────────┐
│ applyApprovedFromTracker  │──── mkdir + writeFileSync + rmSync + spawnSync
└────────┬─────────────────┘
         │
         ▼
    ┌──────────┐
    │ endSession│──── LLM summary + persist to disk
    └──────────┘
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
         │
         ▼
┌──────────────────────────┐
│ runMultiAgentApprovalFlow │◄──── per-agent tracker groups
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
