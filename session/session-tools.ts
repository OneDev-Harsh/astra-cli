import { tool } from "ai";
import { z } from "zod";
import { getSession, searchSessions } from "./store";
import { getSessionHistory } from "./session-manager";
import { buildContextSummary } from "./session-context";

export function createSessionTools(workspacePath: string) {
  return {
    /**
     * Lists recent sessions with their status and goal.
     * The agent can use this to understand what work has been done recently.
     */
    session_status: tool({
      description:
        "Check recent session history — shows mode, goal, outcome, and any pending tasks. " +
        "Use this to understand what was previously worked on before starting new work.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe("Number of recent sessions to show (default 5)"),
      }),
      execute: async ({ limit }) => {
        const history = getSessionHistory(workspacePath, limit);
        if (history.length === 0) return "(no previous sessions found)";

        const lines = history.map((s) => {
          const pending =
            s.pendingTasks?.length
              ? `\n  ⚠ Pending: ${s.pendingTasks.join("; ")}`
              : "";
          const summary = s.summary ? `\n  Summary: ${s.summary}` : "";
          return (
            `• [${s.id}] [${s.mode}] ${s.lastGoal.slice(0, 80)}` +
            `${s.lastGoal.length > 80 ? "…" : ""} (${s.status})` +
            summary +
            pending
          );
        });
        return `Recent sessions:\n\n${lines.join("\n\n")}`;
      },
    }),

    /**
     * Retrieves the full context of a previous session, including transcript
     * and pending tasks, so the agent can seamlessly continue that work.
     */
    session_resume_context: tool({
      description:
        "Get the full context of a previous session to continue its work. " +
        "Returns the conversation transcript, pending tasks, touched files, and a summary. " +
        "Use session_status first to find the right session ID.",
      inputSchema: z.object({
        session_id: z.string().describe("The session ID to resume (from session_status)"),
        transcript_turns: z
          .number()
          .int()
          .min(1)
          .max(30)
          .default(10)
          .describe("How many recent conversation turns to include"),
      }),
      execute: async ({ session_id, transcript_turns }) => {
        const session = getSession(session_id);
        if (!session) return `Session not found: ${session_id}`;
        return buildContextSummary(session, { transcriptTurns: transcript_turns });
      },
    }),

    /**
     * Search for sessions related to a topic or file.
     * Uses relevance scoring across goals, summaries, tags, and touched files.
     */
    session_search: tool({
      description:
        "Search previous sessions by keyword, file name, or goal. " +
        "Uses relevance scoring to find the most related prior work.",
      inputSchema: z.object({
        query: z.string().describe("Keyword, file name, or phrase to search for"),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      execute: async ({ query, limit }) => {
        const results = searchSessions(query, { workspacePath, limit });

        if (results.length === 0) return `No sessions found matching "${query}".`;

        const lines = results.map(
          (r) =>
            `• [${r.entry.id}] ${r.entry.lastGoal.slice(0, 60)} (${r.entry.status})` +
            (r.entry.touchedFiles.length > 0
              ? `\n  Files: ${r.entry.touchedFiles.slice(0, 5).join(", ")}` +
                (r.entry.touchedFiles.length > 5 ? ` (+${r.entry.touchedFiles.length - 5} more)` : "")
              : "")
        );
        return `Sessions matching "${query}":\n\n${lines.join("\n\n")}`;
      },
    }),
  };
}
