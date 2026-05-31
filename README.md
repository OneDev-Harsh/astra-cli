# Astra CLI

## Overview

Astra is an AI-native development companion that brings agentic coding capabilities to your terminal. It provides three distinct interaction modes — **Agent**, **Ask**, and **Plan** — each tailored to a different workflow, from autonomous multi-step code modifications to interactive Q&A and structured project planning.

Built on [Bun](https://bun.com) and powered by [OpenRouter](https://openrouter.ai), Astra leverages the Vercel AI SDK's `ToolLoopAgent` to give the LLM full programmatic access to your filesystem, shell, and the web — all through a carefully designed approval gate that keeps you in control.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Wakeup & Mode Selection](#wakeup--mode-selection)
  - [Agent Mode](#agent-mode)
  - [Ask Mode](#ask-mode)
  - [Plan Mode](#plan-mode)
- [Architecture](#architecture)
  - [Core Components](#core-components)
  - [Tool System](#tool-system)
  - [Staging & Approval Pipeline](#staging--approval-pipeline)
  - [Action Tracking](#action-tracking)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Roadmap](#roadmap)
- [License](#license)

## Features

- **Three interaction modes** — Agent (autonomous task execution), Ask (read-only Q&A), and Plan (structured multi-step planning with selective execution)
- **Full filesystem access** — read, create, modify, and delete files and directories through an AI agent
- **Shell execution** — queue arbitrary shell commands for agent-driven workflows
- **Web research** — built-in web search, URL crawling, and HTTP fetching via [Firecrawl](https://www.firecrawl.dev/)
- **Staging-first mutations** — no file is ever written or deleted without explicit user approval; all changes are staged in memory and presented for review before apply
- **Per-file diff review** — granular approval flow with unified diffs so you can inspect exactly what changed
- **Skill system** — discover and load `SKILL.md` files from Cursor and Claude skill directories to extend agent knowledge
- **Configurable safety** — exclude patterns, file size limits, and per-tool permission toggles
- **Rich terminal UI** — interactive prompts via `@clack/prompts`, markdown rendering in the terminal, and a figlet banner on startup

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| [Bun](https://bun.sh) | v1.3.14+ | Runtime and package manager |
| [OpenRouter](https://openrouter.ai) API key | — | LLM provider access |
| [Firecrawl](https://www.firecrawl.dev/) API key | — | Web search and crawling (optional) |

## Installation

```bash
git clone <repository-url>
cd astra-cli
bun install
```

## Configuration

Astra is configured entirely through environment variables. Create a `.env` file in the project root:

```env
# Required
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_DEFAULT_MODEL=openrouter/your-preferred-model

# Optional — enables web_search, web_crawl, and fetch_url tools
FIRECRAWL_API_KEY=your_firecrawl_api_key

# Optional — additional skill directories (semicolon-separated)
SKILLS_DIRS=/path/to/custom/skills;/another/skill/dir
```

## Usage

### Wakeup & Mode Selection

Launch Astra with the `wakeup` command to display the banner and choose an interaction mode:

```bash
bun run index.ts wakeup
```

This presents a mode selection prompt:

```
  █████  ███████ ████████ ██████   █████
 ██   ██ ██         ██    ██   ██ ██   ██
 ███████ ███████    ██    ██████  ███████
 ██   ██      ██    ██    ██   ██ ██   ██
 ██   ██ ███████    ██    ██   ██ ██   ██

  AI-native development companion
  v0.0.1

  ? Which mode do you want to proceed with?
  ❯ CLI
    Telegram
    Exit
```

Selecting **CLI** enters the main CLI mode loop where you choose between Agent, Ask, and Plan modes.

### Agent Mode

Agent mode is the primary autonomous coding mode. You describe a goal, and the agent iteratively uses its toolset — reading files, writing code, running shell commands — to accomplish it. All mutations are staged and presented for your approval before being applied to disk.

```bash
# From the CLI mode menu, select "Agent Mode"
```

**How it works:**

1. You provide a natural-language goal (e.g., "Add unit tests for the user service")
2. The agent enters a tool loop (up to 50 steps), calling tools to explore and modify the codebase
3. Each tool call is logged and displayed in real-time
4. After the agent finishes, the **approval flow** presents all staged changes grouped by file
5. You can **accept all**, **review individually** (with diffs), or **cancel**
6. Approved changes are applied to disk; rejected changes are discarded

**Available tools in Agent mode:**

| Tool | Description |
|------|-------------|
| `read_file` | Read a text file from the workspace |
| `create_file` | Stage creation of a new file |
| `modify_file` | Stage a full-file replacement |
| `delete_file` | Stage deletion of a file |
| `create_folder` | Stage creation of a directory tree |
| `list_files` | List files and directories under a path |
| `search_files` | Find files matching a glob pattern with optional content filter |
| `analyze_codebase` | Summarize structure (file counts, directory counts) |
| `execute_shell` | Queue a shell command for execution |
| `list_skills` | List SKILL.md files from configured skill directories |
| `read_skill` | Read a specific SKILL.md file |
| `web_search` | Search the web (requires Firecrawl) |
| `web_crawl` | Scrape a URL into markdown (requires Firecrawl) |
| `fetch_url` | HTTP GET for a URL |

### Ask Mode

Ask mode is a **read-only** Q&A interface. The agent can explore your codebase and the web to answer questions, but cannot modify files (with the optional exception of saving the response).

```bash
# From the CLI mode menu, select "Ask Mode"
```

**How it works:**

1. You ask a question about your codebase or a general topic
2. The agent uses read-only tools (file reading, searching, codebase analysis, web search) to formulate an answer
3. The answer is rendered as markdown in the terminal
4. You're given the option to save the Q&A pair as a `.md` file in the current directory

**Available tools in Ask mode:** `read_file`, `list_files`, `search_files`, `analyze_codebase`, `list_skills`, `read_skill`, plus web tools (if configured).

### Plan Mode

Plan mode breaks a high-level goal into a structured, executable plan. The agent first researches your codebase, then generates a step-by-step plan. You select which steps to execute, and each step is carried out by an autonomous agent.

```bash
# From the CLI mode menu, select "Plan Mode"
```

**How it works:**

1. You describe a high-level goal
2. The agent researches the codebase and generates a structured plan (1–20 steps) with complexity ratings (`low`, `medium`, `high`)
3. The plan is displayed with a research summary and numbered steps
4. You select which steps to execute (all selected by default)
5. Each selected step runs as an independent agent loop (up to 50 steps per step)
6. All mutations across all steps are collected and presented in a single approval flow
7. Approved changes are applied to disk

## Architecture

### Core Components

| File | Responsibility |
|------|----------------|
| `index.ts` | Entry point; registers the `wakeup` command via Commander |
| `tui/wakeup.ts` | Banner rendering and top-level mode selection |
| `tui/terminal-md.ts` | Markdown-to-terminal rendering via `marked` + `marked-terminal` |
| `modes/cli.ts` | CLI mode loop (Agent / Plan / Ask selection) |
| `ai/ai.config.ts` | OpenRouter provider initialization |

### Tool System

The tool system is built on the Vercel AI SDK's `tool()` primitive with Zod schema validation. Tools are created in two layers:

- **`ToolExecutor`** (`modes/agent/tool-executor.ts`) — The core execution engine. All filesystem operations, shell commands, and skill lookups are implemented here. Mutations are staged in an in-memory overlay (`Map<string, string>` for file contents, `Set<string>` for deletions) and never touch disk until explicitly approved.

- **`createAgentTools()`** (`modes/agent/agent-tools.ts`) — Wraps every `ToolExecutor` method as a Vercel AI SDK `tool()` with a Zod input schema, making them available to the LLM agent.

- **`createWebTools()`** (`modes/plan/web-tools.ts`) — Adds web search, crawling, and URL fetching tools via the Firecrawl SDK.

### Staging & Approval Pipeline

This is the safety backbone of Astra. The pipeline works as follows:

1. **Staging** — When the agent calls a mutation tool (`create_file`, `modify_file`, `delete_file`, `create_folder`, `execute_shell`), the `ToolExecutor` records the change in its in-memory overlay and logs it to the `ActionTracker` with status `"pending"`.

2. **Approval Flow** (`modes/agent/approval.ts`) — After the agent completes, all pending mutations are grouped by file path and presented to the user:
   - **Accept all** — approves every pending mutation
   - **Review one by one** — iterates through each group, showing a unified diff and prompting for accept/reject
   - **Cancel** — rejects all pending mutations

3. **Diff Generation** (`modes/agent/diff-view.ts`) — Uses the `diff` library to produce unified diffs. For files with multiple staged operations (e.g., create then modify), `composeBeforeAfter()` collapses them into a single before→after view.

4. **Application** — `ToolExecutor.applyApprovedFromTracker()` replays all approved actions against the real filesystem: folders are created, files are written or deleted, and shell commands are spawned.

### Action Tracking

The `ActionTracker` (`modes/agent/action-tracker.ts`) maintains an append-only log of every action the agent takes. Each entry includes:

- Unique ID and timestamp
- Action type (`file_create`, `file_modify`, `file_delete`, `folder_create`, `code_analysis`, `tool_execute`)
- File path or shell command
- Before/after content snapshots
- Status (`pending`, `executed`, `approved`, `rejected`)

This log powers the approval flow, enables auditability, and supports future features like undo/redo.

## Project Structure

```
astra-cli/
├── index.ts                    # CLI entry point (Commander)
├── package.json                # Dependencies and metadata
├── tsconfig.json               # TypeScript configuration (strict, Bun types)
├── ai/
│   ├── index.ts                # Re-exports getAgentModel
│   └── ai.config.ts            # OpenRouter provider setup
├── tui/
│   ├── terminal-md.ts          # Markdown → terminal rendering
│   └── wakeup.ts               # Banner and mode selection
├── modes/
│   ├── cli.ts                  # CLI mode loop
│   ├── agent/                  # Agent mode
│   │   ├── orchestrator.ts     # Agent loop, tool setup, approval flow
│   │   ├── agent-tools.ts      # Tool definitions for the agent
│   │   ├── tool-executor.ts    # Core execution engine + staging overlay
│   │   ├── action-tracker.ts   # Append-only action log
│   │   ├── approval.ts         # Interactive approval flow with diffs
│   │   ├── diff-view.ts        # Unified diff generation
│   │   └── types.ts            # Type definitions and default config
│   ├── ask/                    # Ask mode
│   │   └── orchestrator.ts     # Read-only Q&A with optional save
│   └── plan/                   # Plan mode
│       ├── orchestrator.ts     # Plan generation → step selection → execution
│       ├── planner.ts          # LLM-driven plan generation with JSON schema
│       ├── selection.ts        # Interactive step picker with complexity display
│       ├── types.ts            # Plan and PlanStep interfaces
│       └── web-tools.ts        # Firecrawl web search/crawl/fetch tools
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for LLM access |
| `OPENROUTER_DEFAULT_MODEL` | Yes | Model identifier (e.g., `openrouter/anthropic/claude-sonnet-4`) |
| `FIRECRAWL_API_KEY` | No | Enables `web_search`, `web_crawl`, and `fetch_url` tools |
| `SKILLS_DIRS` | No | Semicolon-separated paths to additional skill directories |

## Roadmap

- [ ] Telegram mode (stub present in wakeup)
- [ ] Undo/redo support via action log replay
- [ ] Streaming token output for agent responses
- [ ] Configurable tool allowlists per mode
- [ ] Multi-model support with per-mode model selection
- [ ] Persistent action history across sessions

## License

Private — All rights reserved.
