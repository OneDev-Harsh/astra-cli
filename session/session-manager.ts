import chalk from "chalk";
import { generateText, stepCountIs } from "ai";
import { getAgentModel } from "../ai";
import type { ActionTracker } from "../modes/agent/action-tracker";
import type { SessionMode, SessionEntry } from "./store";
import {
  listSessions,
  getSession,
  getMostRecentSession,
  createSession,
  updateSession,
  deleteSession,
} from "./store";
import { captureSessionContext, buildContextSummary } from "./session-context";

const C = {
  primary: chalk.hex("#a78bfa"),
  dim: chalk.hex("#6b7280"),
  success: chalk.hex("#34d399"),
  time: chalk.hex("#fbbf24"),
};

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Start a new session or resume an existing one.
 */
export function beginSession(opts: {
  workspacePath: string;
  mode: SessionMode;
  goal: string;
  resumeSessionId?: string;
}): { entry: SessionEntry; contextSummary: string | null } {
  let previousSummary: string | null = null;
  let previousId: string | undefined;

  if (opts.resumeSessionId) {
    const prev = getSession(opts.resumeSessionId);
    if (prev) {
      previousSummary = buildContextSummary(prev);
      previousId = prev.id;
      updateSession(prev.id, { status: "completed" });
    }
  }

  const entry = createSession({
    workspacePath: opts.workspacePath,
    mode: opts.mode,
    goal: opts.goal,
    previousSessionId: previousId,
  });

  return { entry, contextSummary: previousSummary };
}

/**
 * Call this after the agent finishes its work.
 * Extracts a summary from the action tracker and persists it.
 */
export async function endSession(
  sessionId: string,
  tracker: ActionTracker,
  agentResponse: string
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
  const appliedActions = actions.filter((a) => a.status === "approved").length;
  const rejectedActions = actions.filter((a) => a.status === "rejected").length;

  const summary = await summariseSession(actions, agentResponse);

  // FIXED: Added 'actions' as the 3rd parameter here to persist them to disk
  updateSession(sessionId, {
    summary,
    touchedFiles,
    appliedActions,
    rejectedActions,
    status: "completed",
  }, actions); 
}

/**
 * End a multi-aggregates session from multiple agent trackers.
 */
export async function endMultiSession(
  sessionId: string,
  trackers: Map<string, { tracker: ActionTracker; response: string }>
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
  const allActions = [...trackers.values()].flatMap((t) => t.tracker.getActions());
  const summary = await summariseSession(allActions, responses.join("\n\n"));

  // FIXED: Added 'allActions' as the 3rd parameter here
  updateSession(sessionId, {
    summary,
    touchedFiles,
    appliedActions: totalApplied,
    rejectedActions: totalRejected,
    status: "completed",
  }, allActions);
}

/**
 * Mark the current session as interrupted (process killed, Ctrl+C, etc.)
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

// ── LLM Summarisation ─────────────────────────────────────────────────────

async function summariseSession(
  actions: readonly { type: string; path: string; status: string }[],
  agentResponse: string
): Promise<string> {
  const actionsSummary = actions
    .slice(0, 30)
    .map((a) => `- ${a.type} ${a.path} [${a.status}]`)
    .join("\n");

  try {
    const result = await generateText({
      model: getAgentModel(),
      stopWhen: stepCountIs(1),
      prompt: [
        "Summarise this coding session in 2-3 sentences.",
        "Focus on: what was the goal, what files were changed, what was the outcome.",
        "",
        "Actions:",
        actionsSummary,
        "",
        "Agent's final response:",
        agentResponse.slice(0, 2000),
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
        ? C.dim("⏸")
        : C.dim("●");
  const modeTag = C.dim(`[${s.mode}]`);
  return `${statusIcon} ${age.padEnd(8)} ${modeTag.padEnd(12)} ${s.lastGoal.slice(0, 60)}${s.lastGoal.length > 60 ? "…" : ""}`;
}

function humanAge(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}