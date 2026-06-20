import fs, { existsSync, readFileSync } from "fs";
import path from "path";
import { homedir } from "os";
import { spawnSync, spawn } from "child_process";
import type { AgentConfig, ActionLog } from "./types";
import { ActionTracker } from "./action-tracker";
import { ActionHistoryManager } from "../../session/action-history";
import { getMostRecentSession } from "../../session/store";

const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx",
  ".css", ".html", ".yml", ".yaml", ".toml", ".txt", ".sql", ".graphql",
  ".gql", ".sh", ".bash", ".zsh", ".py", ".go", ".rs", ".java", ".kt",
  ".swift", ".php", ".rb", ".vue", ".svelte", ".xml", ".ini", ".conf",
  ".dockerfile", ".env.example", ".gitignore", ".editorconfig", ".prettierrc",
  ".eslintrc", ".lock",
]);

function isProbablyTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXT.has(ext) || ext === "";
}

// ── Package.json cache (shared across all executors in same workspace) ─────

interface CachedPkg {
  mtime: number;
  data: {
    scripts: Record<string, string>;
    dependencies: string[];
    devDependencies: string[];
    testRunner: "npm test" | "npx vitest run" | "npx jest";
    lintCmd: string;
    fmtCmd: string;
  };
}

const _pkgCache = new Map<string, CachedPkg>();

/**
 * Read and cache package.json for the workspace.
 * Cache is invalidated when the file's mtime changes.
 */
function getCachedPkg(basePath: string): CachedPkg | null {
  const pkgPath = path.join(basePath, "package.json");
  if (!existsSync(pkgPath)) return null;

  const stat = fs.statSync(pkgPath);
  const cached = _pkgCache.get(basePath);
  if (cached && cached.mtime === stat.mtimeMs) return cached;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const result: CachedPkg = {
      mtime: stat.mtimeMs,
      data: {
        scripts: pkg.scripts ?? {},
        dependencies: Object.keys(pkg.dependencies ?? {}),
        devDependencies: Object.keys(pkg.devDependencies ?? {}),
        testRunner: pkg.scripts?.test
          ? "npm test"
          : pkg.devDependencies?.vitest || pkg.dependencies?.vitest
            ? "npx vitest run"
            : "npx jest",
        lintCmd: pkg.scripts?.lint ? "npm run lint" : "npx eslint .",
        fmtCmd: pkg.scripts?.format ? "npm run format" : "npx prettier --write .",
      },
    };
    _pkgCache.set(basePath, result);
    return result;
  } catch {
    return null;
  }
}

// ── File content cache (per-executor, bounded) ─────────────────────────────

interface FileCacheEntry {
  mtime: number;
  size: number;
  content: string;
}

/**
 * Bounded file content cache to avoid re-reading the same files
 * during a single agent session. Uses mtime + size for invalidation.
 */
class FileContentCache {
  private cache = new Map<string, FileCacheEntry>();
  private maxSize: number;

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  get(absPath: string): string | undefined {
    const entry = this.cache.get(absPath);
    if (!entry) return undefined;

    // Validate with stat
    try {
      const stat = fs.statSync(absPath);
      if (stat.mtimeMs === entry.mtime && stat.size === entry.size) {
        return entry.content;
      }
    } catch {
      // File deleted or inaccessible
    }

    // Invalid — remove
    this.cache.delete(absPath);
    return undefined;
  }

  set(absPath: string, content: string): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    try {
      const stat = fs.statSync(absPath);
      this.cache.set(absPath, { mtime: stat.mtimeMs, size: stat.size, content });
    } catch {
      // Don't cache if we can't stat
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// ── ToolExecutor ────────────────────────────────────────────────────────────

export class ToolExecutor {
  private overlay = new Map<string, string>();
  private deleted = new Set<string>();
  private appliedActionIds = new Set<string>();
  private readonly norm = (rel: string) =>
    path.posix.normalize(rel.split(path.sep).join("/")).replace(/^\.\//, "");
  private readonly fileCache: FileContentCache;

  constructor(
    private readonly tracker: ActionTracker,
    private readonly config: AgentConfig
  ) {
    this.fileCache = new FileContentCache(200);
  }

  /**
   * Resolves a relative path against the codebase root and performs strict
   * validation checks against directory traversal vulnerabilities.
   */
  private resolveSafe(rel: string): string {
    if (rel.includes("..") && rel.split(/[/\\]/).includes("..")) {
      throw new Error(`Path traversal attempt detected via segment navigation: ${rel}`);
    }
    const root = path.resolve(this.config.codebasePath);
    const abs = path.resolve(root, rel);
    const relCheck = path.relative(root, abs);
    if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
      throw new Error(`Security Exception: Path is outside the designated workspace: ${rel}`);
    }
    return abs;
  }

  /**
   * Hydrates the memory maps and execution sets using an external array of action logs.
   */
  hydrateFromActions(actions: ActionLog[]): void {
    this.overlay.clear();
    this.deleted.clear();
    this.appliedActionIds.clear();
    this.fileCache.clear();

    const sortedActions = [...actions].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    for (const action of sortedActions) {
      const key = this.norm(action.path);
      if (action.status === "executed") {
        this.appliedActionIds.add(action.id);
      }
      if (action.status === "pending" || action.status === "approved") {
        if (action.type === "file_create" || action.type === "file_modify") {
          if (action.details.after !== undefined) {
            this.deleted.delete(key);
            this.overlay.set(key, action.details.after);
          }
        } else if (action.type === "file_delete") {
          this.overlay.delete(key);
          this.deleted.add(key);
        }
      }
    }
  }

  private excluded(relPath: string): boolean {
    const norm = this.norm(relPath);
    const segments = norm.split("/");
    const base = segments[segments.length - 1] ?? "";

    for (const pat of this.config.excludePatterns) {
      if (pat === "*.log" && base.endsWith(".log")) return true;
      if (pat === ".env*" && base.startsWith(".env")) return true;
      if (pat.includes("*")) continue;
      if (segments.includes(pat) || norm === pat || norm.startsWith(`${pat}/`)) return true;
    }
    return false;
  }

  private assertNotExcluded(rel: string, op: string): void {
    if (this.excluded(rel)) {
      throw new Error(`${op}: path is excluded by policy: ${rel}`);
    }
  }

  getEffectiveText(rel: string): string | undefined {
    const key = this.norm(rel);
    if (this.deleted.has(key)) return undefined;
    if (this.overlay.has(key)) return this.overlay.get(key);
    const abs = this.resolveSafe(rel);
    if (!existsSync(abs)) return undefined;
    const stat = fs.statSync(abs);
    if (!stat.isFile()) return undefined;
    if (stat.size > this.config.maxFileSizeToRead) {
      throw new Error(`File too large: ${rel}`);
    }
    const text = fs.readFileSync(abs, "utf8");
    this.fileCache.set(abs, text);
    return text;
  }

  normalizePath(rel: string): string {
    return this.norm(rel);
  }

  readFile(rel: string): string {
    this.assertNotExcluded(rel, "read_file");
    const abs = this.resolveSafe(rel);

    // Check file cache first
    const cached = this.fileCache.get(abs);
    if (cached !== undefined) {
      this.tracker.log({
        type: "code_analysis",
        path: this.norm(rel),
        details: { after: cached, toolName: "read_file" },
        status: "executed",
      });
      return cached;
    }

    if (!existsSync(abs)) throw new Error(`File not found: ${rel}`);
    const stat = fs.statSync(abs);
    if (!stat.isFile()) throw new Error(`File not found: ${rel}`);
    if (stat.size > this.config.maxFileSizeToRead) {
      throw new Error(`File too large: ${rel}`);
    }
    const text = fs.readFileSync(abs, "utf8");
    this.fileCache.set(abs, text);
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rel),
      details: { after: text, toolName: "read_file" },
      status: "executed",
    });
    return text;
  }

  createFile(rel: string, content: string): string {
    if (!this.config.tools.allowFileCreation) throw new Error("File creation disabled");
    this.assertNotExcluded(rel, "create_file");
    const key = this.norm(rel);
    const abs = this.resolveSafe(rel);
    if (fs.existsSync(abs) && !this.deleted.has(key)) {
      throw new Error(`create_file: already exists: ${rel}`);
    }
    this.deleted.delete(key);
    this.overlay.set(key, content);
    this.tracker.log({
      type: "file_create",
      path: key,
      details: { after: content },
      status: "pending",
    });
    return `Staged new file: ${key}`;
  }

  modifyFile(rel: string, content: string): string {
    if (!this.config.tools.allowFileModification) throw new Error("File modification disabled");
    this.assertNotExcluded(rel, "modify_file");
    const before = this.getEffectiveText(rel);
    if (before === undefined) throw new Error(`modify_file: file not found: ${rel}`);
    const key = this.norm(rel);
    this.overlay.set(key, content);
    this.tracker.log({
      type: "file_modify",
      path: key,
      details: { before, after: content },
      status: "pending",
    });
    return `Staged update: ${key}`;
  }

  deleteFile(rel: string): string {
    if (!this.config.tools.allowFileModification) throw new Error("File deletion disabled");
    this.assertNotExcluded(rel, "delete_file");
    const before = this.getEffectiveText(rel);
    if (before === undefined) throw new Error(`delete_file: file not found: ${rel}`);
    const key = this.norm(rel);
    this.overlay.delete(key);
    this.deleted.add(key);
    this.tracker.log({
      type: "file_delete",
      path: key,
      details: { before },
      status: "pending",
    });
    return `Staged delete: ${key}`;
  }

  createFolder(rel: string): string {
    if (!this.config.tools.allowFolderCreation) throw new Error("Folder creation disabled");
    this.assertNotExcluded(rel, "create_folder");
    const key = this.norm(rel);
    this.tracker.log({
      type: "folder_create",
      path: key,
      details: { after: key },
      status: "pending",
    });
    return `Staged folder: ${key}`;
  }

  listFiles(rel: string, recursive: boolean): string {
    this.assertNotExcluded(rel, "list_files");
    const abs = this.resolveSafe(rel);
    if (!fs.existsSync(abs)) throw new Error(`list_files: not found: ${rel}`);

    const lines: string[] = [];
    const walk = (dir: string, prefix: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        const relP = path.relative(this.config.codebasePath, full);
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) {
          lines.push(`${prefix}${ent.name}/`);
          if (recursive) walk(full, `${prefix}${ent.name}/`);
        } else {
          lines.push(`${prefix}${ent.name}`);
        }
      }
    };

    if (fs.statSync(abs).isDirectory()) walk(abs, "");
    else lines.push(path.relative(this.config.codebasePath, abs));

    const out = lines.sort().join("\n");
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rel),
      details: { after: out, toolName: "list_files" },
      status: "executed",
    });
    return out || "(empty)";
  }

  searchFiles(rootRel: string, globPattern: string, contentQuery?: string): string {
    this.assertNotExcluded(rootRel, "search_files");
    const rootAbs = this.resolveSafe(rootRel);
    if (!fs.existsSync(rootAbs)) throw new Error(`search_files: root not found: ${rootRel}`);

    const results: string[] = [];
    const regexFromGlob = (g: string): RegExp => {
      const escaped = g
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*\\\*\//g, "(?:.+/)?")
        .replace(/\\\*\\\*/g, ".*")
        .replace(/\\\*/g, "[^/]*")
        .replace(/\\\?/g, "[^/]");
      return new RegExp(`^${escaped}$`, "i");
    };
    const nameRe = regexFromGlob(globPattern.replace(/\\/g, "/"));

    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relP = path.relative(this.config.codebasePath, full).split(path.sep).join("/");
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) {
          walk(full);
        } else if (nameRe.test(relP) || nameRe.test(ent.name)) {
          if (contentQuery) {
            if (!isProbablyTextFile(full)) continue;
            // Use file cache for content search
            const cached = this.fileCache.get(full);
            if (cached !== undefined) {
              if (!cached.includes(contentQuery)) continue;
            } else {
              const stat = fs.statSync(full);
              if (stat.size > this.config.maxFileSizeToRead) continue;
              const text = fs.readFileSync(full, "utf8");
              this.fileCache.set(full, text);
              if (!text.includes(contentQuery)) continue;
            }
          }
          results.push(relP);
        }
      }
    };

    if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs);
    else {
      const relP = path.relative(this.config.codebasePath, rootAbs).split(path.sep).join("/");
      results.push(relP);
    }

    const out = [...new Set(results)].sort().join("\n");
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rootRel),
      details: { after: out || "(no matches)", toolName: "search_files" },
      status: "executed",
    });
    return out || "(no matches)";
  }

  analyzeCodebase(rootRel: string): string {
    const rootAbs = this.resolveSafe(rootRel);
    if (!fs.existsSync(rootAbs)) throw new Error(`analyze_codebase: not found: ${rootRel}`);

    let files = 0;
    let dirs = 0;
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relP = path.relative(this.config.codebasePath, full);
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) {
          dirs++;
          walk(full);
        } else {
          files++;
        }
      }
    };
    if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs);
    else files = 1;

    const summary = `Files: ${files} | Directories: ${dirs}`;
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rootRel),
      details: { after: summary, toolName: "analyze_codebase" },
      status: "executed",
    });
    return summary;
  }

  queueShell(command: string): string {
    if (!this.config.tools.allowShellExecution) throw new Error("Shell execution disabled");
    this.tracker.log({
      type: "tool_execute",
      path: "shell",
      details: { command, toolName: "execute_shell" },
      status: "pending",
    });
    return `Shell queued: ${command}`;
  }

  readMultipleFiles(paths: string[]) {
    const result: Record<string, string> = {};
    for (const rel of paths) {
      this.assertNotExcluded(rel, "read_multiple_files");
      const abs = this.resolveSafe(rel);

      // Check file cache first
      const cached = this.fileCache.get(abs);
      if (cached !== undefined) {
        this.tracker.log({
          type: "code_analysis",
          path: this.norm(rel),
          details: { after: cached, toolName: "read_multiple_files" },
          status: "executed",
        });
        result[rel] = cached;
        continue;
      }

      if (!existsSync(abs)) throw new Error(`File not found: ${rel}`);
      const stat = fs.statSync(abs);
      if (!stat.isFile()) throw new Error(`File not found: ${rel}`);
      if (stat.size > this.config.maxFileSizeToRead) throw new Error(`File too large: ${rel}`);
      const content = fs.readFileSync(abs, "utf8");
      this.fileCache.set(abs, content);
      this.tracker.log({
        type: "code_analysis",
        path: this.norm(rel),
        details: { after: content, toolName: "read_multiple_files" },
        status: "executed",
      });
      result[rel] = content;
    }
    return result;
  }

  replaceInFile(rel: string, search: string, replace: string): string {
    if (!this.config.tools.allowFileModification) throw new Error("File modification disabled");
    this.assertNotExcluded(rel, "replace_in_file");
    const before = this.getEffectiveText(rel);
    if (before === undefined) throw new Error(`File not found: ${rel}`);
    if (!before.includes(search)) throw new Error(`Search text not found in ${rel}`);
    const after = before.replace(search, replace);
    const key = this.norm(rel);
    this.overlay.set(key, after);
    this.deleted.delete(key);
    this.tracker.log({ type: "file_modify", path: key, details: { before, after }, status: "pending" });
    return `Staged replacement in ${key}`;
  }

  appendToFile(rel: string, content: string): string {
    if (!this.config.tools.allowFileModification) throw new Error("File modification disabled");
    this.assertNotExcluded(rel, "append_to_file");
    const before = this.getEffectiveText(rel);
    if (before === undefined) throw new Error(`File not found: ${rel}`);
    const after = before + content;
    const key = this.norm(rel);
    this.overlay.set(key, after);
    this.tracker.log({ type: "file_modify", path: key, details: { before, after }, status: "pending" });
    return `Staged append: ${key}`;
  }

  insertAtLine(rel: string, line: number, content: string): string {
    if (!this.config.tools.allowFileModification) throw new Error("File modification disabled");
    this.assertNotExcluded(rel, "insert_at_line");
    const before = this.getEffectiveText(rel);
    if (before === undefined) throw new Error(`File not found: ${rel}`);
    const lines = before.split("\n");
    if (line < 1 || line > lines.length + 1) throw new Error(`Invalid line number: ${line}`);
    lines.splice(line - 1, 0, content);
    const after = lines.join("\n");
    const key = this.norm(rel);
    this.overlay.set(key, after);
    this.tracker.log({ type: "file_modify", path: key, details: { before, after }, status: "pending" });
    return `Inserted content at line ${line} in ${key}`;
  }

  showPendingChanges() {
    return this.tracker.getPendingMutations();
  }

  discardStagedPath(rel: string): void {
    const key = this.norm(rel);
    this.overlay.delete(key);
    this.deleted.delete(key);
  }

  discardChanges(): string {
    this.overlay.clear();
    this.deleted.clear();
    this.appliedActionIds.clear();
    this.fileCache.clear();
    return "Discarded all staged changes";
  }

  gitStatus() {
    const result = spawnSync("git", ["status", "--short"], {
      cwd: this.config.codebasePath,
      encoding: "utf8",
    });
    return result.stdout.trim();
  }

  gitDiff(staged = false) {
    const args = staged ? ["diff", "--staged"] : ["diff"];
    const result = spawnSync("git", args, { cwd: this.config.codebasePath, encoding: "utf8" });
    return result.stdout;
  }

  gitLog(limit = 20) {
    const result = spawnSync("git", ["log", "--oneline", `-${limit}`], {
      cwd: this.config.codebasePath,
      encoding: "utf8",
    });
    return result.stdout.trim();
  }

  runCommand(command: string, cwd?: string) {
    const resolvedCwd = cwd ? this.resolveSafe(cwd) : this.config.codebasePath;
    const result = spawnSync(command, {
      cwd: resolvedCwd,
      shell: true,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });
    return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  runBackgroundCommand(args: { command: string; cwd?: string }): string {
    if (!this.config.tools.allowShellExecution) throw new Error("Shell execution disabled");
    const resolvedCwd = args.cwd ? this.resolveSafe(args.cwd) : this.config.codebasePath;
    this.tracker.log({
      type: "tool_execute",
      path: "shell",
      details: { command: args.command, toolName: "run_background_command" },
      status: "pending",
    });
    const child = spawn(args.command, { cwd: resolvedCwd, shell: true, detached: true, stdio: "ignore" });
    child.unref();
    return `Background process started (pid ${child.pid}): ${args.command}`;
  }

  grep(args: { root: string; query: string; caseSensitive: boolean }): string {
    this.assertNotExcluded(args.root, "grep");
    const rootAbs = this.resolveSafe(args.root);
    if (!fs.existsSync(rootAbs)) throw new Error(`grep: root not found: ${args.root}`);

    const flags = args.caseSensitive ? "" : "i";
    const re = new RegExp(escapeRegExp(args.query), flags);
    const matches: string[] = [];

    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        const relP = path.relative(this.config.codebasePath, full).split(path.sep).join("/");
        if (this.excluded(relP)) continue;
        if (ent.isDirectory()) {
          walk(full);
        } else if (isProbablyTextFile(full)) {
          // Use file cache for grep
          const cached = this.fileCache.get(full);
          let text: string;
          if (cached !== undefined) {
            text = cached;
          } else {
            const stat = fs.statSync(full);
            if (stat.size > this.config.maxFileSizeToRead) continue;
            text = fs.readFileSync(full, "utf8");
            this.fileCache.set(full, text);
          }
          const lines = text.split("\n");
          lines.forEach((line: string, idx: number) => {
            if (re.test(line)) matches.push(`${relP}:${idx + 1}: ${line.trim()}`);
          });
        }
      }
    };

    if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs);
    else if (isProbablyTextFile(rootAbs)) {
      const cached = this.fileCache.get(rootAbs);
      let text: string;
      if (cached !== undefined) {
        text = cached;
      } else {
        text = fs.readFileSync(rootAbs, "utf8");
        this.fileCache.set(rootAbs, text);
      }
      const lines = text.split("\n");
      lines.forEach((line: string, idx: number) => {
        if (re.test(line)) matches.push(`${args.root}:${idx + 1}: ${line.trim()}`);
      });
    }

    const out = matches.join("\n");
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(args.root),
      details: { after: out || "(no matches)", toolName: "grep" },
      status: "executed",
    });
    return out || "(no matches)";
  }

  readPackageJson(): string {
    const pkgPath = path.join(this.config.codebasePath, "package.json");
    if (!fs.existsSync(pkgPath)) throw new Error("package.json not found in workspace root");
    const text = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(text);
    const summary = {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      scripts: pkg.scripts ?? {},
      dependencies: Object.keys(pkg.dependencies ?? {}),
      devDependencies: Object.keys(pkg.devDependencies ?? {}),
    };
    this.tracker.log({
      type: "code_analysis",
      path: "package.json",
      details: { after: JSON.stringify(summary, null, 2), toolName: "read_package_json" },
      status: "executed",
    });
    return JSON.stringify(summary, null, 2);
  }

  runTests(filter?: string): { exitCode: number | null; stdout: string; stderr: string } {
    const pkg = getCachedPkg(this.config.codebasePath);
    const testCmd = pkg ? pkg.data.testRunner : "npm test";
    const cmd = filter ? `${testCmd} -- ${filter}` : testCmd;
    return this.runCommand(cmd);
  }

  runTestFile(filePath: string): { exitCode: number | null; stdout: string; stderr: string } {
    this.assertNotExcluded(filePath, "run_test_file");
    const pkg = getCachedPkg(this.config.codebasePath);
    const runner = pkg ? pkg.data.testRunner : "npx jest";
    return this.runCommand(`${runner} ${filePath}`);
  }

  lintProject(): { exitCode: number | null; stdout: string; stderr: string } {
    const pkg = getCachedPkg(this.config.codebasePath);
    const lintCmd = pkg ? pkg.data.lintCmd : "npx eslint .";
    return this.runCommand(lintCmd);
  }

  formatProject(): { exitCode: number | null; stdout: string; stderr: string } {
    const pkg = getCachedPkg(this.config.codebasePath);
    const fmtCmd = pkg ? pkg.data.fmtCmd : "npx prettier --write .";
    return this.runCommand(fmtCmd);
  }

  webSearch(query: string): string {
    const encoded = encodeURIComponent(query);
    const result = spawnSync(
      "curl",
      ["-s", "-A", "Mozilla/5.0", `https://html.duckduckgo.com/html/?q=${encoded}`],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 5 }
    );
    if (result.status !== 0) return `web_search error: ${result.stderr ?? "unknown"}`;
    const text = result.stdout
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 4000);
    this.tracker.log({
      type: "code_analysis",
      path: "web",
      details: { after: text, toolName: "web_search" },
      status: "executed",
    });
    return text;
  }

  fetchUrl(url: string): string {
    const result = spawnSync(
      "curl",
      ["-s", "-L", "-A", "Mozilla/5.0", "--max-time", "15", url],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 5 }
    );
    if (result.status !== 0) return `fetch_url error: ${result.stderr ?? "unknown"}`;
    const text = result.stdout
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 8000);
    this.tracker.log({
      type: "code_analysis",
      path: url,
      details: { after: text, toolName: "fetch_url" },
      status: "executed",
    });
    return text;
  }

  private plan: { goal: string; steps: string[] } | null = null;

  createPlan(goal: string): string {
    this.plan = { goal, steps: [] };
    this.tracker.log({
      type: "code_analysis",
      path: "plan",
      details: { after: goal, toolName: "create_plan" },
      status: "executed",
    });
    return `Plan created for goal: "${goal}". Use get_plan to retrieve it.`;
  }

  getPlan(): string {
    if (!this.plan) return "(no active plan)";
    return JSON.stringify(this.plan, null, 2);
  }

  private applyChanges(): { errors: string[] } {
    for (const action of this.tracker.getActions()) {
      if (action.status === "pending") action.status = "approved";
    }
    return this.applyApprovedFromTracker();
  }

  workspaceContext() {
    return {
      root: this.config.codebasePath,
      pendingChanges: this.overlay.size,
      pendingDeletes: this.deleted.size,
      git: this.gitStatus(),
      trackedActions: this.tracker.getPendingMutations().length,
    };
  }

  detectFramework() {
    const pkgPath = path.join(this.config.codebasePath, "package.json");
    if (!existsSync(pkgPath)) return { framework: "unknown" };
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ("next" in deps) return { framework: "Next.js" };
    if ("react" in deps) return { framework: "React" };
    if ("vue" in deps) return { framework: "Vue" };
    if ("svelte" in deps) return { framework: "Svelte" };
    return { framework: "Node.js" };
  }

  skillRoots(): string[] {
    const extra =
      process.env.SKILLS_DIRS?.split(/[;]/).map((s: string) => s.trim()).filter(Boolean) ?? [];
    return [...extra, path.join(homedir(), ".cursor/skills-cursor"), path.join(homedir(), ".claude/skills")];
  }

  listSkills(): string {
    const lines: string[] = [];
    for (const root of this.skillRoots()) {
      if (!fs.existsSync(root)) continue;
      const walk = (dir: string) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walk(full);
          else if (ent.name === "SKILL.md") lines.push(full);
        }
      };
      walk(root);
    }
    const out = lines.sort().join("\n");
    this.tracker.log({
      type: "code_analysis",
      path: "skills",
      details: { after: out || "(none)", toolName: "list_skills" },
      status: "executed",
    });
    return out || "(none)";
  }

  readSkill(skillPath: string): string {
    const abs = path.isAbsolute(skillPath)
      ? path.normalize(skillPath)
      : path.normalize(path.resolve(this.config.codebasePath, skillPath));
    const allowed = this.skillRoots().some((root) => {
      const r = path.resolve(root);
      return abs === r || abs.startsWith(r + path.sep);
    });
    if (!allowed) throw new Error("read_skill: outside skill roots");
    const text = fs.readFileSync(abs, "utf8");
    this.tracker.log({
      type: "code_analysis",
      path: abs,
      details: { after: text, toolName: "read_skill" },
      status: "executed",
    });
    return text;
  }

  applyApprovedFromTracker(): { errors: string[] } {
    const errors: string[] = [];
    const all = [...this.tracker.getActions()];
    const successfullyAppliedActions: any[] = []; 

    // --- 1. Folder Ops ---
    for (const a of all.filter(
      (x) => x.type === "folder_create" && x.status === "approved" && !this.appliedActionIds.has(x.id)
    )) {
      try {
        fs.mkdirSync(this.resolveSafe(a.path), { recursive: true });
        this.appliedActionIds.add(a.id);
        successfullyAppliedActions.push(a);
      } catch (e) {
        errors.push(String(e));
      }
    }

    // --- 2. File Ops ---
    const fileOps = all
      .filter(
        (a) =>
          (a.type === "file_create" || a.type === "file_modify" || a.type === "file_delete") &&
          a.status === "approved" &&
          !this.appliedActionIds.has(a.id)
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const opsByPath = new Map<string, ActionLog[]>();
    for (const a of fileOps) {
      const key = this.norm(a.path);
      const existing = opsByPath.get(key) ?? [];
      existing.push(a);
      opsByPath.set(key, existing);
    }

    for (const [p, ops] of opsByPath) {
      const a = ops[ops.length - 1];
      if (!a) continue;
      try {
        if (a.type === "file_delete") {
          fs.rmSync(this.resolveSafe(p), { force: true });
        } else {
          const target = this.resolveSafe(p);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, a.details.after ?? "", "utf8");
        }
        
        for (const op of ops) {
          this.appliedActionIds.add(op.id);
          successfullyAppliedActions.push(op);
        }
      } catch (e) {
        errors.push(String(e));
      }
    }

    // --- 3. Shell / Tool Execution Ops ---
    for (const a of all.filter(
      (x) => x.type === "tool_execute" && x.status === "approved" && !this.appliedActionIds.has(x.id)
    )) {
      const cmd = a.details.command;
      if (!cmd) continue;
      try {
        const r = spawnSync(cmd, {
          shell: true,
          cwd: this.config.codebasePath,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
          timeout: 300000,
        });
        
        if (r.error && (r.error as any).code === "ETIMEDOUT") {
          errors.push(`Command timed out after 5 minutes of inactivity: "${cmd}"`);
          this.appliedActionIds.add(a.id);
          successfullyAppliedActions.push(a);
          continue;
        }

        const MAX_OUTPUT_LENGTH = 15000;
        let cleanStdout = r.stdout || "";
        let cleanStderr = r.stderr || "";
        if (cleanStdout.length > MAX_OUTPUT_LENGTH) {
          cleanStdout = cleanStdout.slice(0, MAX_OUTPUT_LENGTH) + "\n\n... [Output Truncated by Astra for context optimization] ...";
        }
        if (cleanStderr.length > MAX_OUTPUT_LENGTH) {
          cleanStderr = cleanStderr.slice(0, MAX_OUTPUT_LENGTH) + "\n\n... [Error Log Truncated by Astra] ...";
        }
        if (r.status !== 0) {
          errors.push(`Command "${cmd}" exited with code ${r.status}. Error: ${cleanStderr}`);
        }
        
        this.appliedActionIds.add(a.id);
        successfullyAppliedActions.push(a);
      } catch (spawnError) {
        errors.push(`Execution error spawning command "${cmd}": ${(spawnError as Error).message}`);
        this.appliedActionIds.add(a.id);
        successfullyAppliedActions.push(a);
      }
    }

    // --- 4. Stream to historical log using decoupled/implicit properties ---
    if (successfullyAppliedActions.length > 0) {
      // Resolve workspace implicitly from current execution configurations
      const workspacePath = this.config.codebasePath || process.cwd();
      
      // Resolve sessionId dynamically so other invocation places don't break
      let sessionId = "standalone_execution";
      try {
        const activeSession = getMostRecentSession();
        if (activeSession) {
          sessionId = activeSession.id;
        }
      } catch {
        // Fallback safely if store/session managers are completely unitialized
      }

      ActionHistoryManager.recordGlobalActions(sessionId, workspacePath, successfullyAppliedActions);
    }

    return { errors };
  }
}

/**
 * Escape special regex characters in a string for use in RegExp constructor.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
