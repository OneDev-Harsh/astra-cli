/**
 * Session Store Cache Layer
 *
 * In-memory caching with proper LRU, statistics, search scoring, and pruning.
 * All existing public APIs are preserved.
 */

import fs from "fs";
import path from "path";
import type { SessionStoreIndex, SessionEntry } from "./store";

export interface CacheOptions {
  flushDebounceMs?: number;
  entryCacheSize?: number;
}

interface CachedIndex {
  index: SessionStoreIndex;
  dirty: boolean;
  lastFlush: number;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  entryCacheSize: number;
  dirtyEntries: number;
  flushes: number;
}

class LRUMap<V> {
  private map = new Map<string, V>();
  private order: string[] = [];
  constructor(private capacity: number) {}
  get size(): number { return this.map.size; }
  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) this.touch(key);
    return v;
  }
  set(key: string, value: V): string | undefined {
    let evicted: string | undefined;
    if (!this.map.has(key) && this.map.size >= this.capacity) {
      evicted = this.order.shift();
      if (evicted !== undefined) this.map.delete(evicted);
    }
    this.map.set(key, value);
    this.touch(key);
    return evicted;
  }
  delete(key: string): boolean {
    const existed = this.map.delete(key);
    if (existed) { const i = this.order.indexOf(key); if (i !== -1) this.order.splice(i, 1); }
    return existed;
  }
  has(key: string): boolean { return this.map.has(key); }
  clear(): void { this.map.clear(); this.order = []; }
  values(): IterableIterator<V> { return this.map.values(); }
  private touch(key: string): void {
    const i = this.order.indexOf(key);
    if (i !== -1) this.order.splice(i, 1);
    this.order.push(key);
  }
}

class SessionStoreCache {
  private cache: CachedIndex | null = null;
  private indexFile: string;
  private flushDebounceMs: number;
  private entryCacheSize: number;
  private entryCache: LRUMap<SessionEntry>;
  private dirtyEntries = new Set<string>();
  private _hits = 0; private _misses = 0; private _evictions = 0; private _flushes = 0;

  constructor(indexFile: string, options: CacheOptions = {}) {
    this.indexFile = indexFile;
    this.flushDebounceMs = options.flushDebounceMs ?? 500;
    this.entryCacheSize = options.entryCacheSize ?? 50;
    this.entryCache = new LRUMap<SessionEntry>(this.entryCacheSize);
  }

  get stats(): CacheStats { return { hits: this._hits, misses: this._misses, evictions: this._evictions, entryCacheSize: this.entryCache.size, dirtyEntries: this.dirtyEntries.size, flushes: this._flushes }; }
  resetStats(): void { this._hits = 0; this._misses = 0; this._evictions = 0; this._flushes = 0; }

  getIndex(): SessionStoreIndex { if (this.cache) return this.cache.index; return this.loadFromDisk(); }

  private loadFromDisk(): SessionStoreIndex {
    if (!fs.existsSync(this.indexFile)) {
      const fresh: SessionStoreIndex = { version: 2, sessions: [], maxSessions: 100 };
      this.cache = { index: fresh, dirty: false, lastFlush: Date.now(), flushTimer: null };
      return fresh;
    }
    try {
      const raw = fs.readFileSync(this.indexFile, "utf8");
      const parsed = JSON.parse(raw) as SessionStoreIndex;
      for (const s of parsed.sessions) {
        s.allGoals ??= [s.lastGoal]; s.transcript ??= []; s.pendingTasks ??= []; s.lastAgentResponse ??= "";
        s.tags ??= []; s.labels ??= {}; s.branchRootId ??= undefined; s.branchedFrom ??= undefined;
        s.childSessionIds ??= []; s.compactionCount ??= 0; s.totalTokens ??= 0;
      }
      parsed.sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      this.entryCache.clear();
      for (const s of parsed.sessions) { const ev = this.entryCache.set(s.id, s); if (ev !== undefined) this._evictions++; }
      this.cache = { index: parsed, dirty: false, lastFlush: Date.now(), flushTimer: null };
      return parsed;
    } catch {
      const fresh: SessionStoreIndex = { version: 2, sessions: [], maxSessions: 100 };
      this.cache = { index: fresh, dirty: false, lastFlush: Date.now(), flushTimer: null };
      return fresh;
    }
  }

  markDirty(): void { if (!this.cache) return; this.cache.dirty = true; this.scheduleFlush(); }
  flushSync(): void {
    if (!this.cache || !this.cache.dirty) return;
    if (this.cache.flushTimer) { clearTimeout(this.cache.flushTimer); this.cache.flushTimer = null; }
    this.writeIndex(this.cache.index); this.cache.dirty = false; this.cache.lastFlush = Date.now(); this._flushes++;
  }
  private scheduleFlush(): void { if (!this.cache) return; if (this.cache.flushTimer) clearTimeout(this.cache.flushTimer); this.cache.flushTimer = setTimeout(() => this.flushSync(), this.flushDebounceMs); }
  private writeIndex(index: SessionStoreIndex): void {
    const dir = path.dirname(this.indexFile); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.indexFile}.tmp_${process.pid}_${Date.now()}`; fs.writeFileSync(tmp, JSON.stringify(index, null, 2), "utf8"); fs.renameSync(tmp, this.indexFile);
  }

  getEntry(id: string): SessionEntry | undefined {
    const cached = this.entryCache.get(id); if (cached) { this._hits++; return cached; }
    const index = this.getIndex(); const entry = index.sessions.find((s) => s.id === id);
    if (entry) { this._misses++; this.entryCache.set(id, entry); } return entry;
  }
  updateEntry(id: string, patch: Partial<SessionEntry>): SessionEntry | undefined {
    const index = this.getIndex(); const entry = index.sessions.find((s) => s.id === id);
    if (!entry) return undefined; Object.assign(entry, patch); this.entryCache.set(id, entry); this.dirtyEntries.add(id); this.markDirty(); return entry;
  }
  addEntry(entry: SessionEntry): void { const index = this.getIndex(); index.sessions.unshift(entry); this.entryCache.set(entry.id, entry); this.dirtyEntries.add(entry.id); this.markDirty(); }
  removeEntry(id: string): boolean {
    const index = this.getIndex(); const idx = index.sessions.findIndex((s) => s.id === id);
    if (idx === -1) return false; index.sessions.splice(idx, 1); this.entryCache.delete(id); this.dirtyEntries.delete(id); this.markDirty(); return true;
  }
  appendTranscript(id: string, messages: SessionEntry["transcript"]): void {
    const entry = this.getEntry(id); if (!entry) return;
    entry.transcript.push(...messages);
    const CAP = 60; if (entry.transcript.length > CAP) entry.transcript = entry.transcript.slice(-CAP);
    entry.updatedAt = new Date().toISOString();
    this.entryCache.set(id, entry); this.dirtyEntries.add(id); this.markDirty();
  }
  listEntries(workspacePath?: string, limit = 20): SessionEntry[] {
    const index = this.getIndex(); let sessions = index.sessions;
    if (workspacePath) { const root = path.resolve(workspacePath); sessions = sessions.filter((s) => path.resolve(s.workspacePath) === root); }
    return sessions.slice(0, limit);
  }
  getMostRecent(workspacePath?: string): SessionEntry | undefined { return this.listEntries(workspacePath, 1)[0]; }

  searchEntries(query: string, opts: { workspacePath?: string; limit?: number; mode?: string; status?: string; tags?: string[]; since?: string; until?: string } = {}): { entry: SessionEntry; score: number }[] {
    const { workspacePath, limit = 10, mode, status, tags, since, until } = opts;
    const index = this.getIndex(); let sessions = [...index.sessions];
    if (workspacePath) { const root = path.resolve(workspacePath); sessions = sessions.filter((s) => path.resolve(s.workspacePath) === root); }
    if (mode) sessions = sessions.filter((s) => s.mode === mode);
    if (status) sessions = sessions.filter((s) => s.status === status);
    if (tags && tags.length > 0) sessions = sessions.filter((s) => tags.some((t) => s.tags?.map((st) => st.toLowerCase()).includes(t.toLowerCase())));
    if (since) { const ms = new Date(since).getTime(); sessions = sessions.filter((s) => new Date(s.updatedAt).getTime() >= ms); }
    if (until) { const ms = new Date(until).getTime(); sessions = sessions.filter((s) => new Date(s.updatedAt).getTime() <= ms); }
    const q = query.toLowerCase().trim(); const tokens = q.split(/\W+/).filter((w) => w.length > 2);
    const scored: { entry: SessionEntry; score: number }[] = [];
    for (const entry of sessions) { const score = _scoreEntry(entry, q, tokens); if (score > 0) scored.push({ entry, score }); }
    scored.sort((a, b) => { if (b.score !== a.score) return b.score - a.score; return new Date(b.entry.updatedAt).getTime() - new Date(a.entry.updatedAt).getTime(); });
    return scored.slice(0, limit);
  }

  prune(maxSessions: number): string[] {
    const index = this.getIndex(); if (index.sessions.length <= maxSessions) return [];
    const removed = index.sessions.splice(maxSessions); const ids: string[] = [];
    for (const r of removed) { ids.push(r.id); this.entryCache.delete(r.id); this.dirtyEntries.delete(r.id); try { fs.unlinkSync(path.join(path.dirname(this.indexFile), `${r.id}.json`)); } catch { /* ignore */ } }
    this.markDirty(); return ids;
  }
  invalidate(): void { if (this.cache?.flushTimer) clearTimeout(this.cache.flushTimer); this.cache = null; this.entryCache.clear(); this.dirtyEntries.clear(); }
}

function _scoreEntry(entry: SessionEntry, q: string, tokens: string[]): number {
  let score = 0;
  const goal = entry.lastGoal.toLowerCase(); const summary = (entry.summary ?? "").toLowerCase();
  if (goal.includes(q)) score += 50; if (summary.includes(q)) score += 30;
  for (const t of tokens) {
    if (goal.includes(t)) score += 20; if (summary.includes(t)) score += 10;
    if (entry.tags?.some((tag) => tag.toLowerCase().includes(t) || t.includes(tag.toLowerCase()))) score += 25;
    if (entry.touchedFiles.some((f) => f.toLowerCase().includes(t) || t.includes(f.toLowerCase()))) score += 8;
    for (const g of entry.allGoals ?? []) { if (g.toLowerCase().includes(t)) score += 5; }
  }
  const ageDays = (Date.now() - new Date(entry.updatedAt).getTime()) / 86400000;
  if (ageDays < 1) score += 10; else if (ageDays < 7) score += 5; else if (ageDays < 30) score += 2;
  return score;
}

let _instance: SessionStoreCache | null = null;
export function getSessionStoreCache(indexFile: string, options?: CacheOptions): SessionStoreCache {
  if (!_instance) _instance = new SessionStoreCache(indexFile, options); return _instance;
}
/** Enhanced cache — LRU eviction, statistics, search scoring, pruning. */
export function resetSessionStoreCache(): void { if (_instance) { _instance.flushSync(); _instance = null; } }
