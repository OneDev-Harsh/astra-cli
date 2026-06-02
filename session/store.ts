import fs from "fs";
import path from "path";
import { getConfigDir } from "../ai/config-loader";

// ── Types ──────────────────────────────────────────────────────────────────

export type SessionMode = "agent" | "ask" | "plan" | "multi";
export type SessionStatus = "active" | "completed" | "interrupted";

export interface SessionEntry {
  id: string;
  workspacePath: string;
  mode: SessionMode;
  status: SessionStatus;
  /** Natural-language summary of what happened in this session. */
  summary: string;
  /** The last user prompt / goal that was provided */
  lastGoal: string;
  /** Key files that were touched (created, modified, read) */
  touchedFiles: string[];
  /** Number of actions that were approved and applied */
  appliedActions: number;
  /** Number of actions that were rejected or discarded */
  rejectedActions: number;
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
const MAX_SESSIONS = 50;
const CURRENT_VERSION = 1;

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

/**
 * Atomic write: write to a temp file, then rename.
 * Prevents corruption if the process crashes mid-write.
 */
function atomicWrite(filePath: string, data: string): void {
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
    parsed.sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return parsed;
  } catch {
    return { version: CURRENT_VERSION, sessions: [], maxSessions: MAX_SESSIONS };
  }
}

function writeIndex(index: SessionStoreIndex): void {
  ensureStoreDir();
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
    sessions = sessions.filter(
      (s) => path.resolve(s.workspacePath) === root
    );
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
  const sessions = listSessions(workspacePath, 1);
  return sessions[0];
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
    touchedFiles: [],
    appliedActions: 0,
    rejectedActions: 0,
    createdAt: now(),
    updatedAt: now(),
    previousSessionId: input.previousSessionId,
  };

  const index = readIndex();
  index.sessions.unshift(entry);
  if (index.sessions.length > MAX_SESSIONS) {
    const removed = index.sessions.splice(MAX_SESSIONS);
    for (const r of removed) {
      try { fs.unlinkSync(path.join(STORE_DIR, `${r.id}.json`)); } catch { /* ignore */ }
    }
  }
  writeIndex(index);
  return entry;
}

export function updateSession(
  id: string,
  patch: Partial<Omit<SessionEntry, "id" | "createdAt">>
): SessionEntry | undefined {
  const index = readIndex();
  const entry = index.sessions.find((s) => s.id === id);
  if (!entry) return undefined;

  Object.assign(entry, patch, { updatedAt: now() });
  writeIndex(index);
  return entry;
}

export function deleteSession(id: string): boolean {
  const index = readIndex();
  const idx = index.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return false;

  index.sessions.splice(idx, 1);
  writeIndex(index);
  try { fs.unlinkSync(path.join(STORE_DIR, `${id}.json`)); } catch { /* ignore */ }
  return true;
}

export function clearAllSessions(): number {
  const index = readIndex();
  const count = index.sessions.length;
  for (const s of index.sessions) {
    try { fs.unlinkSync(path.join(STORE_DIR, `${s.id}.json`)); } catch { /* ignore */ }
  }
  writeIndex({ version: CURRENT_VERSION, sessions: [], maxSessions: MAX_SESSIONS });
  return count;
}
