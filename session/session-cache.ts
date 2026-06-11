/**
 * Session Store Cache Layer
 *
 * Provides in-memory caching for the session store to avoid redundant
 * JSON parse/write operations on every session read/write call.
 *
 * The cache maintains a dirty flag so that:
 * - Reads are served from memory (no file I/O) when clean
 * - Writes batch the index serialization (no repeated stringify)
 * - The index is only flushed to disk when dirty
 */

import fs from "fs";
import path from "path";
import type { SessionStoreIndex, SessionEntry } from "./store";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CacheOptions {
  /** Debounce interval in ms for flushing dirty index to disk. Default: 500ms */
  flushDebounceMs?: number;
  /** Maximum number of entries to keep in the LRU transcript cache. Default: 50 */
  transcriptCacheSize?: number;
}

interface CachedIndex {
  index: SessionStoreIndex;
  dirty: boolean;
  lastFlush: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

// ── Cache Implementation ────────────────────────────────────────────────────

class SessionStoreCache {
  private cache: CachedIndex | null = null;
  private indexFile: string;
  private flushDebounceMs: number;
  private transcriptCacheSize: number;

  /** LRU cache for individual session entries (by ID) */
  private entryCache = new Map<string, SessionEntry>();

  /** Track which entries have been mutated but not yet persisted */
  private dirtyEntries = new Set<string>();

  constructor(indexFile: string, options: CacheOptions = {}) {
    this.indexFile = indexFile;
    this.flushDebounceMs = options.flushDebounceMs ?? 500;
    this.transcriptCacheSize = options.transcriptCacheSize ?? 50;
  }

  // ── Index Operations ─────────────────────────────────────────────────────

  /**
   * Get the cached index, loading from disk if not already cached.
   * Subsequent calls return the in-memory copy (no file I/O).
   */
  getIndex(): SessionStoreIndex {
    if (this.cache) return this.cache.index;
    return this.loadFromDisk();
  }

  /**
   * Load the index from disk and populate the cache.
   */
  private loadFromDisk(): SessionStoreIndex {
    if (!fs.existsSync(this.indexFile)) {
      const fresh: SessionStoreIndex = {
        version: 2,
        sessions: [],
        maxSessions: 100,
      };
      this.cache = { index: fresh, dirty: false, lastFlush: Date.now(), flushTimer: null };
      return fresh;
    }

    try {
      const raw = fs.readFileSync(this.indexFile, "utf8");
      const parsed = JSON.parse(raw) as SessionStoreIndex;

      // Back-compat: fill missing fields
      for (const s of parsed.sessions) {
        s.allGoals ??= [s.lastGoal];
        s.transcript ??= [];
        s.pendingTasks ??= [];
        s.lastAgentResponse ??= "";
      }

      // Sort by updatedAt descending
      parsed.sessions.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      // Populate entry cache
      this.entryCache.clear();
      for (const s of parsed.sessions) {
        this.entryCache.set(s.id, s);
      }

      this.cache = { index: parsed, dirty: false, lastFlush: Date.now(), flushTimer: null };
      return parsed;
    } catch {
      const fresh: SessionStoreIndex = {
        version: 2,
        sessions: [],
        maxSessions: 100,
      };
      this.cache = { index: fresh, dirty: false, lastFlush: Date.now(), flushTimer: null };
      return fresh;
    }
  }

  /**
   * Mark the index as dirty and schedule a debounced flush to disk.
   */
  markDirty(): void {
    if (!this.cache) return;
    this.cache.dirty = true;
    this.scheduleFlush();
  }

  /**
   * Immediately flush the index to disk (synchronous).
   * Use this for critical shutdown paths.
   */
  flushSync(): void {
    if (!this.cache || !this.cache.dirty) return;

    if (this.cache.flushTimer) {
      clearTimeout(this.cache.flushTimer);
      this.cache.flushTimer = null;
    }

    this.writeIndex(this.cache.index);
    this.cache.dirty = false;
    this.cache.lastFlush = Date.now();
    this.dirtyEntries.clear();
  }

  /**
   * Schedule a debounced flush. Multiple rapid writes are batched.
   */
  private scheduleFlush(): void {
    if (!this.cache) return;

    // If a flush is already scheduled, extend the debounce window
    if (this.cache.flushTimer) {
      clearTimeout(this.cache.flushTimer);
    }

    this.cache.flushTimer = setTimeout(() => {
      this.flushSync();
    }, this.flushDebounceMs);
  }

  /**
   * Write the index to disk atomically.
   */
  private writeIndex(index: SessionStoreIndex): void {
    const dir = path.dirname(this.indexFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.indexFile}.tmp_${process.pid}_${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(index, null, 2), "utf8");
    fs.renameSync(tmp, this.indexFile);
  }

  // ── Entry Operations ─────────────────────────────────────────────────────

  /**
   * Get a session entry by ID from the cache (no file I/O).
   */
  getEntry(id: string): SessionEntry | undefined {
    // Check entry cache first
    const cached = this.entryCache.get(id);
    if (cached) return cached;

    // Fall back to index scan (still in-memory)
    const index = this.getIndex();
    const entry = index.sessions.find((s) => s.id === id);
    if (entry) {
      this.entryCache.set(id, entry);
    }
    return entry;
  }

  /**
   * Update an entry in the cache and mark dirty.
   */
  updateEntry(id: string, patch: Partial<SessionEntry>): SessionEntry | undefined {
    const index = this.getIndex();
    const entry = index.sessions.find((s) => s.id === id);
    if (!entry) return undefined;

    Object.assign(entry, patch);
    this.entryCache.set(id, entry);
    this.dirtyEntries.add(id);
    this.markDirty();
    return entry;
  }

  /**
   * Add a new entry to the cache.
   */
  addEntry(entry: SessionEntry): void {
    const index = this.getIndex();
    index.sessions.unshift(entry);
    this.entryCache.set(entry.id, entry);
    this.markDirty();
  }

  /**
   * Remove an entry from the cache.
   */
  removeEntry(id: string): boolean {
    const index = this.getIndex();
    const idx = index.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    index.sessions.splice(idx, 1);
    this.entryCache.delete(id);
    this.dirtyEntries.delete(id);
    this.markDirty();
    return true;
  }

  /**
   * Append transcript messages to an entry in the cache.
   * This is the hot path during live sessions — avoids full index rewrite.
   */
  appendTranscript(id: string, messages: SessionEntry["transcript"]): void {
    const entry = this.getEntry(id);
    if (!entry) return;

    entry.transcript.push(...messages);
    // Cap at 60 messages
    const TRANSCRIPT_CAP = 60;
    if (entry.transcript.length > TRANSCRIPT_CAP) {
      entry.transcript = entry.transcript.slice(-TRANSCRIPT_CAP);
    }
    entry.updatedAt = new Date().toISOString();

    this.entryCache.set(id, entry);
    this.dirtyEntries.add(id);
    this.markDirty();
  }

  /**
   * Get all sessions, optionally filtered by workspace path.
   * Served from cache — no file I/O.
   */
  listEntries(workspacePath?: string, limit = 20): SessionEntry[] {
    const index = this.getIndex();
    let sessions = index.sessions;
    if (workspacePath) {
      const root = path.resolve(workspacePath);
      sessions = sessions.filter((s) => path.resolve(s.workspacePath) === root);
    }
    return sessions.slice(0, limit);
  }

  /**
   * Get the most recent session for a workspace.
   */
  getMostRecent(workspacePath?: string): SessionEntry | undefined {
    return this.listEntries(workspacePath, 1)[0];
  }

  /**
   * Invalidate the entire cache (e.g., for testing or external modifications).
   */
  invalidate(): void {
    if (this.cache?.flushTimer) {
      clearTimeout(this.cache.flushTimer);
    }
    this.cache = null;
    this.entryCache.clear();
    this.dirtyEntries.clear();
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

let _instance: SessionStoreCache | null = null;

export function getSessionStoreCache(indexFile: string, options?: CacheOptions): SessionStoreCache {
  if (!_instance) {
    _instance = new SessionStoreCache(indexFile, options);
  }
  return _instance;
}

/** Reset the singleton (for testing). */
export function resetSessionStoreCache(): void {
  if (_instance) {
    _instance.flushSync();
    _instance = null;
  }
}
