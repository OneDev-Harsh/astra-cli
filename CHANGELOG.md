# Changelog

All notable changes to **Astra** — AI-native development companion — are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Roadmap (planned, not yet implemented)

- **Telegram mode** — stub present in wakeup menu, not yet implemented
- **Undo/redo support** — via action log replay
- **Configurable tool allowlists per mode** — currently hardcoded per mode
- **Multi-model support with per-mode model selection** — partially implemented in multi-agent mode only
- **Persistent action history across sessions** — sessions store summaries but not full action logs

---

## [0.1.5] — 2026-07-03

### Changed

#### Sandbox server URL updated (6c88634 — 2026-07-03)

- **Remote sandbox server** — The default sandbox server URL was changed from `http://127.0.0.1:3000` (local) to `https://astra-server-oh6s.onrender.com` (remote Render deployment) in both `ai/sandbox-config.ts` and `modes/setup.ts`.
- **`getSandboxConfig()`** — `serverUrl` now returns the remote URL instead of `http://127.0.0.1:3000`.
- **`activateSandbox()`** — Default parameter changed from local to remote URL.
- **`startSandboxServer()`** — Health check URL updated to remote server.
- **`runSandboxSetup()`** in `modes/setup.ts` — Health check and `activateSandbox()` calls updated to use the remote URL.

#### Documentation professionally updated

- **README.md** — Comprehensive review and polish: fixed Ask mode mutation indicator consistency, corrected Multi-Agent mode goal prompt text from "complex operations workflow" to "complex workflow", added missing config file locations (`~/.astra/logs/astra.log`), added centralised error logger and remote server migration to roadmap, added `core/logger`, `core/logger/` and `install/` entries to project structure.
- **CHANGELOG.md** — Reviewed and polished for consistency and accuracy.
- **DOCUMENTATION.md** — Updated version header from `0.1.4` to `0.1.5`, fixed skills directory count from "three sources" to "four sources", aligned sandbox server URL references, added error logger documentation, updated project structure to match actual filesystem.

---

## [0.1.4] — 2026-07-02

### Changed

#### Server removed (de4f562 — 2026-07-02)

- **Removed bundled server** — The `server/` directory was removed from the project. The sandbox mode's `activateSandbox()` function still supports connecting to an external sandbox server, but Astra no longer ships one.
- **Build script updated** — `package.json` `build` script changed from `bun build server/server.ts --outfile dist/server.js` to `bun build index.ts --outfile dist/astra.js`.
- **Version bump** — `package.json` version updated from `0.1.3` to `0.1.4`.

---

## [0.1.3] — 2026-07-01

### Added

#### Sandbox mode — secure one-click activation (2c1edb7 — 2026-07-01)

- **Sandbox mode** — New `ai/sandbox-config.ts` module providing a secure, self-contained execution environment:
  - **One-click activation** — `astra sandbox` command activates sandbox mode by connecting to a local sandbox server, fetching an API key, and storing it in the OS keychain.
  - **Secure credential storage** — New `ai/secure-storage.ts` module using AES-256-GCM encryption with OS keychain fallback:
    - Prefers native OS credential managers (macOS Keychain, Windows Credential Vault, Linux Secret Service via `keytar`)
    - Falls back to an encrypted file at `~/.astra/.secure/sandbox.enc` using a device-bound key derived from machine-id via `scrypt`
    - Supports storing/retrieving sandbox API key, auth token, and HMAC signing secret separately
  - **HMAC request signing** — All sandbox server communication is signed with SHA-256 HMAC and timestamps for replay protection.
  - **API key validation & sanitization** — Automatically strips brackets/quotes accidentally introduced by `.env` parsing, validates OpenRouter key format (`sk-or-v1-*`).
  - **In-memory key caching** — Keys are cached in memory with a 5-minute TTL to avoid repeated server round-trips.
  - **Server process management** — `startSandboxServer()` spawns and health-checks a sandbox server process.
  - **Model override** — Sandbox mode uses a fixed model (`openrouter/owl-alpha`) and port (3000).
  - **Full disable path** — `disableSandboxMode()` purges all credentials from secure storage and clears the boolean flag.
  - **Public API** — `ai/index.ts` exports all sandbox and secure storage functions for programmatic use.

#### Response time optimizations (2e111b6 — 2026-07-01)

- **Session store cache** — New `session/session-cache.ts` module providing in-memory caching for the session store:
  - **Debounced disk writes** — Writes are batched with a 500ms debounce interval to avoid redundant JSON serialization on rapid session updates.
  - **LRU entry cache** — Individual session entries are cached by ID for O(1) lookups without file I/O.
  - **Transcript caching** — Transcript append operations are served entirely from memory during live sessions.
  - **Dirty tracking** — Only mutated entries are marked dirty; flush only writes when necessary.
  - **Singleton pattern** — `getSessionStoreCache()` returns a shared instance; `resetSessionStoreCache()` for testing.
  - **Synchronous flush option** — `flushSync()` for critical shutdown paths.

#### Installer scripts (f0c6f06 — 2026-07-01)

- **Cross-platform installers** — New `install/` directory with automated setup scripts:
  - `install/install.sh` — Linux/macOS Bash installer that checks for and installs Node.js (via nvm), Bun, and `astrabot` npm package.
  - `install/install.bat` — Windows Batch installer with PowerShell integration for Node.js and Bun installation.
  - `install/README.md` — Documentation for the installer scripts.
  - Both scripts handle PATH configuration, permission issues (sudo/prefix fallback), and guide users to run `astra setup` after installation.
  - Auto-detect existing installations to skip unnecessary steps.

#### Skills system (`.skills/`) — now documented

- **Five built-in skills** — `.skills/` directory with structured `SKILL.md` files:
  - `code-review` — Structured code review checklist (quality, error handling, security, performance, testing)
  - `documentation` — Documentation standards and templates for README, CHANGELOG, and code comments
  - `git-workflow` — Branch naming conventions, commit conventions (conventional commits), and workflow steps
  - `project-setup` — Development environment setup guide
  - `test-runner` — Test execution patterns and result interpretation
- Skills are discoverable by agents via the `list_skills` and `read_skill` tools.

#### Cosmic Drifter arcade game

- **Cosmic Drifter** — Listed as an option in the `astra play` game selector (asset file existence-checked at runtime).

### Changed

#### Direct prompt argument & default auto-router improvements (4c8a1e9 — 2026-07-01)

- **`astra sandbox` command** — New subcommand registered in `index.ts` for sandbox mode activation.
- **Cosmic Drifter in arcade** — Added to the game selector options in `index.ts`.

### Fixed

- **Token streaming improvements** (3abca71 — 2026-07-01) — Minor fixes and improvements to the token streaming pipeline.
- **Other minor fixes** (070c903 — 2026-07-01) — Small bug fixes and polish.

---

## [0.1.2] — 2026-06-08

### Added

#### Streaming agent output & token telemetry (070c903 — 2026-06-08)

- **Streaming agent calls** — All interaction modes (Agent, Ask, Plan, Multi-Agent) migrated from `agent.generate()` to `agent.stream()` with `for await...of` chunk consumption, enabling real-time output display as the model generates text.
- **Token telemetry in spinner** — The spinner now displays live token counters (↑input / ↓output) during agent execution, with a final summary line showing total tokens and velocity (tok/s) at completion.
- **Detailed step logging** — Tool call logging replaced raw JSON parameter previews with human-readable descriptions (e.g., `reading src/foo.ts`, `creating src/bar.ts`, `running "bun test"`) including per-step duration and token counts.
- **`SpinnerContext` API extended** — New methods: `incrementOutputChunk()`, `updateTokens()`, `logStep()` for streaming-aware task integration.
- **`LanguageModelUsage` interface** — SDK-agnostic token extraction supporting both v3 (`promptTokens`/`completionTokens`) and v4 (`inputTokens`/`outputTokens`) AI SDK schemas.
- **Multi-agent streaming events** — New orchestrator event types: `agent:stream_start`, `agent:chunk`, `tool_executed`, `usage_updated` — enabling real-time UI updates during multi-agent execution.
- **Auto mode elapsed time** — Auto mode spinner now shows elapsed time (`hideTime: false`) for better feedback during intent classification.

#### Arcade (4d69d27 — 2026-06-08)

- **Neon Pong** — New arcade game (`game/neon-pong.html`) — a Pong game built with HTML5 Canvas.

#### Version update (2753487 — 2026-06-08)

- **Version bump** — `package.json` version updated from `0.1.1` to `0.1.2`.

---

## [0.1.1] — 2026-06-07

### Added

#### Minor fixes (f1f5eeb — 2026-06-07)

- **Version bump** — `package.json` version updated from `0.1.0` to `0.1.1`.
- **Dynamic version in banner** — Wakeup banner now reads the version from `package.json` at runtime via `import pkg from "../package.json"` instead of hardcoding `0.1.0`.
- **README table fix** — Corrected the Ask mode "File Mutations?" column in the modes overview table from `❌` to `✅` (since saving the response is an optional mutation).

#### README updated (fa99ba0 — 2026-06-07)

- **Comprehensive README rewrite** — README.md grew from ~448 lines to ~981 lines, adding:
  - Centered header with npm, license, Bun, and TypeScript badges
  - "What Is Astra?" section with a mode comparison table
  - Three installation options: global npm, npx (no install), and source
  - Detailed configuration section with required/optional env vars and retry config vars
  - Per-command documentation (`wakeup`, `setup`, `play`, `reset`) with descriptions and examples
  - Complete tool system reference (35+ tools) organized by category (filesystem, shell, git, project, web, planning, staging, skills, session) with mutate indicators
  - Detailed staging & approval pipeline with ASCII flow diagram
  - Session management lifecycle with auto-resume heuristics
  - Multi-agent orchestration deep-dive: strategies, roles, workflow templates (6), fluent API code example, and validation checks
  - Retry & error handling: error classification table, retry presets, and behavior details
  - Full project structure tree with file-level descriptions
  - Dependencies split into runtime, dev, and peer tables with versions
  - Roadmap and license footer

#### Post publish (ab809c5 — 2026-06-07)

- **npm binary entry point** — New `bin/astra` shebang file (`#!/usr/bin/env bun`) for global CLI installation via npm.
- **Package rename** — `package.json` name changed from `astra` to `astrabot` (npm availability), with `bin` entry pointing to `bin/astra`.
- **`.npmignore`** — New file excluding `tests/`, `.github/`, `sandbox_home/`, and `.gitignore` from the published npm package.
- **Build script simplification** — Removed `build` (`tsc`) from scripts; `prepublishOnly` now runs `bun test` only (no compile step needed for Bun-executed TypeScript).

#### Deployment ready (a78d38d — 2026-06-06)

- **CI pipeline** — New `.github/workflows/ci.yml` running `bun install` → `bun test` on push/PR to `main`/`master`.
- **CLI smoke tests** — New `tests/cli.test.ts` with 3 integration tests: `--version` returns semver, `--help` lists primary commands (`wakeup`, `setup`, `play`, `reset`), using a sandboxed `HOME` environment.
- **Agent identity prompts** — All multi-agent role system prompts (`researcher`, `implementer`, `reviewer`, `coordinator`, `custom`) and the plan-mode planner prompt now include an identity preamble: *"You are Astra, an AI-native development CLI companion tool… If the user asks who you are… you must always identify yourself exclusively as Astra."*
- **Package files expanded** — `package.json` `files` array updated to include `session/`, `core/`, and `game/` directories in the published package.
- **Test and prepublish scripts** — Added `test` (`bun test`) and `prepublishOnly` (`bun test && npm run build`) scripts.
- **Telegram mode hidden** — Commented out the "Telegram Gateway Interface" option in the wakeup mode selector (not yet implemented).
- **Initial CHANGELOG** — This changelog file was first created in this commit, documenting all 21 commits from the initial scaffolding through v0.1.0.

---

## [0.1.0] — 2026-06-06

### Added

#### Major improvements (ab0e9db — 2026-06-06)

- **`astra play` command** — Launches an arcade easter egg mini-game selector (Retro Snake Classic or Neon Brick Breaker) with a local Bun HTTP server on port 4321 and auto-opens the system browser.
- **`astra reset` command** — Interactive danger-zone confirmation that completely purges all stored configurations, sessions, and credentials from `~/.astra/`.
- **Version export** — `ASTRA_VERSION` constant exported from `index.ts` for diagnostic/bug-report tooling.
- **Dynamic version from package.json** — CLI `--version` flag now reads from `package.json` instead of being hardcoded.
- **Breathing banner animation** — `printBanner()` is now an async function that plays a full inhale→exhale cosine brightness cycle (1.6s, 28 FPS) with a twinkling star field sidebar. Stars are deterministically seeded (LCG), each with independent phase offset, speed, glyph, and color.
- **Star field sidebar** — 42-column-wide animated star field rendered alongside the ASCII banner. Stars pulse asynchronously through 7 glyphs and 6 colors.
- **Glob pattern fix in `search_files`** — Rewrote the glob-to-regex converter to correctly handle `**/` (zero or more path segments), `**` (any chars including `/`), `*` (anything except `/`), and `?` (single char except `/`). Previously `**` was replaced with empty string, breaking deep searches.
- **`read_multiple_files` improvements** — Now validates file existence, enforces `maxFileSizeToRead` limit, reads from disk directly (bypassing overlay), and logs each individual file read as a `code_analysis` action for the audit trail.
- **Shell command execution hardening** — Added 5-minute timeout, `ETIMEDOUT` detection, output truncation at 15,000 characters, and try/catch around `spawnSync` to prevent crashes from spawn errors.
- **Ask mode retry loop** — Replaced single-try/catch with a bounded retry loop (max 5 attempts) with exponential backoff and jitter (1s base, 30s cap, ±500ms jitter). Shows attempt count and waits between retries.
- **Auto mode session tracking** — Auto mode now creates a session entry (`beginSession`), generates an `ActionTracker`, and calls `endSession` with the routing decision before delegating to the downstream mode.

#### Sessions improved (95a2d27 — 2026-06-06)

- **Full conversation transcript storage** — Sessions now store the complete conversation transcript (`TranscriptMessage[]`) inline in the session index, capped at 60 messages (oldest trimmed first).
- **Multi-turn goal tracking** — New `allGoals` field on session entries tracks every user goal across a session, not just the last one.
- **Pending tasks** — New `pendingTasks` field enables "pick up where we left off" without re-analysing the transcript.
- **Last agent response** — New `lastAgentResponse` field (truncated to 2,000 chars) for one-shot context injection.
- **Session store v2** — Bumped `CURRENT_VERSION` to 2 with back-compat migration that fills missing fields (`allGoals`, `transcript`, `pendingTasks`, `lastAgentResponse`) on older entries.
- **Increased session cap** — `MAX_SESSIONS` raised from 50 to 100.
- **`appendTranscript()` function** — New efficient function to append transcript messages to an active session without a full patch.
- **`recordUserMessage()` / `recordAgentMessage()`** — New functions to record user/agent messages in the active session transcript during a live session.
- **Smart auto-resume heuristics** — `beginSession()` now supports 3-tier resume logic: (1) explicit `resumeSessionId`, (2) interrupted session in same workspace, (3) recent related session detected via keyword overlap (≥30% token match, within 4h for completed / 30m for non-interrupted).
- **Context summary overhaul** — `buildContextSummary()` now produces a rich formatted block with box-drawing headers, session metadata, all goals, pending tasks, file list (up to 20), action counts, recent transcript (configurable turns), and last agent response.
- **`buildSessionOneliner()`** — New lightweight one-line summary for the CLI session picker with human-readable age and pending task count.
- **`session_resume_context` tool** — Replaced `session_history` with a richer tool that accepts `transcript_turns` parameter (1–30, default 10) and returns the full resumption context block.
- **`session_search` tool** — New tool allowing agents to search previous sessions by keyword, file name, or goal across `lastGoal`, `summary`, `touchedFiles`, and `allGoals`.
- **`session_status` tool enhanced** — Now accepts a `limit` parameter (1–20, default 5) and shows session ID, summary, and pending tasks for each session.
- **Session summarisation improved** — Now processes up to 40 actions (was 30), prompts the LLM to mention incomplete tasks, and uses 2,000-char agent response cap with underscore-separated numeric literals.

#### UX improved (cf68de7 — 2026-06-06)

- **Neon Breaker arcade game** — New `game/neon-breaker.html` — a Brick Breaker game built with HTML5 Canvas (1,037 lines).
- **Complete spinner overhaul** — Replaced the simple 10-frame spinner with an "Autonomous Organism Engine" featuring:
  - 4 metabolic rate states: HYPER (45ms), STEADY (75ms), STRESSED (110ms), HIBERNATE (180ms)
  - 4 mood-based shape sets: PULSE, CRAWL, TWITCH, SIGH
  - Dynamic color gradient from violet → cyan → rose → crimson based on fatigue index
  - Smooth metabolic shifting with 0.7/0.3 interpolation
  - Per-star independent animation with telemetry display
  - Context object (`SpinnerContext`) with `updateMessage()` and `updateMetric()` for dynamic updates
  - End-state icons: ⚡ (<800ms), 🌱 (normal), 🧘 (>6s)
  - Hide cursor during animation, restore on stop
- **Wakeup UI overhaul** — Complete rewrite of `tui/wakeup.ts`:
  - Clean color palette: brand violet, off-white text, subtle gray, emerald success, amber warning
  - Structured sub-header with `● ASTRA │ AI-native development companion` layout
  - `initializeSystem()` async function with spinner-wrapped boot sequence (400ms + 300ms delays for responsiveness)
  - Session resume prompt with improved formatting
  - Mode select with descriptive labels ("Interactive CLI Mode", "Telegram Gateway Interface", "Exit Application")
  - Proper cancel/exit handling with formatted messages

#### Auto mode implemented and model selection added (a8fef7c — 2026-06-06)

- **Auto mode** — New `modes/auto.ts` implementing LLM-based intent classification router. Classifies user requests into one of 4 categories: `ask`, `plan`, `multi`, `agent`. Falls back to `agent` on classification failure.
- **Pre-captured goal forwarding** — All mode orchestrators (`runAgentMode`, `runAskMode`, `runPlanMode`, `runMultiAgentMode`) now accept an optional `preCapturedGoal` parameter, enabling auto mode to pass the user's original prompt through.
- **Model selection in setup wizard** — `modes/setup.ts` enhanced to prompt for the default OpenRouter model (defaults to `anthropic/claude-sonnet-4.5`), with merge logic that preserves existing values.
- **Session store enhancements** — Added `getMostRecentSession()` function, `autoResume` parameter to `beginSession()`, and `previousSessionId` chaining support.
- **Session mode type extended** — Added `"auto"` to the `SessionMode` union type.
- **Tool executor refactoring** — Major rework of `tool-executor.ts`:
  - Extracted `normalizePath()` as a public method
  - Added `discardStagedPath()` for granular overlay management
  - Improved `applyApprovedFromTracker()` with `appliedActionIds` deduplication
  - Better error messages with file operation context
- **Multi-agent orchestrator refactoring** — Significant simplification of `modes/multi/orchestrator.ts` (558 lines removed), removing redundant approval handling in favor of shared infrastructure.
- **Diff view improvements** — `modes/agent/diff-view.ts` enhanced with better formatting.

#### Multi-agent orchestration retry system added (27fb77b — 2026-06-04)

- **Core retry engine** — New `core/retry/` module with 4 files:
  - `retry-config.ts` — `ErrorCategory` enum (TRANSIENT, PERMANENT, RATE_LIMIT, NETWORK, AUTH, TIMEOUT, UNKNOWN), `RetryConfig` interface, `ClassifiedError` interface, `RetryStats`, `RetryResult`, and config merge logic.
  - `retry-engine.ts` — `withRetry()` function with exponential backoff, jitter, per-attempt timeouts, `onRetry`/`onExhausted` callbacks. Also `withRetryOrNull()` and `createRetryWrapper()` utilities.
  - `error-classifier.ts` — Analyzes errors via HTTP status codes (429/503=rate limit, 401/403=auth, 500/502/504=server), error codes (ECONNRESET, ETIMEDOUT, etc.), and 20+ regex patterns against error messages.
  - `index.ts` — Public API re-exports.
- **Retry presets** — 4 presets: `aiCall` (3 retries, 1s→30s), `toolExecution` (2 retries, 500ms→5s), `network` (5 retries, 2s→60s), `critical` (5 retries, 1s→60s).
- **Auto-retry integration** — New `ai/auto-retry.ts` module with `withAiRetry()` and `createRetryableAiCall()` functions that wrap AI provider calls with automatic retry, progress display, and optional fallback to manual retry prompt.
- **Multi-agent orchestrator retry** — `modes/multi/multi-agent-orchestrator.ts` updated with retry support for agent step failures.

#### Multi-agent orchestration fixes (50562fa — 2026-06-04)

- **Comprehensive multi-agent refactor** — All 7 files in `modes/multi/` significantly reworked (1,792 insertions, 1,398 deletions):
  - `types.ts` — Expanded type system with additional interfaces and refined agent role definitions.
  - `agent-pool-manager.ts` — Improved agent registration, tracking, activation/deactivation, and stats.
  - `message-broker.ts` — Enhanced pub-sub with `replayMessages()` async iterator and conversation filtering.
  - `multi-agent-orchestrator.ts` — Strategy dispatch engine refined with better error handling and retry integration.
  - `orchestrator.ts` — Approval flow restructured for per-agent review groups.
  - `workflow-builder.ts` — Fluent API refined with improved validation (10+ checks).
  - `examples.ts` — 5 example workflows updated (codeReview, parallelDevelopment, collaborativeBugFix, advanced, multiModelOrchestration).

#### Documentation of current version (e7783c1 — 2026-06-03)

- **DOCUMENTATION.md** — New comprehensive 1,005-line technical documentation covering every aspect of the system.
- **Removed** `publishPrep.md` and `tools.md` (superseded by DOCUMENTATION.md).

#### Workflow improved (0b3cdfc — 2026-06-03)

- **Retry prompt fallback** — New `ai/retry-prompt.ts` with `promptToRetryAiCall()` function that displays the error in red and asks "Try again?" via `@clack/confirm`.
- **Agent mode retry loop** — Replaced single-try/catch with a `while(true)` retry loop using `promptToRetryAiCall()`. On decline, marks session as interrupted and ends gracefully.
- **Ask mode retry loop** — Same retry pattern as agent mode.
- **Plan mode retry loops** — Retry logic added to both plan generation and each step's execution.
- **Approval flow enhancements** — `runApprovalFlow()` now accepts `ApprovalFlowOptions` with `paths` filter and `skipBatchPrompt` flag for programmatic single-file approval during agent execution.
- **Per-file approval during agent loop** — Agent mode now defines an `approveCreatedFile` callback that runs single-file approval flow immediately when the agent creates a file (via `afterCreateFile` hook in `createAgentTools`).
- **Action tracker enhancements** — Added `getPendingMutationsForPath()` method for path-filtered queries.
- **Tool executor hardening** — Added `appliedActionIds` set to prevent double-application of actions. `discardChanges()` now also clears `appliedActionIds`. `applyApprovedFromTracker()` now groups operations by path and applies only the last action per path.
- **Snake arcade game** — New `game/index.html` — full Snake game with HTML5 Canvas, gradient backgrounds, glow effects, snake eyes, input queue, high score in localStorage, mobile touch controls, pause/resume, game over screen, win condition, and High DPI support (573 lines).

#### Sessions added (a222295 — 2026-06-02)

- **Session management system** — New `session/` module with 5 files:
  - `store.ts` — JSON file store at `~/.astra/sessions/index.json` with atomic writes (temp file + rename), CRUD operations, max 50 sessions with pruning.
  - `session-manager.ts` — `beginSession()`, `endSession()`, `endMultiSession()`, `markSessionInterrupted()`, `getResumableSession()`, `getSessionHistory()`, `removeSession()`, `formatSessionLine()`, and LLM-powered session summarisation.
  - `session-context.ts` — `captureSessionContext()` and `buildContextSummary()` for extracting and formatting session context for agent resumption.
  - `session-tools.ts` — `createSessionTools()` providing `session_status` and `session_history` tools injected into every agent.
  - `index.ts` — Public API re-exports.
- **Session lifecycle integration** — All mode orchestrators (agent, ask, plan) updated with `beginSession()` / `endSession()` calls, session interruption handling, and context summary injection on resume.
- **Session resume on wakeup** — `tui/wakeup.ts` checks for interrupted sessions and offers to resume before showing the mode menu.
- **Session ID generation** — Format: `sess_<random>_<hex>`.
- **Gitignore update** — Added `.astra/sessions/` to `.gitignore`.

#### Multi agent orchestration optimization (2315860 — 2026-06-02)

- **Minor orchestrator fix** — 4-line addition to `modes/multi/multi-agent-orchestrator.ts` for improved strategy dispatch.

#### Multi agent orchestration (c3f73d5 — 2026-06-02)

- **Complete multi-agent system** — New `modes/multi/` directory with 7 files (2,912 lines):
  - `types.ts` — Full type system: `AgentRole`, `AgentConfig`, `AgentMessage`, `AgentContext`, `AgentExecutionResult`, `OrchestrationStrategy`, `MultiAgentWorkflow`, `AgentPool`, `AgentInstance`, `OrchestratorState`, `CommunicationChannel`.
  - `agent-pool-manager.ts` — Agent registration, tracking, activation/deactivation, failure handling, message queuing, completion percentage, and stats.
  - `message-broker.ts` — Pub-sub communication channel with `broadcast()`, `subscribe()`, `getMessagesFor()`, `getConversation()`, `replayMessages()`.
  - `multi-agent-orchestrator.ts` — Main orchestration engine with strategy dispatch for Sequential, Parallel, Hierarchical, and Collaborative strategies. Per-agent model support, role-based system prompts, tool filtering, executor configuration by role, prompt building with conversation history.
  - `orchestrator.ts` — Multi-agent approval flow with per-agent review groups and diff display.
  - `workflow-builder.ts` — Fluent API (`addResearcher()`, `addImplementer()`, `addReviewer()`, `addCoordinator()`, `addCustomAgent()`) with strategy setters, retry config, and 10+ validation checks. Includes `WorkflowTemplates` with 4 predefined templates.
  - `examples.ts` — 5 example workflow configurations.
- **CLI mode loop updated** — Added "Multi-Agent Mode" option to the mode selector.

#### Plan mode upgrade (c67ae5a — 2026-06-01)

- **Planner tool refactoring** — Replaced hand-written `readOnlyTools()` with `createPlannerTools()` that derives read-only tools from `createAgentTools()`.
- **Plan orchestrator robustness** — Fixed empty text check, improved formatting.

#### More tools added to agent and ask mode (07edb48 — 2026-06-01)

- **Agent tools expanded** — `modes/agent/agent-tools.ts` grew by 221 lines with new tool definitions.
- **Tool executor expanded** — `modes/agent/tool-executor.ts` grew by 548 lines with new implementations.
- **Ask mode orchestrator rework** — `modes/ask/orchestrator.ts` restructured with improved read-only tool filtering.

#### API keys setup option added (1c0b18a — 2026-05-31)

- **Setup wizard** — New `modes/setup.ts` — interactive configuration wizard for API keys and settings.
- **Config loader** — New `ai/config-loader.ts` — manages `~/.astra/.env` file.
- **CLI entry point** — `index.ts` updated to register the `setup` command.

#### Loader spinner add for steps (8a1cb38 — 2026-05-31)

- **Animated spinner** — New `tui/spinner.ts` with 10 frames, color palette, elapsed time formatting, and `withSpinner<T>()` async wrapper.
- **Spinner integration** — All mode orchestrators updated to use spinners.

#### README updated (7ce1a06 — 2026-05-31)

- **Comprehensive README** — Grew from 15 lines to 272 lines.

#### MVP ready (0d14b27 — 2026-05-31)

- **Plan mode** — New `modes/plan/` directory with 5 files (types, planner, selection, web-tools, orchestrator).
- **Ask mode improvements** — Markdown response formatting.
- **CLI mode loop** — Added "Plan Mode" option.

#### Ask mode implemented (c91b7c1 — 2026-05-31)

- **Ask mode** — New `modes/ask/orchestrator.ts` — read-only Q&A interface with optional `.md` save.

#### Ready for approval flow implementation (ec0f258 — 2026-05-30)

- **Agent mode foundation** — New `modes/agent/` directory with 6 files (types, action-tracker, agent-tools, tool-executor, approval, orchestrator).
- **CLI mode loop** — New `modes/cli.ts` with mode selection.
- **Terminal markdown** — New `tui/terminal-md.ts`.
- **Wakeup banner** — New `tui/wakeup.ts` with figlet ASCII banner.

#### First commit (551562f — 2026-05-29)

- **Project scaffolding** — Initial 6 files: `package.json`, `index.ts`, `tsconfig.json`, `.gitignore`, `README.md`, `bun.lock`.

---

## Summary of Statistics

| Metric | Value |
|--------|-------|
| Total commits | 34 |
| Development period | May 29 – July 3, 2026 (36 days) |
| Total files created | 45+ |
| Total lines of code | ~15,000+ |
| Interaction modes | 5 (Auto, Agent, Ask, Plan, Multi-Agent) |
| Agent tools | 35+ |
| Orchestration strategies | 5 (Sequential, Parallel, Hierarchical, Collaborative, DAG) |
| Agent roles | 5 (Researcher, Implementer, Reviewer, Coordinator, Custom) |
| Retry presets | 4 (aiCall, toolExecution, network, critical) |
| Error categories | 7 (Transient, Permanent, Rate Limit, Network, Auth, Timeout, Unknown) |
| Built-in skills | 5 (code-review, documentation, git-workflow, project-setup, test-runner) |
| Arcade games | 3 (Retro Snake Classic, Neon Brick Breaker, Neon Pong) |
