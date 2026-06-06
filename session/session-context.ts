import type { ActionTracker } from "../modes/agent/action-tracker";
import type { SessionEntry, TranscriptMessage } from "./store";

export type { TranscriptMessage };

/**
 * Rich context persisted alongside a session entry.
 */
export interface SessionContextData {
  transcript: TranscriptMessage[];
  activeFiles: string[];
  pendingTasks: string[];
  lastAgentResponse: string;
}

/**
 * Build the full context payload from the current session state.
 * This is called at session end so all fields are populated.
 */
export function captureSessionContext(
  tracker: ActionTracker,
  transcript: TranscriptMessage[],
  lastAgentResponse: string,
  pendingTasks: string[] = []
): SessionContextData {
  const actions = tracker.getActions();
  const activeFiles = [
    ...new Set(
      actions
        .filter(
          (a) =>
            a.type === "file_create" ||
            a.type === "file_modify" ||
            a.type === "file_delete" ||
            a.type === "code_analysis"
        )
        .map((a) => a.path)
        .filter(Boolean)
    ),
  ];

  return {
    transcript,
    activeFiles,
    pendingTasks,
    lastAgentResponse,
  };
}

// ── Context summary builders ────────────────────────────────────────────────

/**
 * Build the FULL resumption context block injected into the agent's system
 * prompt when continuing an existing session.
 *
 * Includes:
 *  - session metadata
 *  - pending tasks
 *  - recent transcript (last N turns, configurable)
 *  - touched files
 *  - action counts
 *  - the agent's last response
 */
export function buildContextSummary(
  entry: SessionEntry,
  opts: { transcriptTurns?: number } = {}
): string {
  const { transcriptTurns = 10 } = opts;
  const parts: string[] = [];

  parts.push("╔══════════════════════════════════════╗");
  parts.push("║       RESUMED SESSION CONTEXT        ║");
  parts.push("╚══════════════════════════════════════╝");
  parts.push("");

  // ── Core metadata
  parts.push(`Mode        : ${entry.mode}`);
  parts.push(`Session ID  : ${entry.id}`);
  parts.push(`Started     : ${new Date(entry.createdAt).toLocaleString()}`);
  parts.push("");

  // ── Goals (all goals across session, most recent last)
  if (entry.allGoals && entry.allGoals.length > 1) {
    parts.push("Goals in this session:");
    entry.allGoals.forEach((g, i) => parts.push(`  ${i + 1}. ${g}`));
  } else {
    parts.push(`Goal: ${entry.lastGoal}`);
  }
  parts.push("");

  // ── Summary (LLM-generated)
  if (entry.summary) {
    parts.push("What happened:");
    parts.push(`  ${entry.summary}`);
    parts.push("");
  }

  // ── Pending tasks
  if (entry.pendingTasks && entry.pendingTasks.length > 0) {
    parts.push("⚠ Pending / incomplete tasks:");
    entry.pendingTasks.forEach((t) => parts.push(`  • ${t}`));
    parts.push("");
  }

  // ── Files
  if (entry.touchedFiles.length > 0) {
    const shown = entry.touchedFiles.slice(0, 20);
    parts.push(`Files touched (${entry.touchedFiles.length}):`);
    shown.forEach((f) => parts.push(`  • ${f}`));
    if (entry.touchedFiles.length > 20) {
      parts.push(`  … and ${entry.touchedFiles.length - 20} more`);
    }
    parts.push("");
  }

  // ── Action counts
  if (entry.appliedActions > 0 || entry.rejectedActions > 0) {
    parts.push(
      `Actions: ${entry.appliedActions} applied, ${entry.rejectedActions} rejected.`
    );
    parts.push("");
  }

  // ── Transcript (most recent N turns)
  if (entry.transcript && entry.transcript.length > 0) {
    const turns = entry.transcript.slice(-transcriptTurns * 2);
    parts.push(`Recent conversation (last ${Math.floor(turns.length / 2)} turns):`);
    parts.push("─".repeat(40));
    for (const msg of turns) {
      const label =
        msg.role === "user"
          ? "User"
          : msg.role === "agent"
            ? "Agent"
            : "System";
      const snippet = msg.content.length > 400
        ? msg.content.slice(0, 400) + "…"
        : msg.content;
      parts.push(`[${label}] ${snippet}`);
    }
    parts.push("─".repeat(40));
    parts.push("");
  }

  // ── Last agent response (in case transcript was trimmed)
  if (entry.lastAgentResponse && entry.transcript.length === 0) {
    parts.push("Agent's last response:");
    parts.push(
      entry.lastAgentResponse.length > 800
        ? entry.lastAgentResponse.slice(0, 800) + "…"
        : entry.lastAgentResponse
    );
    parts.push("");
  }

  parts.push("You are now resuming this session. Continue where you left off.");
  parts.push(
    entry.pendingTasks && entry.pendingTasks.length > 0
      ? "Address the pending tasks above unless the user specifies otherwise."
      : "Await the user's next instruction."
  );

  return parts.join("\n");
}

/**
 * Lightweight one-line summary for display in the CLI session picker.
 */
export function buildSessionOneliner(entry: SessionEntry): string {
  const age = humanAge(entry.updatedAt);
  const pending = entry.pendingTasks?.length
    ? ` [${entry.pendingTasks.length} pending]`
    : "";
  return `${age.padEnd(8)} [${entry.mode}] ${entry.lastGoal.slice(0, 60)}${pending}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

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