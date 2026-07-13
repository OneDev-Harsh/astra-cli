# Changelog

All notable changes to **Astra** are documented in this file.

The format is based on [Keep a Changelog](https://keepacontain.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

## [0.1.7] — 2026-07-13

### Added

- **Browser Automation via Playwright** — Integrated Playwright browser-automation capabilities. Added `modes/agent/browser-service.ts` and `modes/agent/browser-tools.ts` containing a set of 23 cross-platform browser automation tools (e.g. `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot`, etc.). Supports multiple tabs, key presses, element selection, viewport adjustments, and custom JS evaluation.
- **Model Context Protocol (MCP) Integration** — Integrated Model Context Protocol (MCP) client capabilities. Added `modes/mcp/manager.ts` allowing stdio-based MCP servers to register custom tools dynamically within the agent environment, with configurations read from `~/.astra/mcp.json` or `.astra/mcp-config.json`.
- **Persistent Workspace-Level Context** — Added `ProjectContextLoader` in `session/project-context.ts` to look for an optional `ASTRA.md` file in the workspace root. If found, it automatically injects workspace-specific conventions and guidelines into the system prompts of all active agents.
- **Persistent action history** — New `ActionHistoryManager` in `session/action-history.ts` that logs all approved/applied actions to a persistent global JSONL file at `~/.astra/history/actions.jsonl`. Each entry includes a UUID, session ID, workspace path, timestamp, and the full `ActionLog` record.
- **Cross-session action queries** — `ActionHistoryManager` exposes `getGlobalHistory(limit)` to retrieve recent actions across all sessions (newest first) and `searchHistoryByFile(targetPath)` to find all historical actions targeting a specific file path.
- **Automatic history sync on session end** — `endSession()` and `endMultiSession()` in `session/session-manager.ts` now automatically sync approved actions to the global history log upon completion.
- **Automatic history sync on apply** — `applyApprovedFromTracker()` in `modes/agent/tool-executor.ts` now records successfully applied actions to the global history in real-time, with graceful fallback when no session store is available.
- **Expanded Arcade Suite** — Integrated `Neon Rush` arcade game (`game/neon-rush.html`) into the standalone game selector (`astra play`).

### Changed

- **CLI Wakeup Screen and Interface Upgrades** — Completely redesigned the wakeup greeting animation and welcome screen CLI options in `tui/wakeup.ts`, and updated the setup wizard in `modes/setup.ts` and option routing in `modes/cli.ts`.
- **`applyApprovedFromTracker()` refactored** — Internal restructuring with clearly commented sections (folder ops, file ops, shell/tool ops) and a `successfullyAppliedActions` accumulator that feeds the history log after all operations complete.
- **`endMultiSession()` cleaned up** — Removed stale comment block, extracted `multiAgentApprovedActions` filter for clarity.

---

## [0.1.6] — 2026-07-04

### Added

- **Streaming output for Agent, Ask, and Plan modes** — All three modes now use `agent.stream()` with real-time text chunk display via a new `streamAgentCall()` helper. Chunks are rendered incrementally to the terminal using `ctx.writeStreamChunk()`, providing a responsive, no-wait output experience.
- **OpenRouter prompt caching** — `getAgentModel()` in `ai/ai.config.ts` now accepts an optional `sessionId` parameter and passes `X-OpenRouter-Cache: true` and `session_id` headers to the OpenRouter provider, enabling edge-cache hits and sticky-session prefix caching for improved latency on repeated prompts.
- **Session-aware model cache** — The model cache in `ai/ai.config.ts` now includes `sessionId` as part of the cache key, so models with different session contexts are correctly invalidated and reused.
- **Neon Memory & Neon Tetris** — Two new arcade games added to the `astra play` game selector, bringing the total to 5 mini-games.

### Changed

- **`getAgentModel()` signature updated** — Now accepts `sessionId?: string` to support prompt caching and sticky session routing. Cache invalidation logic updated accordingly.
- **Agent orchestrator streaming** — `modes/agent/orchestrator.ts` now uses `streamAgentCall()` with `onStepFinish` handler that logs tool calls with per-step duration and token counts.
- **Ask mode rewritten for streaming** — `modes/ask/orchestrator.ts` fully restructured to use `agent.stream()` with real-time chunk display and live token telemetry.
- **Plan mode rewritten for streaming** — `modes/plan/orchestrator.ts` fully restructured to use `agent.stream()` with real-time chunk display and live token telemetry.

---

- Nothing yet.

---

## [0.1.5] — 2026-07-03

### Changed

- **Sandbox server migrated to remote** — Default sandbox server URL changed from `http://127.0.0.1:3000` (local) to `https://astra-server-oh6s.onrender.com` (remote Render deployment) across `ai/sandbox-config.ts` and `modes/setup.ts`.

### Documentation

- **README.md** — Comprehensive review and polish: fixed Ask mode mutation indicator, corrected Multi-Agent goal prompt text, added missing config file location (`~/.astra/logs/astra.log`), updated roadmap entries, corrected project structure tree.
- **CHANGELOG.md** — Reviewed and polished for consistency.
- **DOCUMENTATION.md** — Updated version header from `0.1.4` to `0.1.5`, fixed skills directory count from "three sources" to "four sources", aligned sandbox server URL references, added error logger documentation, updated project structure.

---

## [0.1.4] — 2026-07-02

### Removed

- **Bundled server** — The `server/` directory was removed. Sandbox mode's `activateSandbox()` still supports connecting to an external server, but Astra no longer ships one.
- **Build script updated** — Changed from building `server/server.ts` to building `index.ts`.
- Version bumped from `0.1.3` to `0.1.4`.

---

## [0.1.3] — 2026-07-01

### Added

- **Sandbox mode** — New `astra sandbox` command providing a secure execution environment with OS keychain credential storage (macOS Keychain, Windows Credential Vault, Linux Secret Service via `keytar`), AES-256-GCM encrypted file fallback, SHA-256 HMAC-signed server communication, API key validation, and in-memory key caching with 5-minute TTL.
- **Session store cache** — New in-memory cache layer for session reads/writes with 500ms debounced disk writes, LRU entry cache, and dirty tracking.
- **Cross-platform installers** — New `install/` directory with `install.sh` (Linux/macOS) and `install.bat` (Windows) handling Node.js, Bun, and `astrabot` installation with PATH configuration.
- **Skills system** — Five built-in skills (code-review, documentation, git-workflow, project-setup, test-runner) as `SKILL.md` files in `.skills/`, discoverable by agents via `list_skills` and `read_skill` tools.
- **Neon Memory & Neon Tetris** — Two new arcade games added to the `astra play` game selector.
- **`astra sandbox` command** — Registered as a new subcommand for sandbox mode activation.

### Changed

- **Direct prompt argument** — `astra "goal"` now auto-runs via the auto-router without showing the interactive menu.
- **Cosmic Drifter** — Added to the arcade game selector (existence-checked at runtime).

### Fixed

- Token streaming pipeline improvements.
- Minor bug fixes and polish.

---

## [0.1.2] — 2026-06-08

### Added

- **Streaming agent output** — All interaction modes migrated from `agent.generate()` to `agent.stream()` with real-time chunk display.
- **Token telemetry** — Live token counters (↑input / ↓output) during agent execution with velocity summary (tok/s) at completion.
- **Detailed step logging** — Tool calls logged with human-readable descriptions (e.g., `reading src/foo.ts`) including per-step duration and token counts.
- **Multi-agent streaming events** — New orchestrator event types: `agent:stream_start`, `agent:chunk`, `tool_executed`, `usage_updated`.
- **Neon Pong** — New arcade game built with HTML5 Canvas.
- Version bumped from `0.1.1` to `0.1.2`.

---

## [0.1.1] — 2026-06-07

### Added

- **Dynamic version in banner** — Wakeup banner now reads version from `package.json` at runtime.
- **npm binary entry point** — New `bin/astra` shebang file for global CLI installation.
- **CI pipeline** — GitHub Actions workflow running `bun install` → `bun test` on push/PR.
- **CLI smoke tests** — Integration tests for `--version`, `--help`, and command listing.
- **Agent identity prompts** — All multi-agent role system prompts and plan-mode planner prompt include identity preamble.
- **Telegram mode hidden** — Commented out in the wakeup mode selector (not yet implemented).

### Changed

- **Package rename** — `package.json` name changed from `astra` to `astrabot` (npm availability).
- **Build simplification** — Removed `tsc` compile step; Bun executes TypeScript directly.
- **README comprehensive rewrite** — Expanded from ~448 to ~981 lines with full installation, configuration, commands, tool reference, session management, multi-agent orchestration, retry system, project structure, and dependencies documentation.

### Fixed

- README Ask mode mutation indicator corrected.

---

## [0.1.0] — 2026-06-06

### Added

- **Five interaction modes** — Auto (intent classifier), Agent (autonomous coding), Ask (read-only Q&A), Plan (structured planning), Multi-Agent (orchestrated agent teams).
- **35+ agent tools** — Full filesystem access, shell execution, git integration, web research, project intelligence, staging, skills, and session tools.
- **Staging & approval pipeline** — All mutations staged in memory with per-file diff review before apply.
- **Session management** — Persistent sessions with LLM-generated summaries, auto-resume on interruption, 3-tier resume heuristics, and in-memory cache.
- **Multi-agent orchestration** — 5 strategies (Sequential, Parallel, Hierarchical, Collaborative, DAG), 5 agent roles, 6 workflow templates, fluent workflow builder with 10+ validation checks.
- **Retry system** — 7 error categories, 4 retry presets (aiCall, toolExecution, network, critical), exponential backoff with jitter.
- **Sandbox mode foundation** — Secure credential storage with OS keychain and encrypted fallback.
- **Arcade** — Retro Snake Classic and Neon Brick Breaker mini-games with local HTTP server.
- **`astra play` command** — Arcade game selector with auto-browser open.
- **`astra reset` command** — Full configuration purge with confirmation.
- **Breathing banner animation** — ASCII art banner with inhale/exhale brightness cycle and twinkling star field.
- **Animated spinner** — Metabolic rate engine with 4 rate states, mood-based shapes, and dynamic color gradients.
- **Setup wizard** — Interactive configuration for API keys, model selection, and skills directories.
- **Centralised error logger** — Rotating file output with in-memory ring buffer.
- **DOCUMENTATION.md** — Comprehensive technical documentation.
- **Project scaffolding** — Initial project structure with Bun, TypeScript, Commander, Vercel AI SDK, and OpenRouter.
