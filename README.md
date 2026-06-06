# Astra

**AI-native development companion — agentic coding in your terminal.**

Astra gives a Large Language Model full programmatic access to your filesystem, shell, and the web — all gated behind a staging-first approval pipeline that keeps you in control. Built on [Bun](https://bun.sh), powered by [OpenRouter](https://openrouter.ai), and driven by the [Vercel AI SDK](https://sdk.vercel.ai).

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Interaction Modes](#interaction-modes)
  - [Auto Mode](#auto-mode)
  - [Agent Mode](#agent-mode)
  - [Ask Mode](#ask-mode)
  - [Plan Mode](#plan-mode)
  - [Multi-Agent Mode](#multi-agent-mode)
- [Architecture](#architecture)
  - [Core Components](#core-components)
  - [Tool System](#tool-system)
  - [Staging & Approval Pipeline](#staging--approval-pipeline)
  - [Action Tracking](#action-tracking)
  - [Session Management](#session-management)
  - [Auto-Retry Engine](#auto-retry-engine)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Dependencies](#dependencies)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- **Five interaction modes** — Auto, Agent, Ask, Plan, and Multi-Agent, each tailored to a different development workflow
- **Auto-router** — classifies user intent and routes to the correct mode automatically
- **Full filesystem access** — read, create, modify, and delete files and directories through an AI agent, all via an in-memory staging overlay
- **Shell execution** — queue arbitrary shell commands for agent-driven workflows (sync and background)
- **Git integration** — `git status`, `git diff`, and `git log` tools for repository awareness
- **Project-aware tooling** — run tests, linting, formatting, and framework detection by reading `package.json`
- **Web research** — built-in web search (via DuckDuckGo or Firecrawl), URL crawling, and HTTP fetching
- **Staging-first mutations** — no file is ever written or deleted without explicit user approval; all changes are staged in memory and presented for review before apply
- **Per-file diff review** — granular approval flow with unified diffs so you can inspect exactly what changed
- **Skill system** — discover and load `SKILL.md` files from Cursor and Claude skill directories, plus custom directories via `SKILLS_DIRS`
- **Session management** — sessions are persisted to disk with context summaries, enabling resumption after interruption
- **Auto-retry engine** — exponential backoff with jitter for resilient AI provider calls
- **Configurable safety** — exclude patterns, file size limits, and per-tool permission toggles per agent role
- **Rich terminal UI** — interactive prompts via `@clack/prompts`, markdown rendering, ASCII banner on startup, animated spinners, and colored logging

---

## Quick Start

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| [Bun](https://bun.sh) | >=1.0.0 | Runtime and package manager |
| [OpenRouter](https://openrouter.ai) API key | — | LLM provider access (required) |
| [Firecrawl](https://www.firecrawl.dev/) API key | — | Web search and crawling (optional) |

### Installation

```bash
git clone <repository-url>
cd astra
bun install
```

### Configuration

Run the interactive setup wizard:

```bash
bun run index.ts setup
```

This creates `~/.astra/.env` with your API keys and preferred model. Alternatively, create the file manually:

```env
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_DEFAULT_MODEL=anthropic/claude-sonnet-4.5
FIRECRAWL_API_KEY=fc-...            # optional
SKILLS_DIRS=/path/to/skills         # optional
```

### Launch

```bash
bun run index.ts wakeup
```

---

## Commands

| Command | Description |
|---------|-------------|
| `astra wakeup` | Display the banner and pick an interaction mode |
| `astra setup` | Interactive configuration wizard for `~/.astra/.env` |
| `astra play` | Launch the arcade mini-game (Snake or Neon Breaker) |
| `astra reset` | Purge all stored configurations, sessions, and credentials |
| `astra --version` | Print the current version |

---

## Interaction Modes

### Auto Mode

Auto mode classifies your natural-language request and routes it to the correct downstream mode (Agent, Ask, Plan, or Multi-Agent) automatically.

```
You: "fix the bug in store.ts"
→ Router classifies as "agent" → executes Agent Mode

You: "explain how this app works"
→ Router classifies as "ask" → executes Ask Mode
```

**How it works:**

1. You type any request
2. An LLM classifies the intent into one of four categories
3. The session is logged with the routing decision
4. The selected mode executes with your original prompt

### Agent Mode

The primary autonomous coding mode. You describe a goal, and the agent iteratively uses its toolset — reading files, writing code, running shell commands — to accomplish it.

**Flow:**

1. You provide a natural-language goal
2. The agent enters a tool loop (up to 50 steps), calling tools to explore and modify the codebase
3. Each tool call is logged and displayed in real time
4. After the agent finishes, the **approval flow** presents all staged changes grouped by file
5. You can **accept all**, **review individually** (with diffs), or **cancel**
6. Approved changes are applied to disk; rejected changes are discarded

**Available tools (35+):**

| Category | Tools |
|----------|-------|
| Filesystem | `read_file`, `create_file`, `modify_file`, `delete_file`, `create_folder`, `list_files`, `search_files`, `read_multiple_files`, `replace_in_file`, `append_to_file`, `insert_at_line` |
| Shell | `run_command`, `run_background_command`, `execute_shell` |
| Git | `git_status`, `git_diff`, `git_log` |
| Project | `run_tests`, `run_test_file`, `lint_project`, `format_project`, `detect_framework`, `read_package_json`, `analyze_codebase` |
| Search | `grep` |
| Web | `web_search`, `fetch_url`, `web_crawl` (requires Firecrawl) |
| Skills | `list_skills`, `read_skill` |
| Session | `session_status`, `session_history` |
| Planning | `create_plan`, `get_plan`, `show_pending_changes`, `discard_changes` |

### Ask Mode

A **read-only** Q&A interface. The agent can explore your codebase and the web to answer questions, but cannot modify files (with the optional exception of saving the response).

**Flow:**

1. You ask a question
2. The agent uses read-only tools to formulate an answer
3. The answer is rendered as markdown in the terminal
4. You're given the option to save the Q&A pair as a `.md` file

**Available tools:** All read-only tools from Agent mode (filesystem read, search, codebase analysis, git, web, skills, session). All mutation tools are stripped.

### Plan Mode

Breaks a high-level goal into a structured, executable plan. The agent researches your codebase, generates a step-by-step plan, and you select which steps to execute.

**Flow:**

1. You describe a high-level goal
2. The agent researches the codebase and generates a structured plan (1–20 steps) with complexity ratings (`low`, `medium`, `high`)
3. The plan is displayed with a research summary and numbered steps
4. You select which steps to execute (all selected by default)
5. Each selected step runs as an independent agent loop (up to 50 steps per step)
6. All mutations across all steps are collected and presented in a single approval flow

### Multi-Agent Mode

Coordinates multiple AI agents working together on complex workflows.

**Workflow selection:**

- **Use predefined template** — choose from 6 templates:

| Template | Agents | Strategy |
|----------|--------|----------|
| Code Review | Researcher → Implementer → Reviewer | Sequential |
| Feature Development | Coordinator → Backend Dev + Frontend Dev → QA | Hierarchical |
| Bug Fix | Debug Agent → Fix Agent → Test Agent | Sequential |
| Collaborative Research | Researcher 1 + Researcher 2 + Researcher 3 | Parallel |
| Security Audit | Scanner → Analyzer → Reporter | Sequential |
| Full-Stack Feature | Database + API + UI (parallel) | Hierarchical |

- **AI-smart build** — the LLM analyzes your goal and automatically designs a custom agent topology with the optimal strategy and role assignments

**Orchestration strategies:**

| Strategy | Behavior |
|----------|----------|
| **Sequential** | Agents run one after another; each agent's output is visible to subsequent agents |
| **Parallel** | Agents run concurrently in batches (default 3 at a time) |
| **Hierarchical** | Coordinator runs first (planning), then specialists execute |
| **Collaborative** | Agents take turns; outputs are broadcast via a message broker |

**Agent roles and permissions:**

| Role | Permissions | Default Max Steps | Tools |
|------|------------|-------------------|-------|
| Researcher | Read-only | 30 | 16 |
| Implementer | Full read/write/execute | 50 | 26 |
| Reviewer | Read + execute (no write) | 25 | 15 |
| Coordinator | Read-only + planning | 20 | 8 |
| Custom | Based on selected tools | 30 | Variable |

---

## Architecture

### Core Components

| File | Responsibility |
|------|----------------|
| `index.ts` | Entry point; registers commands via Commander |
| `tui/wakeup.ts` | Banner rendering and top-level mode selection |
| `tui/terminal-md.ts` | Markdown-to-terminal rendering via `marked` + `marked-terminal` |
| `tui/spinner.ts` | Animated spinner with elapsed time display |
| `modes/cli.ts` | CLI mode loop (Auto / Agent / Plan / Ask / Multi-Agent) |
| `modes/auto.ts` | Auto-router: LLM-based intent classification |
| `modes/setup.ts` | Interactive configuration wizard |
| `ai/ai.config.ts` | OpenRouter provider initialization |
| `ai/config-loader.ts` | Manages `~/.astra/.env` file |
| `ai/auto-retry.ts` | Automatic retry with exponential backoff |
| `ai/retry-prompt.ts` | Manual retry prompt fallback |

### Tool System

The tool system has two layers:

1. **`ToolExecutor`** (`modes/agent/tool-executor.ts`) — The core execution engine. All filesystem operations, shell commands, and skill lookups are implemented here. Mutations are staged in an in-memory overlay and never touch disk until explicitly approved.

2. **`createAgentTools()`** (`modes/agent/agent-tools.ts`) — Wraps every `ToolExecutor` method as a Vercel AI SDK `tool()` with a Zod input schema, making them available to the LLM agent.

Additional tool sets:
- **`createWebTools()`** (`modes/plan/web-tools.ts`) — Firecrawl-based web search, crawl, and fetch tools
- **`createSessionTools()`** (`session/session-tools.ts`) — `session_status` and `session_history` tools injected into every agent

### Staging & Approval Pipeline

This is the safety backbone of Astra. No mutation ever touches disk without explicit consent.

**Phase 1 — Staging:** When the agent calls a mutation tool, the `ToolExecutor` validates path safety (must be within workspace root, not excluded), records the operation in an in-memory overlay, and logs it to the `ActionTracker` with status `"pending"`.

**Phase 2 — Approval:** After the agent completes, all pending mutations are grouped by file path and presented to the user with three options:
- **Approve and apply all** — marks every pending mutation as approved
- **Review one by one** — iterates through each group, showing a unified diff and prompting for accept/reject
- **Cancel** — rejects all pending mutations

**Phase 3 — Application:** Approved actions are replayed against the real filesystem: folders are created, files are written or deleted, and shell commands are spawned.

### Action Tracking

The `ActionTracker` maintains an append-only log of every action the agent takes. Each entry includes a unique ID, timestamp, action type, file path, before/after content snapshots, and status (`pending`, `executed`, `approved`, `rejected`). This log powers the approval flow, enables auditability, and supports future undo/redo features.

### Session Management

Sessions are stored in `~/.astra/sessions/index.json` with atomic writes (temp file + rename). Each session records the workspace path, mode, status, LLM-generated summary, touched files, and action counts. Sessions support:

- **Auto-resume** — interrupted sessions are detected on wakeup and offered for resumption
- **Context injection** — on resume, the previous session's summary is injected into the agent's instructions
- **Session tools** — agents can call `session_status` and `session_history` to recall previous work

### Auto-Retry Engine

Built-in retry logic with exponential backoff, jitter, and error classification. Four presets are available:

| Preset | Max Retries | Base Delay | Max Delay | Use Case |
|--------|-------------|------------|-----------|----------|
| `aiCall` | 3 | 1s | 30s | AI provider API calls |
| `toolExecution` | 2 | 500ms | 5s | Tool execution |
| `network` | 5 | 2s | 60s | Network operations |
| `critical` | 5 | 1s | 60s | Critical operations |

Errors are classified by category (rate limit, network, timeout, server, etc.) with per-category retryability and suggested delay overrides.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for LLM access |
| `OPENROUTER_DEFAULT_MODEL` | Yes | Model identifier (e.g., `anthropic/claude-sonnet-4.5`) |
| `FIRECRAWL_API_KEY` | No | Enables `web_search`, `web_crawl`, and `fetch_url` via Firecrawl SDK |
| `SKILLS_DIRS` | No | Semicolon-separated paths to additional skill directories |

Config file location: `~/.astra/.env`

---

## Project Structure

```
astra/
├── index.ts                        # CLI entry point (Commander)
├── package.json                    # Dependencies, scripts, bin config
├── tsconfig.json                   # TypeScript config (strict, Bun types)
│
├── ai/                             # AI provider configuration
│   ├── index.ts                    # Re-exports getAgentModel
│   ├── ai.config.ts                # OpenRouter provider setup
│   ├── config-loader.ts            # ~/.astra/.env management
│   ├── auto-retry.ts               # Automatic retry integration
│   └── retry-prompt.ts             # Manual retry prompt fallback
│
├── tui/                            # Terminal UI
│   ├── terminal-md.ts              # Markdown → terminal rendering
│   ├── spinner.ts                  # Animated spinner with elapsed time
│   └── wakeup.ts                   # Banner + top-level mode selection
│
├── modes/                          # Interaction modes
│   ├── cli.ts                      # CLI mode loop
│   ├── auto.ts                     # Auto-router (intent classification)
│   ├── setup.ts                    # Configuration wizard
│   │
│   ├── agent/                      # Agent mode
│   │   ├── types.ts                # Type definitions + default config
│   │   ├── action-tracker.ts       # Append-only action log
│   │   ├── tool-executor.ts        # Core execution engine + staging overlay
│   │   ├── agent-tools.ts          # Vercel AI SDK tool definitions
│   │   ├── diff-view.ts            # Unified diff generation
│   │   ├── approval.ts             # Interactive approval flow
│   │   └── orchestrator.ts         # Agent loop + approval + apply
│   │
│   ├── ask/                        # Ask mode (read-only Q&A)
│   │   └── orchestrator.ts
│   │
│   ├── plan/                       # Plan mode
│   │   ├── types.ts                # Plan and PlanStep interfaces
│   │   ├── planner.ts              # LLM-driven plan generation
│   │   ├── selection.ts            # Interactive step picker
│   │   ├── web-tools.ts            # Firecrawl web tools
│   │   └── orchestrator.ts         # Plan → select → execute → approve
│   │
│   └── multi/                      # Multi-agent mode
│       ├── types.ts                # Full type system
│       ├── agent-pool-manager.ts   # Agent registration and tracking
│       ├── message-broker.ts       # Pub-sub communication channel
│       ├── multi-agent-orchestrator.ts  # Strategy dispatch engine
│       ├── workflow-builder.ts     # Fluent API + predefined templates
│       ├── examples.ts             # Example workflow configurations
│       └── orchestrator.ts         # Multi-agent approval flow
│
├── session/                        # Session persistence
│   ├── index.ts                    # Public API re-exports
│   ├── store.ts                    # JSON file store (atomic writes)
│   ├── session-manager.ts          # Begin/end/resume/summarise
│   ├── session-context.ts          # Context capture and summary
│   └── session-tools.ts            # session_status + session_history tools
│
├── core/                           # Core utilities
│   └── retry/                      # Retry engine
│       ├── index.ts                # Public API re-exports
│       ├── retry-config.ts         # Configuration and presets
│       ├── retry-engine.ts         # Execution with backoff + jitter
│       └── error-classifier.ts     # Error categorisation
│
└── game/                           # Standalone arcade games
    ├── index.html                  # Snake (HTML5 Canvas)
    └── neon-breaker.html           # Brick Breaker
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@openrouter/ai-sdk-provider` | OpenRouter as LLM provider for Vercel AI SDK |
| `@clack/prompts` | Interactive terminal prompts |
| `ai` | Vercel AI SDK (ToolLoopAgent, generateText, stepCountIs) |
| `@mendable/firecrawl-js` | Web search, crawling, and scraping |
| `commander` | CLI argument parsing |
| `chalk` | Terminal string styling |
| `figlet` | ASCII art banner generation |
| `marked` + `marked-terminal` | Markdown parsing and terminal rendering |
| `diff` | Unified diff generation |
| `dotenv` | `.env` file loading |
| `zod` | Schema validation |

---

## Roadmap

- [ ] **Telegram mode** — stub present in wakeup menu
- [ ] **Undo/redo support** — via action log replay
- [ ] **Streaming token output** — for real-time agent response display
- [ ] **Configurable tool allowlists per mode** — currently hardcoded per mode
- [ ] **Multi-model support with per-mode model selection** — partially implemented in multi-agent
- [ ] **Persistent action history across sessions** — sessions store summaries but not full action logs

---

## License

MIT
