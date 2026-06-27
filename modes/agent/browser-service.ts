import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { logAndContinue } from "../../core/logger";

/**
 * BrowserService — Robust singleton wrapper around Playwright's Chromium.
 *
 * Design philosophy (inspired by Playwright MCP & Antigravity):
 * • Never throw to callers — always recover or return a descriptive string.
 * • Lazy launch with a single shared promise (no races).
 * • Automatic recovery from crashes, disconnections, and closed pages.
 * • Graceful headless fallback when no display is available.
 * • Cross-platform launch flags (Windows / macOS / Linux / Docker / WSL).
 * • Process-level cleanup hooks so the browser never leaks.
 *
 * Usage:
 * const service = BrowserService.getInstance();
 * const page = await service.getPage();
 * // ... use page ...
 * await service.shutdown(); // when done
 */
export class BrowserService {
    private static instance: BrowserService | null = null;

    private browser: Browser | null = null;
    private masterContext: BrowserContext | null = null;
    private activePage: Page | null = null;

    /** Single shared launch promise — concurrent callers await the same future. */
    private launchPromise: Promise<Page> | null = null;

    /** Whether we've registered process-level cleanup hooks. */
    private cleanupHooksRegistered = false;

    /** Maximum launch attempts before giving up. */
    private static readonly MAX_LAUNCH_RETRIES = 3;

    /** Timeout for each individual launch attempt (ms). */
    private static readonly LAUNCH_TIMEOUT = 30_000;

    /** Default viewport. */
    private static readonly VIEWPORT_WIDTH = 1280;
    private static readonly VIEWPORT_HEIGHT = 720;

    // ── Singleton ─────────────────────────────────────────────────────────

    private constructor() {}

    public static getInstance(): BrowserService {
        if (!BrowserService.instance) {
            BrowserService.instance = new BrowserService();
        }
        return BrowserService.instance;
    }

    // ── Process cleanup hooks ─────────────────────────────────────────────

    /**
     * Register SIGINT / exit handlers so the browser process is killed
     * cleanly when the host process exits. Idempotent.
     */
    private ensureCleanupHooks(): void {
        if (this.cleanupHooksRegistered) return;
        this.cleanupHooksRegistered = true;

        const shutdown = () => {
            // Synchronous close — no async in signal handlers
            try {
                if (this.browser && this.browser.isConnected()) {
                    // close() is fire-and-forget in signal context
                    this.browser.close().catch(() => {});
                }
            } catch { /* ignore */ }
        };

        process.on("SIGINT", () => {
            shutdown();
            process.exit(130); // 128 + SIGINT(2)
        });

        process.on("exit", shutdown);
    }

    // ── Core launch ───────────────────────────────────────────────────────

    /**
     * Get a live Page, launching the browser if needed.
     * Concurrent callers share the same launch promise.
     */
    public async getPage(): Promise<Page> {
        this.ensureCleanupHooks();

        // If a launch is already in flight, wait for it
        if (this.launchPromise) {
            return this.launchPromise;
        }

        // If everything is healthy, return immediately
        const existing = this.activePage;
        if (existing && this.isPageAlive(existing)) {
            return existing;
        }

        // Start a new launch — this promise is shared
        this.launchPromise = this.launchWithRetry();

        try {
            const launched = await this.launchPromise;
            this.activePage = launched;
            return launched;
        } finally {
            this.launchPromise = null;
        }
    }

    /**
     * Launch with retry + exponential backoff. Returns a live Page.
     */
    private async launchWithRetry(): Promise<Page> {
        let lastError: unknown;

        for (let attempt = 1; attempt <= BrowserService.MAX_LAUNCH_RETRIES; attempt++) {
            try {
                const page = await this.doLaunch(attempt);
                return page;
            } catch (error) {
                lastError = error;
                const errMsg = error instanceof Error ? error.message : String(error);
                logAndContinue(
                    "browser-service",
                    new Error(`Launch attempt ${attempt}/${BrowserService.MAX_LAUNCH_RETRIES} failed: ${errMsg}`),
                    { attempt, maxRetries: BrowserService.MAX_LAUNCH_RETRIES },
                );

                // Full cleanup before retry
                await this.safeCleanup();

                // Exponential backoff (capped at 5s)
                if (attempt < BrowserService.MAX_LAUNCH_RETRIES) {
                    const delay = Math.min(1000 * 2 ** (attempt - 1), 5000);
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
        }

        throw new Error(
            `Browser failed to launch after ${BrowserService.MAX_LAUNCH_RETRIES} attempts. ` +
                `Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        );
    }

    /**
     * Single launch attempt. Creates browser → context → page.
     * Always uses headless: true to guarantee reliability across terminal/server environments.
     */
    private async doLaunch(attempt: number): Promise<Page> {
    // 1. Smart environment detection for headless fallback
    const isHeadlessEnv = !process.env.DISPLAY && process.platform !== 'win32' && process.platform !== 'darwin';
    const headless = isHeadlessEnv || attempt > 1 || process.env.HEADLESS === "true";

    const launchOptions = {
        headless,
        timeout: BrowserService.LAUNCH_TIMEOUT,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
    };

    this.browser = await chromium.launch(launchOptions);
    this.masterContext = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
    });

    // Create initial page
    const page = await this.masterContext.newPage();

    // ❌ REMOVE OR COMMENT OUT THIS HANGING LINE:
    // await page.waitForLoadState("domcontentloaded").catch(() => {});
    
    return page;
}

    // ── Page health checks ─────────────────────────────────────────────────

    /**
     * Returns true if the page is non-null, not closed, and its browser
     * is still connected.
     */
    private isPageAlive(page: Page | null): boolean {
        if (!page) return false;
        try {
            if (page.isClosed()) return false;
            // Accessing .context() throws if the browser is gone
            const ctx = page.context();
            if (!ctx) return false;
            const browser = ctx.browser();
            if (!browser || !browser.isConnected()) return false;
            return true;
        } catch {
            return false;
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    /**
     * Shut down the browser and clean up all resources.
     */
    public async shutdown(): Promise<void> {
        await this.safeCleanup();
        BrowserService.instance = null;
    }

    /**
     * Gracefully close browser resources without throwing.
     * Order: pages → context → browser process.
     */
    private async safeCleanup(): Promise<void> {
        // Close active page
        if (this.activePage) {
            try {
                if (!this.activePage.isClosed()) {
                    await this.activePage.close();
                }
            } catch { /* ignore */ }
            this.activePage = null;
        }

        // Close context (also closes any other pages in this context)
        if (this.masterContext) {
            try {
                await this.masterContext.close();
            } catch { /* ignore */ }
            this.masterContext = null;
        }

        // Close browser process
        if (this.browser) {
            try {
                if (this.browser.isConnected()) {
                    await this.browser.close();
                }
            } catch { /* ignore */ }
            this.browser = null;
        }
    }

    // ── Diagnostics ───────────────────────────────────────────────────────

    /** Returns true if the browser is connected and has a live page. */
    public isReady(): boolean {
        return this.isPageAlive(this.activePage);
    }

    /**
     * Create a new page in the same context. Useful for multi-tab scenarios.
     * The new page becomes the active page.
     */
    public async openNewTab(): Promise<Page> {
        this.ensureCleanupHooks();

        if (!this.masterContext || !this.browser || !this.browser.isConnected()) {
            // Full re-launch
            return this.getPage();
        }

        const page = await this.masterContext.newPage();
        this.activePage = page;
        return page;
    }

    /**
     * Switch the active page to a specific tab by URL match.
     * Returns the page or null if not found.
     */
    public async switchToTab(urlFragment: string): Promise<Page | null> {
        if (!this.masterContext) return null;

        const pages = this.masterContext.pages();
        for (const p of pages) {
            try {
                if (p.url().includes(urlFragment)) {
                    this.activePage = p;
                    return p;
                }
            } catch { /* page may be closing */ }
        }
        return null;
    }

    /**
     * List all open tabs with their URLs and titles.
     */
    public async listTabs(): Promise<Array<{ url: string; title: string }>> {
        if (!this.masterContext) return [];

        const tabs: Array<{ url: string; title: string }> = [];
        for (const p of this.masterContext.pages()) {
            try {
                tabs.push({
                    url: p.url(),
                    title: await p.title().catch(() => "(unknown)"),
                });
            } catch { /* page may be closing */ }
        }
        return tabs;
    }
}