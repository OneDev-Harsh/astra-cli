import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const TEST_HOME = path.join(import.meta.dir, "sandbox_home");
const ENV_OPTS = {
    env: { ...process.env, HOME: TEST_HOME, USERPROFILE: TEST_HOME },
};

describe("Astra CLI Integration Smoke Tests", () => {
    beforeAll(() => {
        if (fs.existsSync(TEST_HOME)) {
            fs.rmSync(TEST_HOME, { recursive: true, force: true });
        }
        fs.mkdirSync(TEST_HOME, { recursive: true });
    });

    afterAll(() => {
        // 1. Clean up sandbox files cleanly
        if (fs.existsSync(TEST_HOME)) {
            fs.rmSync(TEST_HOME, { recursive: true, force: true });
        }
        
        // 2. Kill the event loop to stop the CLI from hanging on background imports/servers
        process.exit(0); 
    });

    test("Global version flag returns expected semver string", () => {
        const output = execSync("bun index.ts --version", ENV_OPTS).toString().trim();
        expect(output).toMatch(/^\d+\.\d+\.\d+/);
    });

    test("Help flag displays primary commands block natively", () => {
        const output = execSync("bun index.ts --help", ENV_OPTS).toString();
        expect(output).toContain("wakeup");
        expect(output).toContain("setup");
        expect(output).toContain("play");
        expect(output).toContain("reset");
    });
});