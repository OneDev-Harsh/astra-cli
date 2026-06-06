import fs from "fs";
import path from "path";
import { getConfigDir } from "../ai/config-loader";
import type { ActionLog } from "../modes/agent/types";

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

// ── Index Operations ───────────────────────────────────────────────────────

function readIndex(): SessionStoreIndex {
  if (!fs.existsSync(INDEX_FILE)) {
    return { version: CURRENT_VERSION, sessions: [], maxSessions: MAX_SESSIONS };
  }
  try {
    const raw = fs.readFileSync(INDEX_FILE, "utf8");
    const parsed = JSON.parse(raw) as SessionStoreIndex;
    // Back-compat: fill missing fields from older entries
    for (const s of parsed.sessions) {
      s.allGoals ??= [s.lastGoal];
      s.transcript ??= [];
      s.pendingTasks ??= [];
      s.lastAgentResponse ??= "";
    }
    parsed.sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return parsed;
  } catch {
    return { version: CURRENT_VERSION, sessions: [], maxSessions: MAX_SESSIONS };
  }
}

function writeIndex(index: SessionStoreIndex): void {
  atomicWrite(INDEX_FILE, JSON.stringify(index, null, 2));
}

// ── Public API ─────────────────────────────────────────────────────────────

export function listSessions(
  workspacePath?: string,
  limit = 20
): SessionEntry[] {
  const index = readIndex();
  let sessions = index.sessions;
  if (workspacePath) {
    const root = path.resolve(workspacePath);
    sessions = sessions.filter((s) => path.resolve(s.workspacePath) === root);
  }
  return sessions.slice(0, limit);
}

export function getSession(id: string): SessionEntry | undefined {
  const index = readIndex();
  return index.sessions.find((s) => s.id === id);
}

export function getMostRecentSession(
  workspacePath?: string
): SessionEntry | undefined {
  return listSessions(workspacePath, 1)[0];
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

  const index = readIndex();
  index.sessions.unshift(entry);
  if (index.sessions.length > MAX_SESSIONS) {
    const removed = index.sessions.splice(MAX_SESSIONS);
    for (const r of removed) {
      try {
        fs.unlinkSync(path.join(STORE_DIR, `${r.id}.json`));
      } catch {
        /* ignore */
      }
    }
  }
  writeIndex(index);
  return entry;
}

export function updateSession(
  id: string,
  patch: Partial<Omit<SessionEntry, "id" | "createdAt">>,
  actions?: readonly ActionLog[]
): SessionEntry | undefined {
  const index = readIndex();
  const entry = index.sessions.find((s) => s.id === id);
  if (!entry) return undefined;

  // Merge transcript carefully: cap at TRANSCRIPT_CAP
  if (patch.transcript) {
    const merged = [...entry.transcript, ...patch.transcript];
    patch.transcript = merged.slice(-TRANSCRIPT_CAP);
  }

  // Merge allGoals without duplicates
  if (patch.lastGoal && !entry.allGoals.includes(patch.lastGoal)) {
    patch.allGoals = [...entry.allGoals, patch.lastGoal];
  }

  Object.assign(entry, patch, { updatedAt: now() });
  writeIndex(index);

  if (actions) {
    const historyFile = path.join(STORE_DIR, `${id}.json`);
    atomicWrite(historyFile, JSON.stringify(actions, null, 2));
  }

  return entry;
}

/**
 * Append transcript messages to an active session without a full patch.
 * More efficient for high-frequency updates during a live session.
 */
export function appendTranscript(
  id: string,
  messages: TranscriptMessage[]
): void {
  const index = readIndex();
  const entry = index.sessions.find((s) => s.id === id);
  if (!entry) return;
  entry.transcript.push(...messages);
  if (entry.transcript.length > TRANSCRIPT_CAP) {
    entry.transcript = entry.transcript.slice(-TRANSCRIPT_CAP);
  }
  entry.updatedAt = now();
  writeIndex(index);
}

export function deleteSession(id: string): boolean {
  const index = readIndex();
  const idx = index.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  index.sessions.splice(idx, 1);
  writeIndex(index);
  try {
    fs.unlinkSync(path.join(STORE_DIR, `${id}.json`));
  } catch {
    /* ignore */
  }
  return true;
}

export function clearAllSessions(): number {
  const index = readIndex();
  const count = index.sessions.length;
  for (const s of index.sessions) {
    try {
      fs.unlinkSync(path.join(STORE_DIR, `${s.id}.json`));
    } catch {
      /* ignore */
    }
  }
  writeIndex({ version: CURRENT_VERSION, sessions: [], maxSessions: MAX_SESSIONS });
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