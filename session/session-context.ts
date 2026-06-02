import type { ActionTracker } from "../modes/agent/action-tracker";
import type { SessionMode, SessionEntry } from "./store";

/**
 * Rich context that is persisted alongside a session entry.
 * This enables the agent to pick up where it left off.
 */
export interface SessionContextData {
  transcript: Array<{
    role: "user" | "agent" | "system";
    content: string;
    timestamp: string;
  }>;
  activeFiles: string[];
  pendingTasks: string[];
  lastAgentResponse: string;
}

/**
 * Build the context payload from the current session's state.
 */
export function captureSessionContext(tracker: ActionTracker): SessionContextData {
  const actions = tracker.getActions();
  const activeFiles = [
    ...new Set(
      actions
        .filter((a) =>
          a.type === "file_create" ||
          a.type === "file_modify" ||
          a.type === "file_delete" ||
          a.type === "code_analysis"
        )
        .map((a) => a.path)
    ),
  ];

  return {
    transcript: [],
    activeFiles,
    pendingTasks: [],
    lastAgentResponse: "",
  };
}

/**
 * Build a compact context summary suitable for injecting into
 * an agent's system prompt so it "remembers" the previous session.
 */
export function buildContextSummary(entry: SessionEntry): string {
  const parts: string[] = [];

  parts.push("[Previous Session Context]");
  parts.push(`Mode: ${entry.mode}`);
  parts.push(`Last goal: ${entry.lastGoal}`);
  if (entry.summary) parts.push(`Summary: ${entry.summary}`);
  if (entry.touchedFiles.length > 0) {
    parts.push(`Files touched: ${entry.touchedFiles.slice(0, 15).join(", ")}`);
    if (entry.touchedFiles.length > 15) {
      parts.push(`  …and ${entry.touchedFiles.length - 15} more`);
    }
  }
  if (entry.appliedActions > 0) {
    parts.push(`Applied changes: ${entry.appliedActions} actions approved.`);
  }
  if (entry.rejectedActions > 0) {
    parts.push(`Discarded: ${entry.rejectedActions} actions rejected.`);
  }

  return parts.join("\n");
}
