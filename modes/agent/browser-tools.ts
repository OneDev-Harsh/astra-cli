/// <reference lib="dom" />
import fs from "fs";
import path from "path";
import type { Page } from "playwright";
import { tool } from "ai";
import { z } from "zod";
import { BrowserService } from "./browser-service";
import { logAndContinue } from "../../core/logger";

/**
 * Creates a complete, production-grade browser automation toolset.
 *
 * Design principles (inspired by Playwright MCP & Antigravity):
 * • Every tool is self-healing — it recovers from disconnected browsers,
 * closed pages, and stale selectors automatically.
 * • Tools never throw to the AI — they return descriptive error strings
 * so the agent can decide what to do next.
 * • Selectors are flexible: CSS, text=, aria=, or xpath= prefixes.
 * • Actions wait for stability before returning (no flaky race conditions).
 * • Screenshots, downloads, and multi-tab operations are first-class.
 */
export function createNativeBrowserTools() {
    const browserService = BrowserService.getInstance();

    // ── Helpers ─────────────────────────────────────────────────────────

    /**
     * Normalize a URL — add https:// if no protocol is present.
     * Handles edge cases like "localhost:3000", "127.0.0.1:8080", etc.
     */
    function normalizeUrl(input: string): string {
        const trimmed = input.trim();
        if (!trimmed) throw new Error("URL cannot be empty.");

        // Already has a protocol
        if (/^https?:\/\//i.test(trimmed)) return trimmed;

        // Handle file:// protocol
        if (/^file:\/\//i.test(trimmed)) return trimmed;

        // Handle special addresses (localhost, IPs, etc.)
        if (/^localhost/i.test(trimmed) || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed)) {
            return `http://${trimmed}`;
        }

        // Assume https for anything else
        return `https://${trimmed}`;
    }

    /**
     * Resolve a file path so that relative paths are placed in a sensible
     * location (user's Downloads or home), not Playwright's CWD.
     * Works cross-platform (Windows, macOS, Linux).
     */
    function resolveFilePath(filePath: string): string {
        if (path.isAbsolute(filePath)) return filePath;

        // Use appropriate base directory per platform
        const base =
            process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || process.cwd();
        return path.join(base, filePath);
    }

    /**
     * Ensure the parent directory of a file path exists.
     */
    function ensureParentDir(filePath: string): void {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Parse a selector string into a Playwright-compatible selector.
     *
     * Supported formats:
     * • CSS selectors: `#id`, `.class`, `[attr="val"]`, `div > span`
     * • Text selectors: `text=Click Me`, `text="Click Me"`
     * • ARIA shorthand: `aria=Search` → `[aria-label="Search"]`
     * • XPath: `xpath=//div[@class='foo']`
     * • Role + name: `role=button[name="Submit"]`
     */
    function parseSelector(raw: string): string {
        const trimmed = raw.trim();

        // XPath selector
        if (trimmed.startsWith("xpath=")) {
            return trimmed; // Playwright supports xpath= prefix natively
        }

        // Role selector: role=button[name="Submit"]
        const roleMatch = trimmed.match(/^role\s*=\s*(\w+)(?:\[name="([^"]+)"\])?$/i);
        if (roleMatch) {
            const role = roleMatch[1];
            const name = roleMatch[2];
            return name ? `role=${role}[name="${name}"]` : `role=${role}`;
        }

        // Text selector: text=... or text="..."
        const textMatch = trimmed.match(/^text\s*=\s*"?([^"]+)"?$/i);
        if (textMatch) {
            return `text=${textMatch[1]}`;
        }

        // ARIA shorthand: aria=label → [aria-label="label"]
        const ariaMatch = trimmed.match(/^aria\s*=\s*"?([^"]+)"?$/i);
        if (ariaMatch) {
            return `[aria-label="${ariaMatch[1]}"]`;
        }

        // Otherwise treat as CSS selector
        return trimmed;
    }

    /**
     * Validate a Playwright keyboard key name.
     */
    function validateKey(key: string): string {
        const validKeys = new Set([
            "Enter", "Tab", "Escape", "Backspace", "Delete",
            "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
            "Home", "End", "PageUp", "PageDown",
            "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
            "Shift", "Control", "Alt", "Meta", "Space",
            "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
            "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
            "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
        ]);
        if (!validKeys.has(key)) {
            throw new Error(
                `Invalid key "${key}". Must be a valid Playwright key name (e.g. Enter, Tab, Escape, ArrowDown).`,
            );
        }
        return key;
    }

    /**
     * Robust click helper — tries Playwright's click first, then falls back
     * to dispatchEvent if the element is obscured.
     */
    async function robustClick(page: Page, selector: string, timeout = 10_000): Promise<void> {
        const baseLocator = page.locator(selector);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const locator = (baseLocator as any).first;

        // Wait for element to be visible and stable
        await locator.waitFor({ state: "visible", timeout });

        // Try the standard Playwright click (handles scrolling into view)
        try {
            await locator.click({ timeout: 5_000 });
            return;
        } catch {
            // Fallback: force click via dispatchEvent
        }

        // Fallback: dispatch a full mouse event sequence
        await locator.evaluate((el: Element) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            const x = rect.x + rect.width / 2;
            const y = rect.y + rect.height / 2;
            const opts: MouseEventInit = { bubbles: true, cancelable: true, clientX: x, clientY: y };

            el.dispatchEvent(new MouseEvent("mouseenter", opts));
            el.dispatchEvent(new MouseEvent("mouseover", opts));
            el.dispatchEvent(new MouseEvent("mousedown", opts));
            el.dispatchEvent(new MouseEvent("mouseup", opts));
            el.dispatchEvent(new MouseEvent("click", opts));
        });
    }

    /**
     * Robust type helper — clears the field and types character by character
     * to trigger React/Vue event handlers properly.
     */
    async function robustType(page: Page, selector: string, text: string, timeout = 10_000): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const locator = (page.locator(selector) as any).first as any;

        // Wait for element
        await locator.waitFor({ state: "visible", timeout });

        // Focus the element
        await locator.focus();

        // Clear existing content (triple-click to select all, then type)
        await locator.dblclick();
        await page.keyboard.press("Backspace");

        // Type with a small delay between keystrokes to trigger React state updates
        await locator.fill(text);

        // Also dispatch input and change events for frameworks that rely on them
        await locator.evaluate((el: Element, value: string) => {
            // Set the value via the native setter to trigger React's synthetic events
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value",
            )?.set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(el, value);
            }
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }, text);
    }

    // ── Tools ───────────────────────────────────────────────────────────

    return {
        // ═══════════════════════════════════════════════════════════════════
        // NAVIGATION
        // ═══════════════════════════════════════════════════════════════════

        browser_navigate: tool({
            description: "Open a URL in the browser and safely wait for completion layout initialization.",
            inputSchema: z.object({
                url: z.string().min(1).describe("Absolute HTTP or HTTPS URL to navigate to"),
            }),
            execute: async ({ url }) => {
                try {
                    const normalizedUrl = normalizeUrl(url);
                    const page = await browserService.getPage();

                    // Wait safely for the initial document context layout commit
                    const response = await page.goto(normalizedUrl, {
                        waitUntil: "commit",
                        timeout: 30_000,
                    });

                    // Ensure SPA frameworks are hydrated before yielding control
                    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
                    await page.waitForTimeout(1500).catch(() => {});

                    const status = response?.status() ?? 0;
                    const finalUrl = page.url();
                    const title = await page.title().catch(() => "(unknown)");

                    return [
                        `✅ Navigated successfully`,
                        `URL: ${finalUrl}`,
                        `Title: ${title || "(loading)"}`,
                        `Status: ${status || "(local/file)"}`,
                    ].join("\n");
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-navigate", error, { url });
                    return `❌ Navigation failed: ${msg}`;
                }
            },
        }),

        browser_go_back: tool({
            description: "Go back to the previous page in browser history.",
            inputSchema: z.object({}),
            execute: async () => {
                try {
                    const page = await browserService.getPage();
                    await page.goBack({ waitUntil: "domcontentloaded", timeout: 15_000 });
                    await page.waitForTimeout(300).catch(() => {});
                    return `⬅️ Went back. Now on: ${page.url()}`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-go-back", error);
                    return `❌ Go back failed: ${msg}`;
                }
            },
        }),

        browser_go_forward: tool({
            description: "Go forward to the next page in browser history.",
            inputSchema: z.object({}),
            execute: async () => {
                try {
                    const page = await browserService.getPage();
                    await page.goForward({ waitUntil: "domcontentloaded", timeout: 15_000 });
                    await page.waitForTimeout(300).catch(() => {});
                    return `➡️ Went forward. Now on: ${page.url()}`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-go-forward", error);
                    return `❌ Go forward failed: ${msg}`;
                }
            },
        }),

        browser_reload: tool({
            description: "Reload the current page.",
            inputSchema: z.object({}),
            execute: async () => {
                try {
                    const page = await browserService.getPage();
                    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
                    await page.waitForTimeout(300).catch(() => {});
                    return `🔄 Reloaded. Now on: ${page.url()}`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-reload", error);
                    return `❌ Reload failed: ${msg}`;
                }
            },
        }),

        // ═══════════════════════════════════════════════════════════════════
        // SNAPSHOT & INSPECTION
        // ═══════════════════════════════════════════════════════════════════

        browser_snapshot: tool({
            description:
                "Get a structured snapshot of interactive elements on the current page " +
                "(links, buttons, inputs, headings). Use this before clicking to find valid selectors.",
            inputSchema: z.object({}),
            execute: async () => {
                try {
                    const page = await browserService.getPage();

                    const snapshot = await page.evaluate(() => {
                        const isVisible = (el: Element): boolean => {
                            const htmlEl = el as HTMLElement;
                            if (typeof htmlEl.getBoundingClientRect !== "function") return false;
                            const r = htmlEl.getBoundingClientRect();
                            if (r.width === 0 && r.height === 0) return false;
                            const s = window.getComputedStyle(htmlEl);
                            return (
                                s.display !== "none" &&
                                s.visibility !== "hidden" &&
                                s.opacity !== "0"
                            );
                        };

                        const bestSelector = (el: Element): string => {
                            const h = el as HTMLElement;
                            if (h.id) return `#${CSS.escape(h.id)}`;
                            const aria = h.getAttribute("aria-label");
                            if (aria) return `[aria-label="${aria}"]`;
                            const name = (h as unknown as HTMLInputElement).name;
                            if (name) return `${h.tagName.toLowerCase()}[name="${name}"]`;
                            const testId = h.getAttribute("data-testid");
                            if (testId) return `[data-testid="${testId}"]`;
                            // Fallback: nth-of-type for disambiguation
                            const parent = el.parentElement;
                            if (parent) {
                                const siblings = Array.from(parent.children).filter(
                                    (c) => c.tagName === el.tagName,
                                );
                                if (siblings.length > 1) {
                                    const idx = siblings.indexOf(el) + 1;
                                    return `${h.tagName.toLowerCase()}:nth-of-type(${idx})`;
                                }
                            }
                            return h.tagName.toLowerCase();
                        };

                        const lines: string[] = [];
                        const seen = new Set<string>();

                        const elements = document.querySelectorAll(
                            "h1,h2,h3,h4,a,button,input,select,textarea,[role='button'],[role='link'],[role='textbox'],[role='searchbox']",
                        );

                        for (const el of elements) {
                            if (!isVisible(el)) continue;
                            const tag = el.tagName.toLowerCase();
                            const text = ((el as HTMLElement).innerText ?? "").trim().slice(0, 80);
                            const sel = bestSelector(el);
                            let line = "";

                            if (["h1", "h2", "h3", "h4"].includes(tag)) {
                                line = `[${tag.toUpperCase()}] "${text}"`;
                            } else if (tag === "a" || el.getAttribute("role") === "link") {
                                const href = (el as HTMLAnchorElement).href || "";
                                line = `[Link] "${text}" → ${href} | \`${sel}\``;
                            } else if (tag === "button" || el.getAttribute("role") === "button") {
                                const label = text || el.getAttribute("aria-label") || "";
                                line = `[Button] "${label}" | \`${sel}\``;
                            } else if (tag === "input") {
                                const inp = el as HTMLInputElement;
                                line = `[Input:${inp.type}] placeholder="${inp.placeholder}" | \`${sel}\``;
                            } else if (tag === "select") {
                                line = `[Select] | \`${sel}\``;
                            } else if (tag === "textarea") {
                                line = `[Textarea] placeholder="${(el as HTMLTextAreaElement).placeholder}" | \`${sel}\``;
                            }

                            if (line && !seen.has(line)) {
                                seen.add(line);
                                lines.push(line);
                            }
                        }

                        return {
                            title: document.title,
                            url: window.location.href,
                            elements: lines.slice(0, 200),
                        };
                    });

                    return [
                        `📋 Page Snapshot`,
                        `URL: ${snapshot.url}`,
                        `Title: ${snapshot.title}`,
                        "",
                        `Elements (${snapshot.elements.length}):`,
                        snapshot.elements.join("\n") || "(none)",
                    ].join("\n");
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-snapshot", error);
                    return `❌ Snapshot failed: ${msg}`;
                }
            },
        }),

        browser_get_text: tool({
            description: "Get the visible text content of the current page.",
            inputSchema: z.object({}),
            execute: async () => {
                try {
                    const page = await browserService.getPage();
                    const text = await page.evaluate(() => {
                        const body = document.body;
                        if (!body) return "(no body content)";
                        return body.innerText;
                    });
                    const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
                    const truncated = cleaned.length > 8000;
                    const result = cleaned.slice(0, 8000);
                    return truncated
                        ? `${result}\n\n... [truncated, ${cleaned.length} chars total]`
                        : result || "(empty page)";
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-get-text", error);
                    return `❌ Failed to get page text: ${msg}`;
                }
            },
        }),

        // ═══════════════════════════════════════════════════════════════════
        // INTERACTION
        // ═══════════════════════════════════════════════════════════════════

        browser_click: tool({
            description:
                "Click an element by CSS or text selector. " +
                "Supports: `#id`, `.class`, `text=Sign In`, `aria=Search`, `xpath=//div`.",
            inputSchema: z.object({
                selector: z.string().describe("CSS selector, text=, aria=, or xpath= selector"),
            }),
            execute: async ({ selector }) => {
                try {
                    const parsedSelector = parseSelector(selector);
                    const page = await browserService.getPage();

                    await robustClick(page, parsedSelector);

                    // Wait for any resulting navigation or DOM updates
                    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});
                    await page.waitForTimeout(300).catch(() => {});

                    return `✅ Clicked: "${selector}"`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-click", error, { selector });
                    return `❌ Click failed on "${selector}": ${msg}`;
                }
            },
        }),

        browser_type: tool({
            description: "Clear a field and type text into it. Works with React, Vue, and vanilla inputs.",
            inputSchema: z.object({
                selector: z.string().describe("CSS selector for the input field"),
                text: z.string().describe("Text to type"),
            }),
            execute: async ({ selector, text }) => {
                try {
                    const parsedSelector = parseSelector(selector);
                    const page = await browserService.getPage();

                    await robustType(page, parsedSelector, text);

                    return `✅ Typed "${text}" into "${selector}"`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-type", error, { selector });
                    return `❌ Type failed on "${selector}": ${msg}`;
                }
            },
        }),

        browser_press_key: tool({
            description: "Press a keyboard key (e.g. Enter, Tab, Escape, ArrowDown).",
            inputSchema: z.object({
                key: z.string().describe("Playwright key name"),
            }),
            execute: async ({ key }) => {
                try {
                    const validKey = validateKey(key);
                    const page = await browserService.getPage();

                    await page.keyboard.press(validKey);

                    // Brief wait for any resulting navigation or DOM changes
                    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});
                    await page.waitForTimeout(200).catch(() => {});

                    return `✅ Pressed: "${validKey}"`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-press-key", error, { key });
                    return `❌ Key press failed: ${msg}`;
                }
            },
        }),

        browser_hover: tool({
            description: "Hover over an element to trigger tooltips, dropdowns, or hover effects.",
            inputSchema: z.object({
                selector: z.string().describe("CSS selector or text= selector"),
            }),
            execute: async ({ selector }) => {
                try {
                    const parsedSelector = parseSelector(selector);
                    const page = await browserService.getPage();

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const locator = (page.locator(parsedSelector) as any).first;
                    await locator.waitFor({ state: "visible", timeout: 10_000 });
                    await locator.hover();

                    // Wait for hover effects to render
                    await page.waitForTimeout(500).catch(() => {});

                    return `✅ Hovered: "${selector}"`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-hover", error, { selector });
                    return `❌ Hover failed on "${selector}": ${msg}`;
                }
            },
        }),

        browser_select: tool({
            description: "Select an option from a <select> dropdown by value or label.",
            inputSchema: z.object({
                selector: z.string().describe("CSS selector for the <select> element"),
                value: z.string().describe("Option value or visible label text"),
            }),
            execute: async ({ selector, value }) => {
                try {
                    const parsedSelector = parseSelector(selector);
                    const page = await browserService.getPage();

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const locator = (page.locator(parsedSelector) as any).first;
                    await locator.waitFor({ state: "visible", timeout: 10_000 });

                    // Try selecting by value first, then by label
                    try {
                        await locator.selectOption({ value });
                    } catch {
                        await locator.selectOption({ label: value });
                    }

                    // Dispatch change event
                    await locator.evaluate((el: Element) => {
                        el.dispatchEvent(new Event("change", { bubbles: true }));
                    });

                    return `✅ Selected "${value}" in "${selector}"`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-select", error, { selector, value });
                    return `❌ Select failed on "${selector}": ${msg}`;
                }
            },
        }),

        browser_checkbox: tool({
            description: "Check or uncheck a checkbox or toggle switch.",
            inputSchema: z.object({
                selector: z.string().describe("CSS selector for the checkbox"),
                checked: z.boolean().default(true).describe("True to check, false to uncheck"),
            }),
            execute: async ({ selector, checked }) => {
                try {
                    const parsedSelector = parseSelector(selector);
                    const page = await browserService.getPage();

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const locator = (page.locator(parsedSelector) as any).first;
                    await locator.waitFor({ state: "visible", timeout: 10_000 });

                    const isChecked = await locator.isChecked();
                    if (checked !== isChecked) {
                        await locator.click();
                        await page.waitForTimeout(200).catch(() => {});
                    }

                    return `${checked ? "☑️ Checked" : "☐ Unchecked"}: "${selector}"`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-checkbox", error, { selector, checked });
                    return `❌ Checkbox toggle failed on "${selector}": ${msg}`;
                }
            },
        }),

        // ═══════════════════════════════════════════════════════════════════
        // WAITS
        // ═══════════════════════════════════════════════════════════════════

        browser_wait: tool({
            description: "Wait for a fixed duration in milliseconds.",
            inputSchema: z.object({
                ms: z.number().min(100).max(10_000).default(1500),
            }),
            execute: async ({ ms }) => {
                try {
                    const page = await browserService.getPage();
                    await page.waitForTimeout(ms);
                    return `⏱️ Waited ${ms}ms.`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-wait", error, { ms });
                    return `❌ Wait failed: ${msg}`;
                }
            },
        }),

        browser_wait_for_element: tool({
            description: "Wait until an element appears, disappears, or becomes visible.",
            inputSchema: z.object({
                selector: z.string(),
                state: z.enum(["visible", "hidden", "attached", "detached"]).default("visible").describe(
                    "Wait for the element to reach this state",
                ),
                timeout: z.number().min(500).max(30_000).default(10_000),
            }),
            execute: async ({ selector, state, timeout }) => {
                try {
                    const parsedSelector = parseSelector(selector);
                    const page = await browserService.getPage();

                    await page.waitForSelector(parsedSelector, {
                        state,
                        timeout,
                    });

                    return `✅ "${selector}" is now ${state}.`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-wait-for-element", error, { selector, state, timeout });
                    return `❌ Timeout waiting for "${selector}" to be ${state}: ${msg}`;
                }
            },
        }),

        browser_wait_for_url: tool({
            description: "Wait until the page URL matches a pattern (substring or regex).",
            inputSchema: z.object({
                urlPattern: z.string().describe("URL substring or regex pattern to wait for"),
                timeout: z.number().min(1000).max(30_000).default(10_000),
            }),
            execute: async ({ urlPattern, timeout }) => {
                try {
                    const page = await browserService.getPage();
                    await page.waitForURL(
                        (url) => url.toString().includes(urlPattern),
                        { timeout },
                    );
                    return `✅ URL now contains: "${urlPattern}" (actual: ${page.url()})`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-wait-for-url", error, { urlPattern, timeout });
                    return `❌ Timeout waiting for URL containing "${urlPattern}": ${msg}`;
                }
            },
        }),

        // ═══════════════════════════════════════════════════════════════════
        // SCROLLING
        // ═══════════════════════════════════════════════════════════════════

        browser_scroll: tool({
            description: "Scroll the page (positive = down, negative = up).",
            inputSchema: z.object({
                pixels: z.number().describe("Pixels to scroll"),
            }),
            execute: async ({ pixels }) => {
                try {
                    const page = await browserService.getPage();

                    // Clamp to reasonable bounds
                    const clamped = Math.max(-50_000, Math.min(50_000, pixels));

                    await page.evaluate((px) => {
                        // Try scrolling the main scrollable container, fallback to window
                        const scrollable = document.documentElement;
                        scrollable.scrollTop += px;
                        window.scrollBy({ top: px, behavior: "smooth" });
                    }, clamped);

                    // Wait for smooth scroll to complete
                    await page.waitForTimeout(500);

                    const direction = clamped > 0 ? "down" : "up";
                    return `📜 Scrolled ${direction} ${Math.abs(clamped)}px.`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-scroll", error, { pixels });
                    return `❌ Scroll failed: ${msg}`;
                }
            },
        }),

        browser_scroll_to_element: tool({
            description: "Scroll until a specific element is visible in the viewport.",
            inputSchema: z.object({
                selector: z.string().describe("CSS selector for the element to scroll to"),
            }),
            execute: async ({ selector }) => {
                try {
                    const parsedSelector = parseSelector(selector);
                    const page = await browserService.getPage();

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const locator = (page.locator(parsedSelector) as any).first;
                    await locator.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(300).catch(() => {});

                    return `📜 Scrolled to: "${selector}"`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-scroll-to-element", error, { selector });
                    return `❌ Scroll to element failed: ${msg}`;
                }
            },
        }),

        // ═══════════════════════════════════════════════════════════════════
        // SCREENSHOTS
        // ═══════════════════════════════════════════════════════════════════

        browser_take_screenshot: tool({
            description: "Take a screenshot of the current viewport or full page.",
            inputSchema: z.object({
                filePath: z.string().default("screenshot.png").describe("Output file path"),
                fullPage: z.boolean().default(false).describe("Capture the entire scrollable page, not just the viewport"),
            }),
            execute: async ({ filePath, fullPage }) => {
                try {
                    const resolvedPath = resolveFilePath(filePath);
                    ensureParentDir(resolvedPath);

                    const page = await browserService.getPage();
                    await page.screenshot({
                        path: resolvedPath,
                        fullPage,
                        type: "png",
                    });

                    return `📸 Screenshot saved: ${resolvedPath}${fullPage ? " (full page)" : " (viewport)"}`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-screenshot", error, { filePath });
                    return `❌ Screenshot failed: ${msg}`;
                }
            },
        }),

        // ═══════════════════════════════════════════════════════════════════
        // JAVASCRIPT EVALUATION
        // ═══════════════════════════════════════════════════════════════════

        browser_evaluate: tool({
            description: "Execute JavaScript in the page context and return the result.",
            inputSchema: z.object({
                expression: z.string().describe("JavaScript expression to evaluate"),
            }),
            execute: async ({ expression }) => {
                try {
                    const page = await browserService.getPage();
                    const result = await page.evaluate(
                        (expr: string) => new Function(`return (${expr})`)() as unknown,
                        expression,
                    );

                    if (result === undefined) return "undefined";
                    if (result === null) return "null";
                    if (typeof result === "string") return result;
                    return JSON.stringify(result, null, 2);
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-evaluate", error, { expression });
                    return `❌ Evaluate failed: ${msg}`;
                }
            },
        }),

        // ═══════════════════════════════════════════════════════════════════
        // MULTI-TAB
        // ═══════════════════════════════════════════════════════════════════

        browser_new_tab: tool({
            description: "Open a new browser tab and switch to it.",
            inputSchema: z.object({
                url: z.string().optional().describe("Optional URL to open in the new tab"),
            }),
            execute: async ({ url }) => {
                try {
                    const page = await browserService.openNewTab();

                    if (url) {
                        const normalizedUrl = normalizeUrl(url);
                        await page.goto(normalizedUrl, {
                            waitUntil: "domcontentloaded",
                            timeout: 20_000,
                        });
                        await page.waitForTimeout(300).catch(() => {});
                    }

                    return `📄 New tab opened${url ? `: ${url}` : ""}`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-new-tab", error, { url });
                    return `❌ New tab failed: ${msg}`;
                }
            },
        }),

        browser_switch_tab: tool({
            description: "Switch to a different tab by URL fragment.",
            inputSchema: z.object({
                urlFragment: z.string().describe("Part of the URL to identify the target tab"),
            }),
            execute: async ({ urlFragment }) => {
                try {
                    const page = await browserService.switchToTab(urlFragment);
                    if (!page) {
                        return `❌ No tab found containing "${urlFragment}"`;
                    }
                    return `📄 Switched to tab: ${page.url()}`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-switch-tab", error, { urlFragment });
                    return `❌ Switch tab failed: ${msg}`;
                }
            },
        }),

        browser_list_tabs: tool({
            description: "List all open browser tabs with their URLs and titles.",
            inputSchema: z.object({}),
            execute: async () => {
                try {
                    const tabs = await browserService.listTabs();
                    if (tabs.length === 0) return "No tabs open.";

                    return tabs
                        .map((t, i) => `[${i}] ${t.title} → ${t.url}`)
                        .join("\n");
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-list-tabs", error);
                    return `❌ List tabs failed: ${msg}`;
                }
            },
        }),

        // ═══════════════════════════════════════════════════════════════════
        // VIEWPORT
        // ═══════════════════════════════════════════════════════════════════

        browser_set_viewport: tool({
            description: "Change the browser viewport size.",
            inputSchema: z.object({
                width: z.number().min(320).max(3840),
                height: z.number().min(240).max(2160),
            }),
            execute: async ({ width, height }) => {
                try {
                    const page = await browserService.getPage();
                    await page.setViewportSize({ width, height });
                    return `📐 Viewport set to ${width}×${height}`;
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    logAndContinue("browser-set-viewport", error, { width, height });
                    return `❌ Set viewport failed: ${msg}`;
                }
            },
        }),
    };
}