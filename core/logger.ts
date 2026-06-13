/**
 * Centralised Error Logger
 *
 * Provides a single entry-point for every subsystem to record errors.
 * Anything pushed here is appended to a rotating log file under
 * `~/.astra/logs/` so that post-mortem debugging is possible
 * without needing a terminal capture.
 *
 * Design goals:
 *  • Zero behaviour change — logAndThrow / logAndContinue never swallow
 *    errors; they only *add* a side-effect (the file write).
 *  • Fire-and-forget file I/O — errors in the logger itself are caught
 *    and silently ignored so they can never crash the host.
 *  • Singleton — importing from anywhere returns the same instance.
 *  • No new runtime dependencies.
 */

import fs from "fs";
import path from "path";
import { getConfigDir } from "../ai/config-loader";

// ── Constants ──────────────────────────────────────────────────────────────

const LOG_DIR = path.join(getConfigDir(), "logs");
const LOG_FILE = path.join(LOG_DIR, "astra.log");
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MiB — rotate when exceeded
const MAX_LOG_BACKUPS = 3;              // keep .1, .2, .3

// ── Types ──────────────────────────────────────────────────────────────────

export interface ErrorLogEntry {
  timestamp: string;
  level: "error" | "warn" | "info";
  source: string;                       // subsystem identifier
  message: string;
  stack?: string;
  context?: Record<string, unknown>;    // optional structured data
}

export type ErrorListener = (entry: ErrorLogEntry) => void;

// ── Singleton ──────────────────────────────────────────────────────────────

class ErrorLogger {
  private static instance: ErrorLogger | null = null;

  /** Subscribers that want real-time notification (e.g. a future UI panel). */
  private listeners: ErrorListener[] = [];

  /** In-memory ring buffer of the most recent entries (useful for tests). */
  private buffer: ErrorLogEntry[] = [];
  private readonly bufferSize = 200;

  /** Whether we've already attempted log-dir creation (avoid per-call check). */
  private dirEnsured = false;

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) ErrorLogger.instance = new ErrorLogger();
    return ErrorLogger.instance;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Log an error and re-throw it so the caller's control-flow is unchanged.
   *
   * Usage:
   *   import { logAndThrow } from "../core/logger";
   *   logAndThrow("agent", new Error("fail"), { goal });
   */
  logAndThrow(
    source: string,
    error: Error | unknown,
    context?: Record<string, unknown>,
  ): never {
    this.write("error", source, error, context);
    throw error;
  }

  /**
   * Log an error but do **not** throw — the caller decides what to do.
   *
   * Usage:
   *   import { logAndContinue } from "../core/logger";
   *   logAndContinue("tool-exec", err);
   */
  logAndContinue(
    source: string,
    error: Error | unknown,
    context?: Record<string, unknown>,
  ): void {
    this.write("error", source, error, context);
  }

  /**
   * Log a non-fatal warning.
   */
  warn(
    source: string,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.write("warn", source, message, context);
  }

  /**
   * Log an informational message.
   */
  info(
    source: string,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    this.write("info", source, message, context);
  }

  /**
   * Subscribe to every log entry in real time.
   * Returns an unsubscribe function.
   */
  onError(fn: ErrorListener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /**
   * Return a copy of the in-memory ring buffer.
   */
  getRecentEntries(count = 50): ErrorLogEntry[] {
    return this.buffer.slice(-Math.max(0, count));
  }

  /**
   * Return the absolute path of the active log file.
   */
  getLogFilePath(): string {
    return LOG_FILE;
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private write(
    level: ErrorLogEntry["level"],
    source: string,
    errorOrMessage: Error | unknown,
    context?: Record<string, unknown>,
  ): void {
    const isError = errorOrMessage instanceof Error;
    const entry: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message: isError
        ? (errorOrMessage as Error).message || String(errorOrMessage)
        : String(errorOrMessage),
      stack: isError ? (errorOrMessage as Error).stack : undefined,
      ...(context ? { context } : {}),
    };

    // 1. Ring buffer (always safe)
    this.buffer.push(entry);
    if (this.buffer.length > this.bufferSize) this.buffer.shift();

    // 2. Notify listeners (never let a listener crash the host)
    for (const fn of this.listeners) {
      try { fn(entry); } catch { /* swallow */ }
    }

    // 3. Fire-and-forget file write
    this.rotateIfNeeded();
    const line = JSON.stringify(entry) + "\n";
    try {
      this.ensureDir();
      fs.appendFile(LOG_FILE, line, (err) => {
        if (err) {
          // Silently drop — logging must never crash the application
          // Attempt to log this meta-error to the console in debug mode only
          if (process.env.DEBUG) {
            console.error(`[Logger] Failed to write log: ${err.message}`);
          }
        }
      });
    } catch {
      // Synchronous path rarely hit — swallow for safety
    }
  }

  private ensureDir(): void {
    if (this.dirEnsured) return;
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }
      this.dirEnsured = true;
    } catch {
      this.dirEnsured = false;
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(LOG_FILE)) return;
      const stat = fs.statSync(LOG_FILE);
      if (stat.size < MAX_LOG_BYTES) return;

      // Rotate: astra.log.3 is discarded, .2→.3, .1→.2, .1←astra.log
      for (let i = MAX_LOG_BACKUPS; i >= 1; i--) {
        const from = i === 1 ? LOG_FILE : `${LOG_FILE}.${i - 1}`;
        const to = `${LOG_FILE}.${i}`;
        if (fs.existsSync(from)) {
          try { if (fs.existsSync(to)) fs.unlinkSync(to); } catch { /* ignore */ }
          try { fs.renameSync(from, to); } catch { /* ignore */ }
        }
      }
    } catch {
      // Rotation failure is non-fatal
    }
  }
}

export const errorLogger = ErrorLogger.getInstance();

// ── Convenience re-exports (most call sites only need these) ──────────────

export const logAndThrow = (
  source: string,
  error: Error | unknown,
  context?: Record<string, unknown>,
): never => errorLogger.logAndThrow(source, error, context);

export const logAndContinue = (
  source: string,
  error: Error | unknown,
  context?: Record<string, unknown>,
): void => errorLogger.logAndContinue(source, error, context);

export const logWarn = (
  source: string,
  message: string,
  context?: Record<string, unknown>,
): void => errorLogger.warn(source, message, context);

export const logInfo = (
  source: string,
  message: string,
  context?: Record<string, unknown>,
): void => errorLogger.info(source, message, context);
