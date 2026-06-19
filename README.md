<div align="center">

# ✨ Astra

**AI-native development companion — Agent, Ask, Plan, Auto, and Multi-Agent modes in your terminal.**

[![npm version](https://img.shields.io/npm/v/astrabot?style=flat-square&logo=npm)](https://www.npmjs.com/package/astrabot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-bun-black?style=flat-square&logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## Table of Contents

- [What Is Astra?](#what-is-astra)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
- [Interaction Modes](#interaction-modes)
- [Tool System](#tool-system)
- [Staging & Approval Pipeline](#staging--approval-pipeline)
- [Session Management](#session-management)
- [Multi-Agent Orchestration](#multi-agent-orchestration)
- [Sandbox Mode](#sandbox-mode)
- [Skills System](#skills-system)
- [Project Structure](#project-structure)
- [Dependencies](#dependencies)
- [Roadmap](#roadmap)
- [License](#license)

---

## What Is Astra?

Astra is an **AI-native development companion** that brings agentic coding capabilities directly to your terminal. It gives an LLM full programmatic access to your filesystem, shell, and the web — all gated behind a **staging and approval system** that keeps you in control at all times.

Built on [Bun](https://bun.sh), powered by [OpenRouter](https://openrouter.ai), and leveraging the [Vercel AI SDK](https://sdk.vercel.ai)'s `ToolLoopAgent` for autonomous, multi-step tool-driven workflows.

| Mode | Purpose | File Mutations? |
|------|---------|:---------------:|
| **Auto** | LLM-powered intent router — picks the best mode for your request | Depends on route |
| **Agent** | Autonomous multi-step code modifications | ✅ (staged) |
| **Ask** | Read-only Q&A about your codebase | ❌ (except optional save) |
| **Plan** | Structured multi-step planning with selective execution | ✅ (staged) |
| **Multi-Agent** | Multiple agents working in configurable topologies | ✅ (staged) |

---

## Features

- **Five interaction modes** — Auto, Agent, Ask, Plan, and Multi-Agent
- **35+ agent tools** — filesystem, shell, git, web research, project intelligence, and more
- **Streaming output** — real-time text generation with live token telemetry (↑input / ↓output, tok/s)
- **Staging-first mutations** — no file is written or deleted without your explicit approval
- **Per-file diff review** — granular approval flow with unified diffs
- **Persistent sessions** — stored to disk with LLM-generated summaries; auto-resume on interruption
- **Multi-agent orchestration** — 5 strategies (Sequential, Parallel, Hierarchical, Collaborative, DAG), 5 agent roles, 6 pre-built workflow templates
- **Sandbox mode** — secure execution environment with OS keychain credential storage and HMAC-signed communication
- **Skills system** — 5 built-in skills discoverable by agents (code-review, documentation, git-workflow, project-setup, test-runner)
- **Web research** — search (Firecrawl or DuckDuckGo fallback), crawl, and URL fetch
- **Rich terminal UI** — interactive prompts, markdown rendering, animated ASCII banner, colored logging
- **Cross-platform installers** — automated setup for Linux/macOS and Windows
- **Arcade** — 5 mini-games served via Bun's native HTTP server (easter egg)

---

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| [Bun](https://bun.sh) | >= 1.0.0 | JavaScript/TypeScript runtime |
| [OpenRouter](https://openrouter.ai) API key | — | LLM provider access (**required**) |
| [Firecrawl](https://www.firecrawl.dev/) API key | — | Web search and crawling (**optional**) |

> **Note:** Astra runs on **Bun**, not Node.js. npm/npx are used only for package distribution.

---

## Installation

### Option 1: Cross-Platform Installer (Recommended)

**Linux / macOS:**
```bash
bash install/install.sh
```

**Windows:**
```cmd
install\install.bat
```

Both scripts handle PATH configuration and guide you to run `astra setup` afterward.

### Option 2: Install Globally via npm

```bash
npm install -g astrabot
astra --version
```

Update: `npm update -g astrabot` · Uninstall: `npm uninstall -g astrabot`

### Option 3: Run Directly with npx (No Installation)

```bash
npx astrabot setup
npx astrabot wakeup
npx astrabot "explain how this works"
```

### Option 4: Install from Source

```bash
git clone https://github.com/<your-username>/astrabot.git
cd astrabot
bun install
bun run index.ts setup
```

---

## Quick Start

```bash
# 1. Install
npm install -g astrabot

# 2. Configure API keys (interactive wizard)
astra setup

# 3. Navigate to your project
cd /path/to/your/project

# 4. Use it
astra wakeup                        # Interactive menu
astra "fix the bug in store.ts"     # Direct auto-router execution
```

---

## Configuration

Astra is configured through environment variables loaded from `~/.astra/.env`.

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key | `sk-or-v1-abc123...` |
| `OPENROUTER_DEFAULT_MODEL` | Default model identifier | `anthropic/claude-3.5-sonnet` |

### Optional

| Variable | Description | Example |
|----------|-------------|---------|
| `FIRECRAWL_API_KEY` | Enables web_search, web_crawl, fetch_url via Firecrawl | `fc-abc123...` |
| `SKILLS_DIRS` | Semicolon-separated paths to custom skill directories | `/path/to/skills;/another/dir` |

### Retry Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ASTRA_AGENT_RETRY_ENABLED` | `true` | Enable automatic retry for agent AI calls |
| `ASTRA_AGENT_RETRY_MAX` | `3` | Maximum retry attempts for agent calls |
| `ASTRA_AGENT_RETRY_PROGRESS` | `true` | Show retry progress in the terminal |
| `ASTRA_MULTI_RETRY_ENABLED` | `true` | Enable retry for multi-agent steps |
| `ASTRA_MULTI_RETRY_MAX` | `2` | Maximum retry attempts for multi-agent steps |
| `ASTRA_MULTI_RETRY_BACKOFF` | `2` | Backoff multiplier for multi-agent retries |

### File Locations

| Path | Purpose |
|------|---------|
| `~/.astra/.env` | Environment variables (API keys, model, settings) |
| `~/.astra/sessions/index.json` | Session store (persisted conversation history) |
| `~/.astra/sessions/<session-id>.json` | Individual session action logs |
| `~/.astra/.secure/sandbox.enc` | Encrypted sandbox credentials (if OS keychain unavailable) |
| `~/.astra/logs/astra.log` | Rotating error log file (5 MiB max, 3 backups) |

### Setup Wizard

```bash
astra setup
```

Prompts for your OpenRouter API key, model selection (with search and pricing), optional Firecrawl key, and optional custom skills directories. Re-run at any time to update.

---

## Commands

### `astra` (Default — Auto-Router)

```bash
astra [prompt...]
```

- **With prompt** — `astra "fix the bug in store.ts"` classifies intent and routes to the best mode automatically.
- **Without prompt** — falls back to the interactive wakeup menu.

### `astra wakeup`

Launches the interactive menu with animated ASCII banner. Checks for interrupted sessions and offers to resume before showing mode options.

### `astra setup`

Interactive configuration wizard. See [Configuration](#configuration).

### `astra sandbox`

Activates sandbox mode — a secure execution environment with OS keychain credential storage and HMAC-signed server communication.

### `astra play`

Launches the arcade — a game selector with 5 mini-games (Retro Snake Classic, Neon Brick Breaker, Neon Pong, Neon Memory, Neon Tetris). Spawns a local server on port `4321` and opens your browser.

### `astra reset`

Purges **all** stored configurations, sessions, and credentials from `~/.astra/`. Requires explicit confirmation.

---

## Interaction Modes

### Auto Mode

An LLM-based intent classifier that routes your request to the best mode:

```
"fix the bug in store.ts"          → agent
"explain how this app works"       → ask
"design a new authentication system" → plan
"run a security audit"             → multi
```

Falls back to `agent` on classification failure. The original prompt is forwarded to the selected mode.

### Agent Mode

The primary autonomous coding mode. The agent has full tool access and performs multi-step file modifications, shell commands, and web research. All mutations are staged and presented for approval with diffs. Up to 50 tool-calling steps per run.

### Ask Mode

Read-only Q&A. The agent can read files, search the codebase, and browse the web, but cannot modify files (except optionally saving the response as `.md`). Up to 25 steps.

### Plan Mode

Breaks a high-level goal into a structured plan (1–20 steps) with complexity ratings. You select which steps to execute; each runs as an independent agent. All changes are batched for a single approval review.

### Multi-Agent Mode

Coordinates multiple AI agents working together. The LLM analyzes your goal and either selects a pre-built template or designs a custom agent team. Supports 5 orchestration strategies and per-agent model overrides.

---

## Tool System

Astra exposes **35+ tools** to the AI agent:

### File System

| Tool | Description | Mutates? |
|------|-------------|:--------:|
| `read_file` | Read a text file | ❌ |
| `read_multiple_files` | Read multiple files in one call | ❌ |
| `create_file` | Stage creation of a new file | ✅ |
| `modify_file` | Stage a full-file replacement | ✅ |
| `delete_file` | Stage deletion of a file | ✅ |
| `create_folder` | Stage creation of a directory tree | ✅ |
| `list_files` | List files and directories | ❌ |
| `search_files` | Find files matching a glob pattern | ❌ |
| `analyze_codebase` | Summarize project structure | ❌ |
| `grep` | Search file contents by text query | ❌ |
| `replace_in_file` | Replace text inside a file | ✅ |
| `append_to_file` | Append content to a file | ✅ |
| `insert_at_line` | Insert content at a specific line | ✅ |

### Shell & Execution

| Tool | Description | Mutates? |
|------|-------------|:--------:|
| `run_command` | Run a command synchronously | ❌ |
| `run_background_command` | Start a long-running process | ❌ |
| `execute_shell` | Queue a command for post-approval execution | ✅ |
| `run_tests` | Run the project's test suite | ❌ |
| `run_test_file` | Run a specific test file | ❌ |
| `lint_project` | Run linting | ❌ |
| `format_project` | Run formatting | ❌ |

### Git

| Tool | Description |
|------|-------------|
| `git_status` | Get `git status --short` |
| `git_diff` | Get `git diff` (optionally staged) |
| `git_log` | Get recent commits |

### Project Intelligence

| Tool | Description |
|------|-------------|
| `detect_framework` | Detect framework from `package.json` |
| `read_package_json` | Read and summarize `package.json` |

### Web

| Tool | Description | Requires |
|------|-------------|----------|
| `web_search` | Search the web (title/url/snippet) | Firecrawl key (or DuckDuckGo fallback) |
| `web_crawl` | Scrape a URL into markdown | Firecrawl key |
| `fetch_url` | HTTP GET, returns response body | — |

### Planning

| Tool | Description |
|------|-------------|
| `create_plan` | Create a task execution plan |
| `get_plan` | Retrieve the current plan |

### Staging

| Tool | Description |
|------|-------------|
| `show_pending_changes` | Display all staged operations |
| `discard_changes` | Discard all staged operations |

### Skills

| Tool | Description |
|------|-------------|
| `list_skills` | List `SKILL.md` files from skill directories |
| `read_skill` | Read a specific `SKILL.md` file |

### Session

| Tool | Description |
|------|-------------|
| `session_status` | Check recent session history |
| `session_search` | Search previous sessions by keyword |
| `session_resume_context` | Get full context of a previous session |

---

## Staging & Approval Pipeline

No mutation ever touches disk without explicit user consent.

```
Agent calls mutation tool (create_file, modify_file, etc.)
    │
    ▼
┌──────────────────────────────┐
│ 1. Path safety validation    │  ← Must be within workspace root
│ 2. Exclude pattern check     │  ← node_modules, .git, etc. blocked
│ 3. File size check           │  ← Max 1 MB for reads
│ 4. Stage in memory overlay   │  ← Map<string,string> + Set<string>
│ 5. Log to ActionTracker      │  ← Append-only audit trail
└──────────────────────────────┘
    │
    ▼
Agent finishes → Approval Flow
    │
    ├─ "Approve and apply all"
    ├─ "Review one by one"  ← per-file with diffs
    └─ "Cancel"             ← all discarded
    │
    ▼ (if approved)
┌──────────────────────────────┐
│ applyApprovedFromTracker()   │
│ 1. Create folders            │
│ 2. Write/delete files        │
│ 3. Execute queued shell cmds │
└──────────────────────────────┘
```

Diffs use unified format with 3 lines of context. Large diffs are truncated for readability.

---

## Session Management

- **Persistent storage** — sessions saved to `~/.astra/sessions/index.json` with LLM-generated summaries
- **In-memory cache** — debounced disk writes (500ms) for optimal performance
- **Auto-resume** — interrupted sessions detected on startup and offered for resumption
- **3-tier resume priority** — explicit ID → interrupted in same workspace → keyword overlap ≥30%
- **Rich context on resume** — goals, summary, pending files, action counts, recent transcript

---

## Multi-Agent Orchestration

### Strategies

| Strategy | Behavior |
|----------|----------|
| **Sequential** | Agents run one after another; each sees previous outputs |
| **Parallel** | Agents run simultaneously in configurable batches |
| **Hierarchical** | Coordinator plans, then specialists execute |
| **Collaborative** | Agents take turns; outputs broadcast via MessageBroker |
| **DAG** | Agents run when dependencies are satisfied; cycle detection included |

### Agent Roles

| Role | Permissions | Max Steps | Tools |
|------|------------|:---------:|:-----:|
| `researcher` | Read-only | 30 | 16 |
| `implementer` | Full read/write/execute | 50 | 26 |
| `reviewer` | Read + execute (no writes) | 25 | 15 |
| `coordinator` | Read-only + planning | 20 | 8 |
| `custom` | Configurable | 30 | Variable |

### Workflow Templates

| Template | Agents | Strategy |
|----------|--------|----------|
| **Code Review** | Researcher → Implementer → Reviewer | Sequential |
| **Feature Development** | Coordinator → Backend + Frontend → QA | DAG |
| **Bug Fixing** | Debug → Fix → Test | Sequential |
| **Collaborative Research** | Researcher 1 + 2 + 3 | Parallel |
| **Security Audit** | Scanner → Static + Dependency Auditor → Report | DAG |
| **Full-Stack Feature** | Architect → DB + API + UI Dev → Integration Tester | DAG |

---

## Sandbox Mode

A secure, self-contained execution environment:

- **One-click activation** — `astra sandbox`
- **OS keychain storage** — API keys stored in macOS Keychain, Windows Credential Vault, or Linux Secret Service, with AES-256-GCM encrypted file fallback
- **HMAC-signed requests** — SHA-256 HMAC with timestamps for replay protection
- **Fixed model** — Uses `openrouter/owl-alpha`
- **Remote server** — `https://astra-server-oh6s.onrender.com`

---

## Skills System

Five built-in skills discoverable by agents via `list_skills` and `read_skill`:

| Skill | Description |
|-------|-------------|
| **code-review** | Structured code review checklist (quality, security, testing) |
| **documentation** | Standards for README, CHANGELOG, and TSDoc comments |
| **git-workflow** | Branch naming, conventional commits, pre-commit checklist |
| **project-setup** | Development environment setup guide |
| **test-runner** | Test execution patterns and result interpretation |

Skills are loaded from: `.skills/` (built-in), `~/.cursor/skills-cursor/`, `~/.claude/skills/`, and custom paths via `SKILLS_DIRS`.

---

## Project Structure

```
astrabot/
├── index.ts                        # CLI entry point (Commander)
├── package.json                    # Package config
├── tsconfig.json                   # TypeScript config
├── bun.lock                        # Bun lockfile
├── bin/astra                       # Binary entry point (#!/usr/bin/env bun)
│
├── install/                        # Cross-platform installer scripts
│   ├── install.sh                  # Linux/macOS
│   └── install.bat                 # Windows
│
├── ai/                             # AI provider configuration
│   ├── ai.config.ts                # OpenRouter provider setup
│   ├── config-loader.ts            # ~/.astra/.env management
│   ├── auto-retry.ts               # AI call retry wrapper
│   ├── retry-prompt.ts             # Manual retry prompt
│   ├── sandbox-config.ts           # Sandbox activation & HMAC signing
│   └── secure-storage.ts           # Encrypted credential storage
│
├── core/                           # Core utilities
│   ├── logger.ts                   # Centralised error logger (rotating file)
│   └── retry/                      # Retry engine
│       ├── retry-config.ts         # ErrorCategory enum, RetryConfig, presets
│       ├── retry-engine.ts         # withRetry(), RetryPresets
│       └── error-classifier.ts     # Error classification
│
├── tui/                            # Terminal UI
│   ├── terminal-md.ts              # Markdown-to-terminal rendering
│   ├── spinner.ts                  # Animated spinner with metabolic rate engine
│   └── wakeup.ts                   # ASCII banner with breathing animation
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
│   ├── ask/                        # Ask mode (read-only Q&A)
│   │   └── orchestrator.ts
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
│   ├── store.ts                    # JSON file store (atomic writes)
│   ├── session-manager.ts          # Lifecycle & auto-resume
│   ├── session-context.ts          # Context summary for resumption
│   ├── session-tools.ts            # session_status, search, resume
│   └── session-cache.ts            # In-memory cache (debounced writes)
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
└── private/                        # Internal planning documents (not shipped)
```

---

## Dependencies

### Runtime

| Package | Version | Purpose |
|---------|---------|---------|
| `@openrouter/ai-sdk-provider` | ^2.9.0 | OpenRouter LLM provider |
| `@clack/prompts` | ^1.4.0 | Interactive terminal prompts |
| `@mendable/firecrawl-js` | ^4.25.1 | Web search and crawling |
| `commander` | ^15.0.0 | CLI argument parsing |
| `chalk` | ^5.6.2 | Terminal string styling |
| `figlet` | ^1.11.0 | ASCII art banner |
| `marked` | ^18.0.4 | Markdown parser |
| `marked-terminal` | ^7.3.0 | Markdown terminal renderer |
| `diff` | ^9.0.0 | Unified diff generation |
| `dotenv` | ^17.4.2 | .env file loading |
| `docx` | ^9.7.1 | Word document generation |

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

## Roadmap

- [x] Streaming token output with real-time telemetry
- [x] Direct prompt argument (`astra "goal"`)
- [x] Sandbox mode with secure credential storage
- [x] Session store cache with debounced writes
- [x] Cross-platform installers
- [x] Skills system (5 built-in skills)
- [x] Centralised error logger
- [x] Sandbox remote server migration
- [ ] Telegram mode
- [ ] Undo/redo support via action log replay
- [ ] Configurable tool allowlists per mode
- [ ] Per-mode model selection
- [ ] Persistent action history across sessions

---

## License

[MIT](LICENSE)

---

<div align="center">

**Astra** — Your AI-native development companion.

Built with ❤️ using [Bun](https://bun.sh) · [OpenRouter](https://openrouter.ai) · [Vercel AI SDK](https://sdk.vercel.ai)

</div>
