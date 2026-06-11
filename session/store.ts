import fs from "fs";
import path from "path";
import { getConfigDir } from "../ai/config-loader";
import type { ActionLog } from "../modes/agent/types";
import { getSessionStoreCache, resetSessionStoreCache } from "./session-cache";

// ── Types ──────────────────────────────────────────────────────────────────

export type SessionMode = "agent" | "ask" | "plan" | "multi" | "auto";
export type SessionStatus = "active" | "completed" | "interrupted";

export interface TranscriptMessage {
  role: "user" | "agent" | "system";
  content: string;
  timestamp: string;
}

export interface SessionEntry {
  id: string;
  workspacePath: string;
  mode: SessionMode;
  status: SessionStatus;
  /** Natural-language summary of what happened in this session. */
  summary: string;
  /** The last user prompt / goal that was provided */
  lastGoal: string;
  /** All user goals across the session (for multi-turn awareness) */
  allGoals: string[];
  /** Key files that were touched (created, modified, read) */
  touchedFiles: string[];
  /** Number of actions that were approved and applied */
  appliedActions: number;
  /** Number of actions that were rejected or discarded */
  rejectedActions: number;
  /**
   * The full conversation transcript for this session.
   * Stored inline so context reconstruction doesn't need a separate file read.
   * Capped at TRANSCRIPT_CAP messages (oldest trimmed first).
   */
  transcript: TranscriptMessage[];
  /**
   * Tasks/sub-goals the agent identified but didn't complete.
   * Enables "pick up where we left off" without re-analysing the transcript.
   */
  pendingTasks: string[];
  /**
   * The agent's final message verbatim (truncated to 2 000 chars).
   * Useful for one-shot context injection without loading the full transcript.
   */
  lastAgentResponse: string;
  /** ISO-8601 timestamps */
  createdAt: string;
  updatedAt: string;
  /** Previous session ID for chaining */
  previousSessionId?: string;
}

export interface SessionStoreIndex {
  version: number;
  sessions: SessionEntry[];
  maxSessions: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STORE_DIR = path.join(getConfigDir(), "sessions");
const INDEX_FILE = path.join(STORE_DIR, "index.json");
const MAX_SESSIONS = 100;
const TRANSCRIPT_CAP = 60; // max messages kept inline
const CURRENT_VERSION = 2;

// ── Helpers ────────────────────────────────────────────────────────────────

function ensureStoreDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function generateSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `sess_${ts}_${rand}`;
}

function now(): string {
  return new Date().toISOString();
}

function atomicWrite(filePath: string, data: string): void {
  ensureStoreDir();
  const tmp = `${filePath}.tmp_${process.pid}_${Date.now()}`;
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, filePath);
}

// ── Cache Access ───────────────────────────────────────────────────────────

/** Get the singleton cache instance for the session store. */
function cache() {
  return getSessionStoreCache(INDEX_FILE);
}

// ── Public API ─────────────────────────────────────────────────────────────
// All functions maintain the exact same signatures as before.
// The cache layer is transparent to callers.

export function listSessions(
  workspacePath?: string,
  limit = 20
): SessionEntry[] {
  return cache().listEntries(workspacePath, limit);
}

export function getSession(id: string): SessionEntry | undefined {
  return cache().getEntry(id);
}

export function getMostRecentSession(
  workspacePath?: string
): SessionEntry | undefined {
  return cache().getMostRecent(workspacePath);
}

export function createSession(input: {
  workspacePath: string;
  mode: SessionMode;
  goal: string;
  previousSessionId?: string;
}): SessionEntry {
  const entry: SessionEntry = {
    id: generateSessionId(),
    workspacePath: path.resolve(input.workspacePath),
    mode: input.mode,
    status: "active",
    summary: "",
    lastGoal: input.goal,
    allGoals: [input.goal],
    touchedFiles: [],
    appliedActions: 0,
    rejectedActions: 0,
    transcript: [],
    pendingTasks: [],
    lastAgentResponse: "",
    createdAt: now(),
    updatedAt: now(),
    previousSessionId: input.previousSessionId,
  };

  // Use cache for the write path
  const c = cache();
  c.addEntry(entry);

  // Enforce MAX_SESSIONS limit
  const index = c.getIndex();
  if (index.sessions.length > MAX_SESSIONS) {
    const removed = index.sessions.splice(MAX_SESSIONS);
    for (const r of removed) {
      try {
        fs.unlinkSync(path.join(STORE_DIR, `${r.id}.json`));
      } catch {
        /* ignore */
      }
    }
    // Mark dirty again since we modified
    (c as any).markDirty();
  }

  return entry;
}

export function updateSession(
  id: string,
  patch: Partial<Omit<SessionEntry, "id" | "createdAt">>,
  actions?: readonly ActionLog[]
): SessionEntry | undefined {
  const c = cache();
  const entry = c.getEntry(id);
  if (!entry) return undefined;

  // Merge transcript carefully: cap at TRANSCRIPT_CAP
  if (patch.transcript) {
    const merged = [...entry.transcript, ...patch.transcript];
    patch = { ...patch, transcript: merged.slice(-TRANSCRIPT_CAP) };
  }

  // Merge allGoals without duplicates
  if (patch.lastGoal && !entry.allGoals.includes(patch.lastGoal)) {
    patch = { ...patch, allGoals: [...entry.allGoals, patch.lastGoal] };
  }

  // Apply the patch
  Object.assign(entry, patch, { updatedAt: now() });
  c.updateEntry(id, {}); // mark dirty

  if (actions) {
    const historyFile = path.join(STORE_DIR, `${id}.json`);
    atomicWrite(historyFile, JSON.stringify(actions, null, 2));
  }

  return entry;
}

/**
 * Append transcript messages to an active session without a full patch.
 * More efficient for high-frequency updates during a live session.
 * Uses the cache's optimized append path with debounced disk writes.
 */
export function appendTranscript(
  id: string,
  messages: TranscriptMessage[]
): void {
  cache().appendTranscript(id, messages);
}

export function deleteSession(id: string): boolean {
  const c = cache();
  const result = c.removeEntry(id);
  try {
    fs.unlinkSync(path.join(STORE_DIR, `${id}.json`));
  } catch {
    /* ignore */
  }
  return result;
}

export function clearAllSessions(): number {
  const c = cache();
  const index = c.getIndex();
  const count = index.sessions.length;
  for (const s of index.sessions) {
    try {
      fs.unlinkSync(path.join(STORE_DIR, `${s.id}.json`));
    } catch {
      /* ignore */
    }
  }
  // Reset the cache entirely
  c.invalidate();
  const fresh: SessionStoreIndex = { version: CURRENT_VERSION, sessions: [], maxSessions: MAX_SESSIONS };
  atomicWrite(INDEX_FILE, JSON.stringify(fresh, null, 2));
  return count;
}

export function readSessionActions(id: string): ActionLog[] {
  const historyFile = path.join(STORE_DIR, `${id}.json`);
  if (!fs.existsSync(historyFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(historyFile, "utf8"));
  } catch {
    return [];
  }
}

/**
 * Flush all pending session writes to disk immediately.
 * Called during graceful shutdown to ensure no data loss.
 */
export function flushSessionStore(): void {
  cache().flushSync();
}

/**
 * Reset the session store cache singleton.
 * Exposed for testing purposes.
 */
export function _resetSessionStoreCache(): void {
  resetSessionStoreCache();
}
