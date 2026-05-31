Now I have a thorough understanding of the entire codebase. Here's my detailed architecture review:

-----------------------------------------------------------------------------------------------------------------------

## Architecture Rating: 6.5 / 10 — Promising Foundation, Needs Hardening

You've built a clever, well-documented CLI with a genuinely good staging-first safety model — that's the standout
feature. But there are significant gaps between where it is and where it needs to be for production/industry readiness.

### What's Done Well ✅

    1. **Staging & approval pipeline** — the overlay map + action tracker + diff-based approval flow is a genuinely solid safety mechanism. This puts you ahead of most coding agents that write directly to disk.
    2. **Clean mode separation** — Agent, Ask, and Plan are well-isolated with clear intent per mode.
    3. **Strong TypeScript config** — strict mode, latest target, bundler resolution. Good foundation.
    4. **Zod-validated tool schemas** — every tool input is validated, which prevents a class of runtime errors.
    5. **Path traversal protection** — `resolveSafe` correctly prevents directory escape.
    6. **README quality** — thorough documentation with architecture diagrams.

-----------------------------------------------------------------------------------------------------------------------

### Issues & Recommended Changes

#### 🔴 Critical (Must Fix for Production)

1. No error handling / retry strategy for LLM calls

    * Every `agent.generate()`, `generateText()`, and spinner-wrapped call can throw network errors, rate-limit errors, token-limit errors, or malformed responses — and most are barely caught.
    * **Fix:** Wrap all LLM calls in a retry circuit-breaker with exponential backoff. Differentiate between retryable (rate limit, timeout) and non-retryable (auth, bad schema) errors. Return typed error results instead of throwing.

2. No streaming support — UX will feel broken at scale

    * All modes use `withSpinner` + wait for the full response. Complex agent tasks can take 60+ seconds with zero feedback.
    * **Fix:** The Vercel AI SDK supports `streamText()` and `toDataStreamResponse()`. Agent mode should stream tool call events at minimum (partially done via `onStepFinish`), but Ask and Plan modes need token streaming for the markdown output.

3. Single model provider — tight coupling to OpenRouter

    * `getAgentModel()` is hardcoded to OpenRouter. No fallback, no model selection per mode, no provider abstraction.
    * **Fix:** Create an AI provider interface with implementations for OpenRouter, Anthropic direct, Ollama (local), etc. Use the Vercel AI SDK's `generateText`/`streamText` with a configurable provider registry.

4. Shell execution runs without sandboxing

    * `execute_shell` runs `spawnSync` with `shell: true` in the workspace directory with zero restrictions. Any agent hallucination or injection could run destructive commands.
    * **Fix:** Implement a shell allowlist/blocklist policy. Run in a restricted shell. Add a confirmation prompt for shell commands in the approval flow (it's queued but the approval prompt doesn't clearly indicate danger).

5. No input sanitization on file content

    * `modify_file` and `create_file` accept arbitrary strings from the LLM with zero validation. An agent could write binary content, extremely large files, or malicious scripts.
    * **Fix:** Add content-size limits, binary detection, and configurable forbidden patterns (e.g., no writing `.env` files, no writing outside workspace).

-----------------------------------------------------------------------------------------------------------------------

#### 🟠 Major (Should Fix Before Real Use)

6. ActionTracker IDs are not unique under concurrent operations

    id: entry.id ?? `action_${this.actions.length}`

    * Array length as ID is fragile. If actions are ever removed or reordered, IDs collide.
    * **Fix:** Use `crypto.randomUUID()` or a monotonic counter with a prefix.

7. No persistence — all state is in-memory

    * ActionTracker, overlay, staging — everything vanishes on crash or restart. If the process dies mid-approval, all staged work is lost.
    * **Fix:** Add a lightweight persistence layer (SQLite or JSON file in `~/.astra/sessions/`) for action logs and staged overlays. Enable crash recovery.

8. Glob-to-regex conversion is fragile

    const escaped = g.replace(/[.+^${}()|[\]\\]/g, "\\$&")...

    * This custom glob-to-regexp conversion doesn't handle character classes `[...]`, brace expansion `{a,b}`, negation `!`, or nested `**` properly. Users familiar with standard glob syntax will hit edge cases.
    * **Fix:** Use a library like `minimatch` or `picomatch` for robust glob matching.

9. ToolExecutor is a 600-line god class

    * It handles filesystem operations, shell execution, skill resolution, search, analysis, diff overlays, and approved-write application — all in one class.
    * **Fix:** Split into focused modules:
        * `FileSystemService` — read, write, delete, create
      
        * `ShellService` — command queuing and execution
      
        * `SearchService` — glob search, content search
      
        * `SkillService` — skill discovery and reading
      
        * `StagingService` — overlay management
      
        * `DiffService` — before/after composition and patch generation
      
        * `ToolExecutor` becomes a thin facade composing these services.

10. Web tools singleton client is not thread-safe

    let client: Firecrawl | null = null;

    * Module-level mutable singleton. If the key isn't set at startup but gets set later, the client never initializes. Also not testable.
    * **Fix:** Use a factory pattern or dependency injection.

11. Ask mode mutates config by reference

    const config = defaultAgentConfig()
    config.tools.allowShellExecution = false  // This mutates the object

    * `defaultAgentConfig()` returns a new object each time (good), but the mutable pattern is error-prone. If this ever changes to a shared default, you'll have mode cross-contamination.
    * **Fix:** Use `Object.freeze()` on config or return immutable configs via a builder pattern.

12. No test suite whatsoever

    * Zero tests — unit, integration, or E2E — for any of the business logic. The `ToolExecutor`, `ActionTracker`, approval flow, glob matching, and path safety are all untested.
    * **Fix:** Add Bun-native tests (`bun test`). At minimum, unit test:
        * Path traversal prevention
      
        * Overlay staging (create → modify → delete → apply)
      
        * Glob matching
      
        * ActionTracker lifecycle
      
        * Approval flow grouping logic
      
        * Config exclusion filtering

-----------------------------------------------------------------------------------------------------------------------

#### 🟡 Moderate (Quality & Maintainability)

13. Magic strings everywhere for action types

    * `'file_create'`, `'file_delete'`, `'code_analysis'` etc. are raw strings scattered across 10+ files.
    * **Fix:** Use `const` enums or `as const` string literal objects. Your `ActionType` type is good but not used consistently.

14. Inconsistent tool creation between modes

    * Agent mode has `createAgentTools()`, Ask mode has a local `createAskTools()`, Planner has `readOnlyTools()`. There's significant duplication with slight variations.
    * **Fix:** Create a `ToolRegistry` that composes toolsets based on mode capabilities. Define a `ModeCapabilities` object per mode and derive the toolset declaratively.

15. planSchema validates .max(20) steps but no minimum feedback

    * If the planner generates 1 step or 20 steps, there's no quality check. Complex goals get oversimplified; trivial goals get over-planned.
    * **Fix:** Add post-generation validation heuristics and allow the user to request plan refinement.

16. Version drift between banner and package.json

    * `package.json` says `0.1.0`, wakeup banner says `v0.0.1`.
    * **Fix:** Single source of truth — read version from `package.json`.

17. No logging infrastructure

    * Everything uses `console.log`. No structured logging, no log levels, no log persistence, no debug mode.
    * **Fix:** Add a lightweight logger with levels (`debug`, `info`, `warn`, `error`) and optional structured JSON output for debugging agent runs.

18. renderTerminalMarkdown has a typo

    ready: true  // This is a label, not an assignment!

This line does nothing — it's a statement label, not ready = true. The markedTerminal config is re-applied on every call
after the first because ready never becomes true.

-----------------------------------------------------------------------------------------------------------------------

### Architectural Diagram — What I'd Target

    ┌──────────┐     ┌────────────┐     ┌────────────────┐
    │  wakeup  │────▶│ ModeRouter │────▶│  Mode Plugins  │
    │  (entry) │     │  (cli.ts)  │     │ Agent/Ask/Plan │
    └──────────┘     └────────────┘     └───────┬────────┘
                                                │
                                        ┌───────▼────────┐
                                        │  Agent Runtime  │
                                        │ (stream+retry)  │
                                        └───────┬────────┘
                                                │
                        ┌───────────────────────┼───────────────────┐
                        │                       │                   │
                 ┌──────▼──────┐   ┌───────────▼──┐   ┌───────────▼──┐
                 │ ToolRegistry│   │ ActionTracker│   │  AI Provider │
                 │ (composable)│   │ (persistent) │   │  (pluggable) │
                 └──────┬──────┘   └──────────────┘   └──────────────┘
                        │
            ┌───────────┼───────────┬──────────┐
            │           │           │          │
       ┌────▼───┐ ┌─────▼───┐ ┌────▼───┐ ┌───▼────┐
       │  File  │ │  Shell  │ │ Search │ │  Web   │
       │Service │ │ Service │ │Service │ │Service │
       └────────┘ └─────────┘ └────────┘ └────────┘

### Suggested File Structure After Restructuring

    src/
    ├── index.ts                    # Entry point
    ├── cli/                        # CLI mode routing
    ├── ai/
    │   ├── providers/              # Pluggable providers (OpenRouter, Anthropic, Ollama)
    │   ├── provider-registry.ts    # Provider selection & fallback
    │   └── stream-handler.ts       # Streaming output management
    ├── modes/
    │   ├── agent/
    │   │   ├── orchestrator.ts
    │   │   └── agent-tools.ts      # Thin wrapper, delegates to ToolRegistry
    │   ├── ask/
    │   │   └── orchestrator.ts
    │   └── plan/
    │       ├── orchestrator.ts
    │       ├── planner.ts
    │       ├── selection.ts
    │       └── web-tools.ts
    ├── tools/
    │   ├── registry.ts             # Composable tool registry
    │   ├── capabilities.ts         # Mode capability definitions
    │   ├── file-service.ts         # CRUD + staging overlay
    │   ├── shell-service.ts        # Sandboxed execution
    │   ├── search-service.ts       # Glob matching (via minimatch)
    │   ├── skill-service.ts        # Skill discovery
    │   ├── diff-service.ts         # Patch generation
    │   └── analyze-service.ts      # Codebase summary
    ├── services/
    │   ├── action-tracker.ts       # Persistent action log (SQLite/JSON)
    │   ├── approval.ts             # Interactive approval flow
    │   └── logger.ts               # Structured logging
    ├── tui/
    │   ├── banner.ts
    │   ├── renderer.ts             # Terminal markdown
    │   └── spinner.ts
    ├── config/
    │   ├── loader.ts
    │   ├── types.ts
    │   └── defaults.ts
    └── __tests__/                  # Test suite
        ├── tools/
        ├── services/
        └── modes/

### Priority Order for Implementation

┌──────────┬─────────────────────────────────────────────────────┬──────────┐
│ Priority │ Item                                                │ Effort   │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P0       │ Fix ready: true bug in terminal-md                  │ 5 min    │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P0       │ Add Bun test suite (path safety, overlay, glob)     │ 1-2 days │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P0       │ Add LLM retry/circuit-breaker strategy              │ 1 day    │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P1       │ Split ToolExecutor into focused services            │ 2-3 days │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P1       │ Add streaming for Ask/Plan modes                    │ 1-2 days │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P1       │ Implement persistent action log + session recovery  │ 1-2 days │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P1       │ Replace custom glob with minimatch                  │ 2 hours  │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P1       │ Refactor duplicated tool creation into ToolRegistry │ 1 day    │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P2       │ Add pluggable AI provider system                    │ 2-3 days │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P2       │ Add structured logging                              │ 1 day    │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P2       │ Shell sandboxing / command policies                 │ 1-2 days │
├──────────┼─────────────────────────────────────────────────────┼──────────┤
│ P3       │ Content validation on file writes                   │ 1 day    │
└──────────┴─────────────────────────────────────────────────────┴──────────┘

-----------------------------------------------------------------------------------------------------------------------

You've built something with a genuinely good core idea — the staging-first safety model is the right instinct. The main
gaps are around resilience (error handling, retries, persistence), testability (zero test coverage), and separation of
concerns (the god-class tool executor). With the changes above, this could absolutely be industry-ready. Want me to
start implementing any of these?