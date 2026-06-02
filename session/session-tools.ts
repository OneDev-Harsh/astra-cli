import { tool } from "ai";
import { z } from "zod";
import { getSession } from "./store";
import { getSessionHistory } from "./session-manager";
import { buildContextSummary } from "./session-context";

export function createSessionTools(workspacePath: string) {
  return {
    session_status: tool({
      description:
        "Check the current session status — shows recent sessions with their mode, goal, and outcome.",
      inputSchema: z.object({}),
      execute: async () => {
        const history = getSessionHistory(workspacePath, 5);
        if (history.length === 0) return "(no previous sessions found)";
        const lines = history.map(
          (s) =>
            `- [${s.mode}] ${s.lastGoal.slice(0, 80)}${s.lastGoal.length > 80 ? "…" : ""} (${s.status})`
        );
        return `Recent sessions:\n${lines.join("\n")}`;
      },
    }),

    session_history: tool({
      description:
        "Retrieve the full context summary of a previous session so you can resume work. Use the session ID from session_status.",
      inputSchema: z.object({
        session_id: z.string().describe("The session ID to retrieve"),
      }),
      execute: async ({ session_id }) => {
        const session = getSession(session_id);
        if (!session) return `Session not found: ${session_id}`;
        return buildContextSummary(session);
      },
    }),
  };
}
