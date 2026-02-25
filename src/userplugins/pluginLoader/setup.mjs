#!/usr/bin/env node

/**
 * External Plugins — initial setup
 *
 * Run once after cloning / installing the userplugin:
 *   node src/userplugins/pluginLoader/setup.mjs
 *
 * This will:
 *   1. Apply UI patches to Vencord source files
 *   2. Install a git post-merge hook for automatic re-patching after `git pull`
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync, chmodSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

// ── 1. Apply patches ───────────────────────────────────────────────────────

console.log("=== Applying External Plugins patches ===\n");

try {
    execSync(`node "${join(__dirname, "apply-patches.mjs")}"`, {
        stdio: "inherit",
        cwd: ROOT,
    });
} catch {
    console.error("\nPatch application failed. See errors above.");
    process.exit(1);
}

// ── 2. Install git post-merge hook ─────────────────────────────────────────

const hookDir = join(ROOT, ".git", "hooks");
const hookPath = join(hookDir, "post-merge");

if (!existsSync(join(ROOT, ".git"))) {
    console.log("\nNo .git directory found — skipping hook installation.");
    process.exit(0);
}

mkdirSync(hookDir, { recursive: true });

const HOOK_MARKER = "# external-plugins-auto-patcher";

// Don't overwrite an existing hook that isn't ours
if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf-8");
    if (!existing.includes(HOOK_MARKER)) {
        console.log("\nA post-merge hook already exists and wasn't created by us.");
        console.log("Please add the following to your .git/hooks/post-merge manually:\n");
        console.log('  node src/userplugins/pluginLoader/apply-patches.mjs\n');
        process.exit(0);
    }
}

const hookContent = `#!/bin/sh
${HOOK_MARKER}
# Re-applies External Plugins UI patches after git pull.
# Installed by: node src/userplugins/pluginLoader/setup.mjs

PATCH_SCRIPT="src/userplugins/pluginLoader/apply-patches.mjs"
if [ -f "$PATCH_SCRIPT" ]; then
    echo "[External Plugins] Applying patches..."
    node "$PATCH_SCRIPT"
fi
`;

writeFileSync(hookPath, hookContent, "utf-8");
try { chmodSync(hookPath, 0o755); } catch { /* Windows doesn't need chmod */ }

console.log("\n=== Setup complete ===");
console.log("  - UI patches applied to source files");
console.log("  - Git post-merge hook installed (.git/hooks/post-merge)");
console.log("  - The built-in Vencord updater is overridden at runtime (native.ts)");
console.log("\nExternal Plugins will survive auto-updates automatically.");
console.log("For manual `git pull`, run: node src/userplugins/pluginLoader/apply-patches.mjs");
