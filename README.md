<div align="center">

# ✨ Astra

**AI-native development companion — Agent, Ask, Plan, and Multi-Agent modes in your terminal.**

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
  - [Option 1: Cross-Platform Installer (Recommended)](#option-1-cross-platform-installer-recommended)
  - [Option 2: Install Globally via npm](#option-2-install-globally-via-npm)
  - [Option 3: Run Directly with npx (No Installation)](#option-3-run-directly-with-npx-no-installation)
  - [Option 4: Install from Source](#option-4-install-from-source)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Required Environment Variables](#required-environment-variables)
  - [Optional Environment Variables](#optional-environment-variables)
  - [Retry Configuration Variables](#retry-configuration-variables)
  - [Config File Locations](#config-file-locations)
  - [Running the Setup Wizard](#running-the-setup-wizard)
- [Commands](#commands)
  - [`astra` (Default — Auto-Router)](#astra-default--auto-router)
  - [`astra wakeup`](#astra-wakeup)
  - [`astra setup`](#astra-setup)
  - [`astra sandbox`](#astra-sandbox)
  - [`astra play`](#astra-play)
  - [`astra reset`](#astra-reset)
- [Interaction Modes](#interaction-modes)
  - [Auto Mode](#auto-mode)
  - [Agent Mode](#agent-mode)
  - [Ask Mode](#ask-mode)
  - [Plan Mode](#plan-mode)
  - [Multi-Agent Mode](#multi-agent-mode)
- [Tool System — Complete Reference](#tool-system--complete-reference)
- [Staging & Approval Pipeline](#staging--approval-pipeline)
- [Session Management](#session-management)
- [Multi-Agent Orchestration](#multi-agent-orchestration)
  - [Orchestration Strategies](#orchestration-strategies)
  - [Agent Roles](#agent-roles)
  - [Workflow Templates](#workflow-templates)
  - [Workflow Builder (Fluent API)](#workflow-builder-fluent-api)
- [Sandbox Mode](#sandbox-mode)
- [Skills System](#skills-system)
- [Retry & Error Handling](#retry--error-handling)
- [Project Structure](#project-structure)
- [Dependencies](#dependencies)
- [Roadmap](#roadmap)
- [License](#license)

---

## What Is Astra?

Astra is an **AI-native development companion** that brings **agentic coding capabilities** directly to your terminal. Rather than being a simple chatbot or code-completion engine, Astra gives a Large Language Model (LLM) **full programmatic access** to your filesystem, shell, and the web — all gated behind a **carefully designed approval system** that keeps you in control at all times.

Built on **[Bun](https://bun.sh)**, powered by **[OpenRouter](https://openrouter.ai)** (supporting any model on that platform), and leveraging the **[Vercel AI SDK](https://sdk.vercel.ai)**'s `ToolLoopAgent` for autonomous, multi-step tool-driven workflows.

Astra provides **five distinct interaction modes** within a single CLI interface:

| Mode | Purpose | File Mutations? |
|------|---------|:---------------:|
| **Auto** | LLM-powered intent router — automatically picks the best mode for your request | Depends on route |
| **Agent** | Autonomous multi-step code modifications | ✅ (staged) |
| **Ask** | Read-only Q&A about your codebase | ✅ (except optional save) |
| **Plan** | Structured multi-step planning with selective execution | ✅ (staged) |
| **Multi-Agent** | Multiple agents working together in configurable topologies | ✅ (staged) |

---

## Features

### 🧠 AI-Powered Development
- **Five interaction modes** — Auto, Agent, Ask, Plan, and Multi-Agent, each tailored to a different development workflow
- **35+ agent tools** — full filesystem access, shell execution, git integration, web research, project-aware tooling, and more
- **Auto-router** — automatically classifies your request and routes it to the most appropriate mode
- **Multi-model support** — different agents can use different LLMs in Multi-Agent mode
- **Streaming output** — all modes use `agent.stream()` for real-time text generation display as the model produces output
- **Token telemetry** — live token counters (↑input / ↓output) shown during agent execution with velocity summary (tok/s) at completion

### 🔒 Safety First
- **Staging-first mutations** — no file is ever written or deleted without your explicit approval; all changes are staged in memory and presented for review before apply
- **Per-file diff review** — granular approval flow with unified diffs so you can inspect exactly what changed
- **Configurable safety** — exclude patterns (`node_modules`, `.git`, `dist`, `build`, `.next`, `*.log`, `.env*`), file size limits (default 1 MB), and per-tool permission toggles per agent role
- **Path traversal prevention** — strict boundary validation on all filesystem operations
- **Sandbox mode** — optional secure execution environment with OS keychain credential storage and HMAC-signed server communication

### 💾 Session Management
- **Persistent sessions** — sessions are stored to disk with LLM-generated summaries, enabling resumption after interruption
- **In-memory cache** — session reads served from memory with debounced disk writes for optimal performance
- **Auto-resume** — interrupted sessions are detected on startup and offered for resumption
- **Session tools** — agents can query previous sessions via built-in `session_status`, `session_search`, and `session_resume_context` tools
- **Multi-turn goal tracking** — tracks every user goal across a session for full context awareness

### 👥 Multi-Agent Orchestration
- **Five orchestration strategies** — Sequential, Parallel, Hierarchical, Collaborative, and DAG
- **DAG (Directed Acyclic Graph)** — agents run when dependencies are satisfied, with cycle detection and deadlock handling
- **Five agent roles** — Researcher, Implementer, Reviewer, Coordinator, and Custom
- **Six pre-built workflow templates** — Code Review, Feature Development, Bug Fixing, Collaborative Research, Security Audit, and Full-Stack Feature
- **Fluent workflow builder** — programmatically construct custom agent topologies with validation
- **Inter-agent messaging** — publish-subscribe communication channel for collaborative workflows
- **Per-agent retry** — configurable retry logic with exponential backoff for each agent

### 🌐 Web Research
- **Web search** — via Firecrawl SDK or DuckDuckGo fallback
- **Web crawling** — scrape any URL into markdown via Firecrawl
- **URL fetching** — HTTP GET with response body extraction

### 🎨 Rich Terminal UI
- **Interactive prompts** — via `@clack/prompts` (select, confirm, text, multiselect, autocomplete)
- **Markdown rendering** — agent responses rendered as formatted markdown in the terminal
- **ASCII art banner** — animated breathing banner with twinkling star field on startup
- **Animated spinners** — metabolic-rate-based spinner with dynamic color gradients and elapsed time
- **Colored logging** — green for agent actions, cyan for ask mode, yellow for warnings, red for errors

### 🎮 Easter Egg
- **Arcade mini-games** — Retro Snake Classic, Neon Brick Breaker, Neon Pong, and Cosmic Drifter, served via Bun's native HTTP server

### 📦 Easy Installation
- **Cross-platform installers** — automated setup scripts for Linux/macOS (`install.sh`) and Windows (`install.bat`)
- **Skills system** — 5 built-in skills (code-review, documentation, git-workflow, project-setup, test-runner) discoverable by agents

---

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| [Bun](https://bun.sh) | >= 1.0.0 | JavaScript/TypeScript runtime |
| [OpenRouter](https://openrouter.ai) API key | — | LLM provider access (**required**) |
| [Firecrawl](https://www.firecrawl.dev/) API key | — | Web search and crawling (**optional**) |
| [Node.js](https://nodejs.org) | >= 18 | For npm/npx (if not using Bun directly) |

> **Note:** Astra runs on **Bun**, not Node.js. Bun is used as the runtime for executing the TypeScript source directly. npm/npx are used only for package distribution.

---

## Installation

### Option 1: Cross-Platform Installer (Recommended)

The easiest way to get started. The installer automatically detects and installs Node.js, Bun, and the `astrabot` package.

**Linux / macOS:**
```bash
bash install/install.sh
```

**Windows:**
```cmd
install\install.bat
```

Both scripts handle PATH configuration, permission issues, and guide you to run `astra setup` after installation.

### Option 2: Install Globally via npm

This is the recommended approach for regular use if you already have Bun installed. Installing globally makes the `astra` command available system-wide.

```bash
npm install -g astrabot
```

After installation, verify it works:

```bash
astra --version
```

You can now run Astra from any directory:

```bash
cd /path/to/your/project
astra setup      # Configure API keys
astra wakeup     # Launch the interactive menu
astra "fix the bug"  # Direct auto-router execution
```

To update to the latest version:

```bash
npm update -g astrabot
```

To uninstall:

```bash
npm uninstall -g astrabot
```

### Option 3: Run Directly with npx (No Installation)

If you don't want to install anything permanently, you can run Astra directly using `npx`. This downloads and executes the package on-the-fly each time.

```bash
# Run the setup wizard
npx astrabot setup

# Launch the interactive menu
npx astrabot wakeup

# Show the version
npx astrabot --version

# Run auto-router with a direct prompt
npx astrabot "explain how this works"

# Launch the arcade easter egg
npx astrabot play

# Activate sandbox mode
npx astrabot sandbox

# Reset all configuration and sessions
npx astrabot reset
```

> **Tip:** The first run with `npx` may take a few seconds as it downloads the package. Subsequent runs are faster due to npx's cache.

### Option 4: Install from Source

For development or if you want to modify the code:

```bash
# Clone the repository
git clone https://github.com/<your-username>/astrabot.git
cd astrabot

# Install dependencies
bun install

# Link the binary globally (optional)
bun link

# Or run directly
bun run index.ts setup
bun run index.ts wakeup
```

---

## Quick Start

```bash
# 1. Install Astra (using any method above)
npm install -g astrabot

# 2. Configure your API keys (interactive wizard)
astra setup
# → Enter your OpenRouter API key (required)
# → Select a model (e.g., anthropic/claude-3.5-sonnet)
# → Optionally set Firecrawl API key for web search
# → Optionally set custom skills directories

# 3. Navigate to your project
cd /path/to/your/project

# 4. Launch Astra — interactive menu or direct prompt
astra wakeup
astra "fix the bug in store.ts"

# 5. If using interactive mode:
#    → Interactive CLI Mode → select Agent / Ask / Plan / Multi-Agent / Auto
#    → Follow the prompts and approve changes when asked
```

---

## Configuration

Astra is configured entirely through environment variables, loaded from `~/.astra/.env`.

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM access | `sk-or-v1-abc123...` |
| `OPENROUTER_DEFAULT_MODEL` | Default model identifier | `anthropic/claude-3.5-sonnet` |

### Optional Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `FIRECRAWL_API_KEY` | Enables `web_search`, `web_crawl`, and `fetch_url` tools via Firecrawl SDK | `fc-abc123...` |
| `SKILLS_DIRS` | Semicolon-separated paths to custom skill directories | `/path/to/skills;/another/dir` |

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

### Running the Setup Wizard

The easiest way to configure Astra is through the interactive setup wizard:

```bash
astra setup
```

The wizard will:
1. Prompt for your **OpenRouter API key** (required)
2. Fetch all available models from OpenRouter and let you **search and select** one with pricing information
3. Optionally configure a **Firecrawl API key** for web search and crawling
4. Optionally configure **custom skills directories**
5. Save everything to `~/.astra/.env`, preserving existing values

You can re-run `astra setup` at any time to update your configuration.

---

## Commands

### `astra` (Default — Auto-Router)

```bash
astra [prompt...]
```

When called without a subcommand, Astra runs the **auto-router** by default:

- **With a prompt argument** — `astra "fix the bug in store.ts"` immediately classifies your request and routes it to the most appropriate mode (agent, ask, plan, or multi-agent). No interactive menu is shown.
- **Without arguments** — falls back to the interactive wakeup menu (same as `astra wakeup`).

```bash
# Direct execution — auto-router picks the right mode
astra "explain how authentication works"
astra "refactor the database layer"
astra "create a REST API with Express"

# Interactive menu (no arguments)
astra
```

### `astra wakeup`

```bash
astra wakeup
```

Launches the main entry point. Displays the animated ASCII art banner and presents the top-level mode selection:

- **Interactive CLI Mode** → enters the mode loop (Auto / Agent / Ask / Plan / Multi-Agent)
- **Telegram Gateway Interface** → placeholder (not yet implemented)
- **Exit Application** → quits

Before the mode menu, it automatically checks for interrupted sessions and offers to resume them.

### `astra setup`

```bash
astra setup
```

Interactive configuration wizard for API keys and settings. See [Configuration](#configuration) above.

### `astra sandbox`

```bash
astra sandbox
```

Activates sandbox mode — a secure execution environment. Connects to a local sandbox server, fetches an API key, and stores it in the OS keychain. Uses HMAC-signed requests for server communication. If already active, offers to reconfigure.

### `astra play`

```bash
astra play
```

Launches the arcade easter egg — an interactive game selector that lets you choose between:

- **Retro Snake Classic** — full Snake game with gradient backgrounds, glow effects, snake eyes, input queue, high score in localStorage, mobile touch controls, pause/resume, and High DPI support
- **Neon Brick Breaker** — Brick Breaker game built with HTML5 Canvas
- **Neon Pong** — Pong game built with HTML5 Canvas
- **Cosmic Drifter** — Space-themed arcade game

A local Bun HTTP server is spawned on port `4321` and the game is automatically opened in your default browser.

### `astra reset`

```bash
astra reset
```

Interactive danger-zone command that completely purges **all** stored configurations, sessions, and credentials from `~/.astra/`. Requires explicit confirmation before proceeding.

---

## Interaction Modes

### Auto Mode

Auto mode uses an LLM-based intent classifier to automatically determine which mode is best suited for your request:

```
User: "fix the bug in store.ts"
  → Classified as: agent

User: "explain how this app works"
  → Classified as: ask

User: "design a new authentication system"
  → Classified as: plan

User: "run a security audit with multiple reviewers"
  → Classified as: multi
```

The classification prompt instructs the LLM to respond with exactly one word: `ask`, `plan`, `multi`, or `agent`. On classification failure, it defaults to `agent`. The user's original prompt is forwarded to the selected mode, so no information is lost.

Auto mode creates its own session entry to log the routing decision before delegating.

### Agent Mode

The primary autonomous coding mode. The agent has full access to all tools and can perform multi-step file modifications, shell commands, and web research.

**Flow:**
1. **Goal input** — "What would you like the agent to do for you?"
2. **Agent execution** — the LLM autonomously calls tools (up to 50 steps) to accomplish the goal, with streaming output displayed in real-time
3. **Live tool logging** — each tool call is logged in real-time with descriptive context (e.g., "reading src/foo.ts"), step duration, and token counts
4. **Approval flow** — all staged changes are presented for review with diffs
5. **Apply** — approved changes are written to disk

**Key behaviors:**
- All mutations are staged in an in-memory overlay — nothing touches disk until you approve
- File creations during the agent loop go through immediate per-file approval
- On AI provider errors, automatic retry kicks in (configurable, default 3 retries with exponential backoff)
- If all retries are exhausted, you're offered a manual retry option
- Sessions are automatically created and can be resumed if interrupted

### Ask Mode

A read-only Q&A interface. The agent can read files, search the codebase, and browse the web, but **cannot modify any files** (except optionally saving the response).

**Flow:**
1. **Question input** — "What do you like the agent to do for you?"
2. **Read-only agent** — the LLM uses only read-only tools (up to 25 steps)
3. **Answer display** — response rendered as formatted markdown in the terminal
4. **Optional save** — you can save the Q&A as a `.md` file with `## Question` / `## Answer` formatting

**Retry logic:** Ask mode has a bounded retry loop (max 5 attempts) with exponential backoff and jitter for resilience against transient provider errors.

### Plan Mode

Breaks a high-level goal into a structured, executable plan with selective step execution.

**Flow:**
1. **Goal input** — "What is your goal?"
2. **Plan generation** — the LLM researches the codebase and generates a structured plan (1–20 steps) with complexity ratings (`low`, `medium`, `high`)
3. **Plan display** — numbered steps with color-coded complexity tags
4. **Step selection** — interactive multiselect to choose which steps to execute (all pre-selected)
5. **Execution** — each selected step runs as an independent `ToolLoopAgent` (50 steps max each)
6. **Batch approval** — all changes across all steps are presented together for review
7. **Apply** — approved changes are written to disk

**Web research during planning:** If `FIRECRAWL_API_KEY` is set, the planner can search the web and crawl URLs during plan generation.

### Multi-Agent Mode

Coordinates multiple AI agents working together on complex tasks. This is the most powerful mode, supporting sophisticated agent topologies.

**Flow:**
1. **Goal input** — "What complex operations workflow would you like to run?"
2. **AI-powered workflow design** — the LLM analyzes your goal and either selects a pre-built template or designs a custom agent team with a specific orchestration strategy
3. **Workflow validation** — 10+ validation checks ensure the workflow is well-formed
4. **Execution** — agents run according to the chosen strategy
5. **Results display** — execution summary with status, duration, pool stats, and per-agent results
6. **Per-agent approval** — changes are reviewed per agent with diffs, then applied

**AI workflow designer:** The LLM analyzes your task and responds with a JSON configuration specifying:
- Which pre-built template to use (if any), OR
- A custom agent team with specific roles, models, and an orchestration strategy

---

## Tool System — Complete Reference

Astra exposes **35+ tools** to the AI agent, organized into categories:

### File System Tools

| Tool | Description | Mutates? |
|------|-------------|:--------:|
| `read_file` | Read a text file from the workspace | ❌ |
| `read_multiple_files` | Read multiple files in a single call | ❌ |
| `create_file` | Stage creation of a new file | ✅ |
| `modify_file` | Stage a full-file replacement | ✅ |
| `delete_file` | Stage deletion of a file | ✅ |
| `create_folder` | Stage creation of a directory tree | ✅ |
| `list_files` | List files and directories under a path | ❌ |
| `search_files` | Find files matching a glob pattern with optional content filter | ❌ |
| `analyze_codebase` | Summarize structure: file counts, directory counts | ❌ |
| `grep` | Search file contents using a text query | ❌ |
| `replace_in_file` | Replace text inside a file | ✅ |
| `append_to_file` | Append content to the end of a file | ✅ |
| `insert_at_line` | Insert content at a specific line number | ✅ |

### Shell & Execution Tools

| Tool | Description | Mutates? |
|------|-------------|:--------:|
| `run_command` | Run a command synchronously and capture output | ❌ |
| `run_background_command` | Start a long-running detached process | ❌ |
| `execute_shell` | Queue a shell command for post-approval execution | ✅ |
| `run_tests` | Run the project's test suite (auto-detects runner) | ❌ |
| `run_test_file` | Run a specific test file | ❌ |
| `lint_project` | Run linting (auto-detects: eslint, etc.) | ❌ |
| `format_project` | Run formatting (auto-detects: prettier, etc.) | ❌ |

### Git Tools

| Tool | Description |
|------|-------------|
| `git_status` | Get `git status --short` |
| `git_diff` | Get `git diff` (optionally staged) |
| `git_log` | Get recent commits (`git log --oneline`) |

### Project Intelligence Tools

| Tool | Description |
|------|-------------|
| `detect_framework` | Detect framework from `package.json` (Next.js, React, Vue, Svelte, Node.js) |
| `read_package_json` | Read and summarize `package.json` |

### Web Tools

| Tool | Description | Requires |
|------|-------------|----------|
| `web_search` | Search the web (returns title/url/snippet) | Firecrawl key (or DuckDuckGo fallback) |
| `web_crawl` | Scrape a URL into markdown | Firecrawl key |
| `fetch_url` | HTTP GET for a URL, returns response body | — |

### Planning Tools

| Tool | Description |
|------|-------------|
| `create_plan` | Create a task execution plan |
| `get_plan` | Retrieve the current plan |

### Staging Tools

| Tool | Description |
|------|-------------|
| `show_pending_changes` | Display all staged (pending) operations |
| `discard_changes` | Discard all staged operations |

### Skill Tools

| Tool | Description |
|------|-------------|
| `list_skills` | List `SKILL.md` files from skill directories |
| `read_skill` | Read a specific `SKILL.md` file |

### Session Tools

| Tool | Description |
|------|-------------|
| `session_status` | Check recent session history (mode, goal, outcome, pending tasks) |
| `session_resume_context` | Get full context of a previous session (transcript, files, summary) |
| `session_search` | Search previous sessions by keyword, file name, or goal |

---

## Staging & Approval Pipeline

This is the **safety backbone** of Astra. No mutation ever touches the disk without explicit user consent.

### How It Works

```
Agent calls mutation tool (create_file, modify_file, etc.)
    │
    ▼
┌──────────────────────────────────┐
│  1. Path Safety Validation       │  ← Must be within workspace root
│  2. Exclude Pattern Check        │  ← node_modules, .git, etc. blocked
│  3. File Size Check              │  ← Max 1 MB for reads
│  4. Stage in Memory Overlay      │  ← Map<string,string> + Set<string>
│  5. Log to ActionTracker         │  ← Append-only audit trail
└──────────────────────────────────┘
    │
    ▼
Agent continues working (more tool calls, more staging)
    │
    ▼
Agent finishes → Approval Flow
    │
    ▼
┌──────────────────────────────────┐
│  User chooses:                   │
│  • "Approve and apply all"       │
│  • "Review one by one"           │  ← Per-file with diff viewing
│  • "Cancel"                      │  ← All discarded
└──────────────────────────────────┘
    │
    ▼ (if approved)
┌──────────────────────────────────┐
│  applyApprovedFromTracker()      │
│  1. Create folders (recursive)   │
│  2. Write/delete files           │
│  3. Execute queued shell cmds    │
│  4. Return errors (if any)       │
└──────────────────────────────────┘
```

### Review Groups

When reviewing changes one-by-one, pending mutations are grouped by file path:
- Multiple actions on the same file are collapsed into a single before→after diff
- Folder creations are shown without diffs
- Shell commands are shown individually

### Diff Format

Diffs are generated using unified diff format with 3 lines of context. Large diffs are truncated for readability with a warning message.

---

## Session Management

### Session Lifecycle

```
User starts mode → beginSession()
    │
    ▼
Session created (status: "active")
    │  → Stored in ~/.astra/sessions/index.json (via in-memory cache)
    │  → Unique ID generated (e.g., sess_m5k2x3_abc123)
    │
Agent works → actions accumulate in tracker
    │  → Transcript messages recorded
    │  → Goals tracked
    │
Agent finishes → endSession()
    │  → LLM generates 2-3 sentence summary
    │  → Touched files extracted
    │  → Action counts recorded
    │  → Status set to "completed"
    │
OR: User hits Ctrl+C → markSessionInterrupted()
    │  → Status set to "interrupted"
    │  → All state preserved for resume
    │
Next wakeup → auto-resume offered
    │  → Context summary injected into agent
    │  → Previous actions hydrated into overlay
```

### Auto-Resume Heuristics

When starting a new session, Astra checks for resumable sessions using a 3-tier priority:

1. **Explicit resume** — a specific session ID was provided
2. **Interrupted session** — an interrupted session exists in the same workspace
3. **Related session** — keyword overlap ≥30% with a recent session (within 4 hours for completed, 30 minutes for non-interrupted)

### Session Context on Resume

When resuming, the agent receives a rich context block including:
- Session metadata (ID, mode, start time)
- All goals from the session
- LLM-generated summary of what happened
- Pending/incomplete tasks
- Files touched (up to 20)
- Action counts (applied/rejected)
- Recent conversation transcript (configurable, default 10 turns)
- The agent's last response

### Cache Layer

Session reads are served from an in-memory cache with debounced disk writes (500ms). This provides:
- O(1) lookups by session ID via LRU entry cache
- No file I/O for reads during active sessions
- Batched writes for transcript appends
- Synchronous flush option for shutdown paths

---

## Multi-Agent Orchestration

### Orchestration Strategies

| Strategy | Behavior | Failure Mode |
|----------|----------|--------------|
| **Sequential** | Agents run one after another; each agent sees previous agents' outputs | Fail-fast (default) |
| **Parallel** | Agents run simultaneously in configurable batches with timeout | Continue (default) |
| **Hierarchical** | Coordinator runs first, then specialists execute with coordinator's plan | Fail-fast (default) |
| **Collaborative** | Agents take turns; each agent's output is broadcast to all others via MessageBroker | Continue (default) |
| **DAG** | Agents run as soon as all their dependencies are satisfied; supports cycle detection and deadlock handling | Fail-at-end (default) |

### Agent Roles

| Role | Permissions | Default Max Steps | Tools Count |
|------|------------|:-----------------:|:-----------:|
| `researcher` | Read-only (filesystem, web, git, skills) | 30 | 16 |
| `implementer` | Full read/write/execute (filesystem, shell, tests) | 50 | 26 |
| `reviewer` | Read + execute (tests, lint) but no file writes | 25 | 15 |
| `coordinator` | Read-only + planning tools | 20 | 8 |
| `custom` | Based on selected tools | 30 | Variable |

### Workflow Templates

Six pre-built workflow templates are available:

| Template | Agents | Strategy | Description |
|----------|--------|----------|-------------|
| **Code Review** | Researcher → Implementer → Reviewer | Sequential | Analyze code, implement fixes, review changes |
| **Feature Development** | Coordinator → Backend Dev + Frontend Dev → QA | DAG | Plan, implement in parallel, test |
| **Bug Fixing** | Debug Agent → Fix Agent → Test Agent | Sequential | Diagnose, fix, verify |
| **Collaborative Research** | Researcher 1 + Researcher 2 + Researcher 3 | Parallel | Multiple researchers working simultaneously |
| **Security Audit** | Scanner → Static Auditor + Dependency Auditor → Report Coordinator | DAG | Scan, audit in parallel, synthesize report |
| **Full-Stack Feature** | Architect → DB Dev + API Dev + UI Dev → Integration Tester | DAG | Design, implement layers in parallel, test |

### Workflow Builder (Fluent API)

For programmatic workflow construction:

```typescript
import { WorkflowBuilder, WorkflowTemplates } from "./modes/multi/workflow-builder";

// Use a template
const workflow = WorkflowTemplates.featureDevelopmentWorkflow("wf_001", "Add OAuth2 support");

// Or build custom
const custom = new WorkflowBuilder("wf_custom", "Refactor the API layer")
  .addResearcher("analyzer", "Code Analyzer", "Analyzes the current API structure")
  .addImplementer("refactorer", "Refactoring Agent", "Implements the refactoring", {
    dependsOn: ["analyzer"],
  })
  .addReviewer("validator", "Validation Agent", "Validates the refactoring", {
    dependsOn: ["refactorer"],
  })
  .withDagStrategy(3, 60_000)  // max 3 concurrent, 60s timeout
  .withRetryOnFailure(2)
  .withExpectedOutput("Refactored API layer with passing tests")
  .build();

// Validate before execution
const validation = WorkflowBuilder.validateWorkflow(custom);
if (!validation.isValid) {
  console.error(validation.errors);
}
```

### Validation Checks

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

## Sandbox Mode

Sandbox mode provides a secure, self-contained execution environment:

- **One-click activation** — `astra sandbox` handles the entire flow
- **Secure credential storage** — API keys stored in OS keychain (macOS Keychain, Windows Credential Vault, Linux Secret Service) with AES-256-GCM encrypted file fallback
- **HMAC-signed requests** — All server communication authenticated with SHA-256 HMAC and timestamps
- **API key validation** — Automatic sanitization and format validation
- **In-memory caching** — Keys cached with 5-minute TTL
- **Fixed model** — Uses `openrouter/owl-alpha` in sandbox mode

---

## Skills System

Astra includes 5 built-in skills that agents can discover and use:

| Skill | Description |
|-------|-------------|
| **code-review** | Structured code review checklist with quality, security, and testing criteria |
| **documentation** | Standards for README, CHANGELOG, and TSDoc comments |
| **git-workflow** | Branch naming, conventional commits, and pre-commit checklist |
| **project-setup** | Development environment setup guide |
| **test-runner** | Test execution patterns and result interpretation |

Skills are stored as `SKILL.md` files in `.skills/` and are discoverable via the `list_skills` and `read_skill` tools. Custom skills can be added via the `SKILLS_DIRS` environment variable.

---

## Retry & Error Handling

Astra has a comprehensive retry system for resilient operation:

### Error Classification

Errors are classified into 7 categories:

| Category | Retryable? | Suggested Delay | Examples |
|----------|:----------:|-----------------|----------|
| `TRANSIENT` | ✅ | 1s | 500, 502, 504 server errors |
| `RATE_LIMIT` | ✅ | 5s | 429 Too Many Requests, 503 Service Unavailable |
| `NETWORK` | ✅ | 2s | ECONNRESET, ETIMEDOUT, ENOTFOUND |
| `TIMEOUT` | ✅ | 3s | Request timeout, deadline exceeded |
| `UNKNOWN` | ✅ | 1s | Unrecognized errors (treated as transient) |
| `PERMANENT` | ❌ | — | 400 Bad Request, 404 Not Found, malformed input |
| `AUTH` | ❌ | — | 401 Unauthorized, 403 Forbidden, invalid API key |

### Retry Presets

| Preset | Max Retries | Base Delay | Max Delay | Backoff | Jitter |
|--------|:-----------:|------------|-----------|:-------:|:------:|
| `aiCall` | 3 | 1s | 30s | 2x | ±1s |
| `toolExecution` | 2 | 500ms | 5s | 2x | None |
| `network` | 5 | 2s | 60s | 2x | ±2s |
| `critical` | 5 | 1s | 60s | 2x | ±1.5s |

### Retry Behavior

- **Exponential backoff** — delay doubles (or by configured multiplier) with each attempt
- **Jitter** — random jitter is added to prevent thundering herd problems
- **Per-attempt timeouts** — optional timeout for individual attempts
- **Callbacks** — `onRetry` and `onExhausted` callbacks for progress reporting
- **Fallback to manual retry** — when automatic retries are exhausted, the user is offered a manual retry option

---

## Project Structure

```
astrabot/
├── index.ts                        # CLI entry point (Commander). Registers all commands.
├── package.json                    # Package config: name "astrabot", bin "astra", dependencies.
├── tsconfig.json                   # TypeScript config: ESNext, strict, Bun types.
├── bun.lock                        # Bun lockfile.
├── .gitignore                      # Standard ignores.
├── .npmignore                      # Excludes tests, .github from npm package.
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
│   └── secure-storage.ts           # Encrypted credential storage (OS keychain + AES-256-GCM).
│
├── core/retry/                     # Core retry engine.
│   ├── index.ts                    # Public API re-exports.
│   ├── retry-config.ts             # ErrorCategory enum, RetryConfig, presets.
│   ├── retry-engine.ts             # withRetry(), withRetryOrNull(), RetryPresets.
│   └── error-classifier.ts         # Error classification (status codes, patterns, codes).
│
├── tui/                            # Terminal UI utilities.
│   ├── terminal-md.ts              # Markdown-to-terminal rendering (marked + marked-terminal).
│   ├── spinner.ts                  # Animated spinner with metabolic rate engine.
│   └── wakeup.ts                   # ASCII banner with breathing animation + star field.
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
│   ├── code-review/SKILL.md        # Code review skill.
│   ├── documentation/SKILL.md      # Documentation skill.
│   ├── git-workflow/SKILL.md       # Git workflow skill.
│   ├── project-setup/SKILL.md      # Project setup skill.
│   └── test-runner/SKILL.md        # Testing skill.
│
├── game/                           # Arcade easter egg.
│   ├── index.html                  # Retro Snake Classic (HTML5 Canvas).
│   ├── neon-breaker.html           # Neon Brick Breaker (HTML5 Canvas).
│   ├── neon-pong.html              # Neon Pong (HTML5 Canvas).
│   └── cosmic-drifter/             # Cosmic Drifter game.
│
└── tests/
    └── cli.test.ts                 # CLI tests.
```

---

## Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@openrouter/ai-sdk-provider` | ^2.9.0 | OpenRouter as LLM provider for Vercel AI SDK |
| `@clack/prompts` | ^1.4.0 | Interactive terminal prompts |
| `@clack/core` | ^1.3.1 | Core prompt primitives |
| `@mendable/firecrawl-js` | ^4.25.1 | Firecrawl SDK for web search and crawling |
| `commander` | ^15.0.0 | CLI argument parsing |
| `chalk` | ^5.6.2 | Terminal string styling |
| `figlet` | ^1.11.0 | ASCII art banner generation |
| `marked` | ^18.0.4 | Markdown parser |
| `marked-terminal` | ^7.3.0 | Markdown renderer for terminal output |
| `diff` | ^9.0.0 | Unified diff generation |
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
| `keytar` | — | OS keychain access for secure credential storage |

---

## Roadmap

Planned features not yet implemented:

- [x] ~~**Streaming token output**~~ — implemented in v0.1.2 via `agent.stream()` with real-time chunk display and token telemetry
- [x] ~~**Direct prompt argument**~~ — implemented: `astra "goal"` auto-runs via the auto-router
- [x] ~~**Sandbox mode**~~ — implemented in v0.1.3 with secure credential storage
- [x] ~~**Session store cache**~~ — implemented in v0.1.3 with debounced writes
- [x] ~~**Cross-platform installers**~~ — implemented in v0.1.3
- [x] ~~**Skills system**~~ — 5 built-in skills available
- [ ] **Telegram mode** — stub present in wakeup menu, not yet implemented
- [ ] **Undo/redo support** — via action log replay
- [ ] **Configurable tool allowlists per mode** — currently hardcoded per mode
- [ ] **Multi-model support with per-mode model selection** — partially implemented in multi-agent mode only
- [ ] **Persistent action history across sessions** — sessions store summaries but not full action logs

---

## License

[MIT](LICENSE) — see the LICENSE file for details.

---

<div align="center">

**Astra** — Your AI-native development companion.

Built with ❤️ using [Bun](https://bun.sh) · [OpenRouter](https://openrouter.ai) · [Vercel AI SDK](https://sdk.vercel.ai)

</div>
