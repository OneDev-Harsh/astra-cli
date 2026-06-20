import chalk from "chalk";
import { generateText, stepCountIs } from "ai";
import { getAgentModel } from "../ai";
import type { ActionTracker } from "../modes/agent/action-tracker";
import type { SessionMode, SessionEntry, TranscriptMessage } from "./store";
import {
  listSessions,
  getSession,
  getMostRecentSession,
  createSession,
  updateSession,
  deleteSession,
  appendTranscript,
} from "./store";
import { captureSessionContext, buildContextSummary } from "./session-context";
import { ActionHistoryManager } from "./action-history";
import { ProjectContextLoader } from "./project-context";

const C = {
  primary: chalk.hex("#a78bfa"),
  dim: chalk.hex("#6b7280"),
  success: chalk.hex("#34d399"),
  warn: chalk.hex("#fbbf24"),
  error: chalk.hex("#f87171"),
  time: chalk.hex("#fbbf24"),
};

// ── Public API ─────────────────────────────────────────────────────────────

export interface BeginSessionResult {
  entry: SessionEntry;
  /** Full context block to inject into the system prompt, or null for brand-new sessions. */
  contextSummary: string | null;
  /** True if this is continuing an existing session (user didn't have to ask). */
  autoResumed: boolean;
  /** The session that was resumed, if any. */
  resumedFrom?: SessionEntry;
}

/**
 * Start a new session or resume an existing one.
 *
 * Resume logic (in priority order):
 *  1. Explicit `resumeSessionId` supplied → resume that session.
 *  2. `autoResume: true` + an interrupted session exists in this workspace → resume it.
 *  3. `autoResume: true` + the most recent session is "related" to the new goal → resume it.
 *  4. Otherwise → create a fresh session.
 */
/**
 * Start a new session or resume an existing one.
 *
 * Resume logic (in priority order):
 * 1. Explicit `resumeSessionId` supplied → resume that session.
 * 2. `autoResume: true` + an interrupted session exists in this workspace → resume it.
 * 3. `autoResume: true` + the most recent session is "related" to the new goal → resume it.
 * 4. Otherwise → create a fresh session.
 * * Auto-injects local project configuration memory rules via ASTRA.md if present.
 */
export function beginSession(opts: {
  workspacePath: string;
  mode: SessionMode;
  goal: string;
  resumeSessionId?: string;
  /** If true, silently resume when a clear prior session exists. Default: true. */
  autoResume?: boolean;
}): BeginSessionResult {
  const autoResume = opts.autoResume ?? true;

  // ── 1. Explicit resume
  if (opts.resumeSessionId) {
    return resumeSession(opts.resumeSessionId, opts);
  }

  if (autoResume) {
    // ── 2. Interrupted session in same workspace
    const interrupted = listSessions(opts.workspacePath, 10).find(
      (s) => s.status === "interrupted"
    );
    if (interrupted) {
      return resumeSession(interrupted.id, opts, true);
    }

    // ── 3. Recent session that looks related
    const recent = getMostRecentSession(opts.workspacePath);
    if (recent && isRelated(recent, opts.goal)) {
      return resumeSession(recent.id, opts, true);
    }
  }

  // ── 4. Brand new session
  const entry = createSession({
    workspacePath: opts.workspacePath,
    mode: opts.mode,
    goal: opts.goal,
  });

  // Automatically parse and inject project rules for new runs
  let contextSummary: string | null = null;
  const localMemory = ProjectContextLoader.findAndReadContext(opts.workspacePath);
  if (localMemory) {
    contextSummary = ProjectContextLoader.injectContextBlock(localMemory);
  }

  return { entry, contextSummary, autoResumed: false };
}

/**
 * Record a user message in the active session transcript.
 * Call this each time the user sends a prompt so the transcript stays current.
 */
export function recordUserMessage(sessionId: string, content: string): void {
  appendTranscript(sessionId, [
    { role: "user", content, timestamp: new Date().toISOString() },
  ]);
  // Also track goal evolution
  const session = getSession(sessionId);
  if (session && !session.allGoals.includes(content)) {
    updateSession(sessionId, { lastGoal: content });
  }
}

/**
 * Record an agent response in the active session transcript.
 * Call this each time the agent produces output.
 */
export function recordAgentMessage(sessionId: string, content: string): void {
  appendTranscript(sessionId, [
    { role: "agent", content, timestamp: new Date().toISOString() },
  ]);
}

/**
 * Call this after the agent finishes its work.
 * Extracts a summary, captures pending tasks, and persists everything.
 */
export async function endSession(
  sessionId: string,
  tracker: ActionTracker,
  agentResponse: string,
  pendingTasks: string[] = []
): Promise<void> {
  const actions = tracker.getActions();
  const touchedFiles = [
    ...new Set(
      actions
        .map((a) => a.path)
        .filter(
          (p) => p !== "web" && p !== "shell" && p !== "skills" && p !== "plan"
        )
    ),
  ];
  const approvedActionsList = actions.filter((a) => a.status === "approved");
  const appliedActions = approvedActionsList.length;
  const rejectedActions = actions.filter((a) => a.status === "rejected").length;

  const summary = await summariseSession(actions, agentResponse);

  // Sync to historical log upon runtime compilation/exit
  if (approvedActionsList.length > 0) {
    // Fallback context: paths will be parsed natively inside history log tracking
    await ActionHistoryManager.recordGlobalActions(sessionId, process.cwd(), approvedActionsList);
  }

  updateSession(
    sessionId,
    {
      summary,
      touchedFiles,
      appliedActions,
      rejectedActions,
      pendingTasks,
      lastAgentResponse: agentResponse.slice(0, 2_000),
      status: "completed",
    },
    actions
  );
}

// 3. Update your endMultiSession function:
export async function endMultiSession(
  sessionId: string,
  trackers: Map<string, { tracker: ActionTracker; response: string }>,
  pendingTasks: string[] = []
): Promise<void> {
  let allTouchedFiles: string[] = [];
  let totalApplied = 0;
  let totalRejected = 0;
  const responses: string[] = [];

  for (const [, { tracker, response }] of trackers) {
    const actions = tracker.getActions();
    const files = actions
      .map((a) => a.path)
      .filter(
        (p) => p !== "web" && p !== "shell" && p !== "skills" && p !== "plan"
      );
    allTouchedFiles.push(...files);
    totalApplied += actions.filter((a) => a.status === "approved").length;
    totalRejected += actions.filter((a) => a.status === "rejected").length;
    if (response) responses.push(response);
  }

  const touchedFiles = [...new Set(allTouchedFiles)];
  const allActions = [...trackers.values()].flatMap((t) =>
    t.tracker.getActions()
  );
  
  // Isolate combined multi-agent approved actions
  const multiAgentApprovedActions = allActions.filter((a) => a.status === "approved");

  const combinedResponse = responses.join("\n\n");
  const summary = await summariseSession(allActions, combinedResponse);

  // Sync the aggregated multi-agent workspace tree globally
  if (multiAgentApprovedActions.length > 0) {
    await ActionHistoryManager.recordGlobalActions(sessionId, process.cwd(), multiAgentApprovedActions);
  }

  updateSession(
    sessionId,
    {
      summary,
      touchedFiles,
      appliedActions: totalApplied,
      rejectedActions: totalRejected,
      pendingTasks,
      lastAgentResponse: combinedResponse.slice(0, 2_000),
      status: "completed",
    },
    allActions
  );
}

/**
 * Mark the current session as interrupted (Ctrl+C, process killed, etc.)
 * The transcript and state so far are preserved for auto-resume.
 */
export function markSessionInterrupted(sessionId: string): void {
  updateSession(sessionId, { status: "interrupted" });
}

/**
 * Get the most recent session for a workspace that can be resumed.
 */
export function getResumableSession(
  workspacePath: string
): SessionEntry | undefined {
  return getMostRecentSession(workspacePath);
}

/**
 * List recent sessions for a workspace.
 */
export function getSessionHistory(
  workspacePath?: string,
  limit = 10
): SessionEntry[] {
  return listSessions(workspacePath, limit);
}

/**
 * Delete a specific session.
 */
export function removeSession(id: string): boolean {
  return deleteSession(id);
}

// ── Internal helpers ───────────────────────────────────────────────────────

function resumeSession(
  previousId: string,
  opts: { workspacePath: string; mode: SessionMode; goal: string },
  autoResumed = false
): BeginSessionResult {
  const prev = getSession(previousId);
  if (!prev) {
    // Fallback: create fresh
    const entry = createSession({
      workspacePath: opts.workspacePath,
      mode: opts.mode,
      goal: opts.goal,
    });
    
    let contextSummary: string | null = null;
    const localMemory = ProjectContextLoader.findAndReadContext(opts.workspacePath);
    if (localMemory) {
      contextSummary = ProjectContextLoader.injectContextBlock(localMemory);
    }
    return { entry, contextSummary, autoResumed: false };
  }

  // Mark old session as completed before chaining
  updateSession(prev.id, { status: "completed" });

  // Get rolling historical transcript window context summary
  let contextSummary = buildContextSummary(prev, { transcriptTurns: 12 }) || "";

  // Locate and prepend ASTRA.md project memory guidelines directly above historical transcript items
  const localMemory = ProjectContextLoader.findAndReadContext(opts.workspacePath);
  if (localMemory) {
    const formattedBlock = ProjectContextLoader.injectContextBlock(localMemory);
    contextSummary = contextSummary 
      ? formattedBlock + "\n" + contextSummary 
      : formattedBlock;
  }

  const entry = createSession({
    workspacePath: opts.workspacePath,
    mode: opts.mode,
    goal: opts.goal,
    previousSessionId: prev.id,
  });

  // Carry forward pending tasks and touched files so the new session inherits them
  if (prev.pendingTasks?.length || prev.touchedFiles?.length) {
    updateSession(entry.id, {
      pendingTasks: prev.pendingTasks ?? [],
      touchedFiles: prev.touchedFiles ?? [],
    });
  }

  return {
    entry,
    contextSummary: contextSummary || null,
    autoResumed,
    resumedFrom: prev,
  };
}

/**
 * Heuristic: is a new goal "related" to a previous session?
 * Uses keyword overlap and recency (sessions older than 4h are less likely to be relevant).
 */
function isRelated(session: SessionEntry, newGoal: string): boolean {
  // Don't auto-resume sessions older than 4 hours unless interrupted
  const ageMs = Date.now() - new Date(session.updatedAt).getTime();
  if (ageMs > 4 * 60 * 60 * 1_000 && session.status !== "interrupted") return false;
  if (session.status === "completed" && ageMs > 30 * 60 * 1_000) return false;

  const tokens = (s: string) =>
    s
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);

  const prevTokens = new Set([
    ...tokens(session.lastGoal),
    ...tokens(session.summary ?? ""),
    ...(session.allGoals ?? []).flatMap(tokens),
  ]);

  const newTokens = tokens(newGoal);
  if (newTokens.length === 0) return false;

  const overlap = newTokens.filter((t) => prevTokens.has(t)).length;
  const ratio = overlap / newTokens.length;

  return ratio >= 0.3; // ≥30% keyword overlap
}

// ── LLM Summarisation ─────────────────────────────────────────────────────

async function summariseSession(
  actions: readonly { type: string; path: string; status: string }[],
  agentResponse: string
): Promise<string> {
  const actionsSummary = actions
    .slice(0, 40)
    .map((a) => `- ${a.type} ${a.path} [${a.status}]`)
    .join("\n");

  try {
    const result = await generateText({
      model: await getAgentModel(),
      stopWhen: stepCountIs(1),
      prompt: [
        "Summarise this coding session in 2-3 concise sentences.",
        "Focus on: what was the goal, what key files were changed, and the outcome.",
        "If there are incomplete tasks, mention them.",
        "",
        "Actions:",
        actionsSummary,
        "",
        "Agent's final response:",
        agentResponse.slice(0, 2_000),
      ].join("\n"),
    });
    return result.text.trim();
  } catch {
    const created = actions.filter((a) => a.type === "file_create").length;
    const modified = actions.filter((a) => a.type === "file_modify").length;
    const deleted = actions.filter((a) => a.type === "file_delete").length;
    const approved = actions.filter((a) => a.status === "approved").length;
    return `Session completed. ${created} files created, ${modified} modified, ${deleted} deleted. ${approved} actions approved.`;
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────

export function formatSessionLine(s: SessionEntry): string {
  const age = humanAge(s.updatedAt);
  const statusIcon =
    s.status === "completed"
      ? C.success("✔")
      : s.status === "interrupted"
        ? C.warn("⏸")
        : C.dim("●");
  const modeTag = C.dim(`[${s.mode}]`);
  const pendingTag =
    s.pendingTasks?.length ? C.warn(` (${s.pendingTasks.length} pending)`) : "";
  const goal = s.lastGoal.slice(0, 55) + (s.lastGoal.length > 55 ? "…" : "");
  return `${statusIcon} ${age.padEnd(8)} ${modeTag.padEnd(12)} ${goal}${pendingTag}`;
}

function humanAge(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}