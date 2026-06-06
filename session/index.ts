// ── Store (raw persistence layer) ─────────────────────────────────────────
export {
  listSessions,
  getSession,
  getMostRecentSession,
  createSession,
  updateSession,
  deleteSession,
  clearAllSessions,
  appendTranscript,
  readSessionActions,
} from "./store";
export type {
  SessionMode,
  SessionStatus,
  SessionEntry,
  TranscriptMessage,
  SessionStoreIndex,
} from "./store";

// ── Context building ───────────────────────────────────────────────────────
export {
  captureSessionContext,
  buildContextSummary,
  buildSessionOneliner,
} from "./session-context";
export type { SessionContextData } from "./session-context";

// ── Session lifecycle ──────────────────────────────────────────────────────
export {
  beginSession,
  endSession,
  endMultiSession,
  markSessionInterrupted,
  recordUserMessage,
  recordAgentMessage,
  getResumableSession,
  getSessionHistory,
  removeSession,
  formatSessionLine,
} from "./session-manager";
export type { BeginSessionResult } from "./session-manager";

// ── Agent tools ────────────────────────────────────────────────────────────
export { createSessionTools } from "./session-tools";