/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * PluginLoader native companion — filesystem access for runtime plugins.
 */

import { ipcMain, IpcMainInvokeEvent, shell } from "electron";
import { execFile as cpExecFile } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";

function getPluginsDir(): string {
    const base = process.env.VENCORD_USER_DATA_DIR
        ?? (process.env.DISCORD_USER_DATA_DIR
            ? join(process.env.DISCORD_USER_DATA_DIR, "..", "VencordData")
            : join(
                process.env.APPDATA
                || process.env.XDG_CONFIG_HOME
                || join(process.env.HOME!, ".config"),
                "Vencord"
            ));
    const dir = join(base, "plugins");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
}

export function listPlugins(_: IpcMainInvokeEvent): { name: string; size: number; }[] {
    const dir = getPluginsDir();
    return readdirSync(dir, { withFileTypes: true })
        .filter(f => f.isFile() && f.name.endsWith(".js"))
        .map(f => {
            const stat = readFileSync(join(dir, f.name));
            return { name: f.name, size: stat.length };
        });
}

export function readPlugin(_: IpcMainInvokeEvent, filename: string): string {
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
        throw new Error("Invalid plugin filename");
    }
    const filepath = join(getPluginsDir(), filename);
    if (!existsSync(filepath)) throw new Error("Plugin file not found");
    return readFileSync(filepath, "utf-8");
}

export function openPluginsDir(_: IpcMainInvokeEvent): void {
    shell.openPath(getPluginsDir());
}

export function getPluginsPath(_: IpcMainInvokeEvent): string {
    return getPluginsDir();
}

// ── Updater Integration ─────────────────────────────────────────────────────
// Override the git updater's UPDATE and BUILD IPC handlers so that:
//   UPDATE: reverts patched source files before `git pull` (prevents conflicts)
//   BUILD:  re-applies patches before building (so the output includes our UI)
//
// The updater registers its handlers in src/main/updater/git.ts, which runs
// BEFORE this module (import order in ipcMain.ts: "./updater" then "./ipcPlugins").
// By the time this code executes, the original handlers are already registered,
// so removeHandler + handle is safe.

if (!IS_UPDATER_DISABLED && !IS_STANDALONE) {
    const execFile = promisify(cpExecFile);
    const VENCORD_SRC_DIR = join(__dirname, "..");
    const isFlatpak = process.platform === "linux" && !!process.env.FLATPAK_ID;

    if (process.platform === "darwin")
        process.env.PATH = `/usr/local/bin:${process.env.PATH}`;

    function git(...args: string[]) {
        const opts = { cwd: VENCORD_SRC_DIR };
        if (isFlatpak) return execFile("flatpak-spawn", ["--host", "git", ...args], opts);
        return execFile("git", args, opts);
    }

    function wrapErrors(fn: (...args: any[]) => any) {
        return async function () {
            try {
                return { ok: true, value: await fn(...arguments) };
            } catch (e: any) {
                return {
                    ok: false,
                    error: e instanceof Error
                        ? { ...e, message: e.message, name: e.name, stack: e.stack }
                        : e,
                };
            }
        };
    }

    const PATCHED_FILES = [
        "src/components/settings/tabs/vencord/index.tsx",
        "src/components/settings/tabs/plugins/index.tsx",
        "src/components/settings/tabs/plugins/styles.css",
    ];

    try {
        // Override UPDATE → revert patched files, then pull
        ipcMain.removeHandler("VencordUpdate");
        ipcMain.handle("VencordUpdate", wrapErrors(async () => {
            await git("checkout", "--", ...PATCHED_FILES);
            const res = await git("pull");
            return res.stdout.includes("Fast-forward");
        }));

        // Override BUILD → apply patches, then build
        ipcMain.removeHandler("VencordBuild");
        ipcMain.handle("VencordBuild", wrapErrors(async () => {
            // Apply source patches
            const patchScript = join(
                VENCORD_SRC_DIR, "src", "userplugins", "pluginLoader", "apply-patches.mjs"
            );
            const nodeCmd = isFlatpak ? "flatpak-spawn" : "node";
            const nodeArgs = isFlatpak
                ? ["--host", "node", patchScript]
                : [patchScript];
            await execFile(nodeCmd, nodeArgs, { cwd: VENCORD_SRC_DIR });

            // Run the actual build
            const buildArgs = isFlatpak
                ? ["--host", "node", "scripts/build/build.mjs"]
                : ["scripts/build/build.mjs"];
            if (IS_DEV) buildArgs.push("--dev");

            const res = await execFile(nodeCmd, buildArgs, { cwd: VENCORD_SRC_DIR });
            return !res.stderr.includes("Build failed");
        }));

        console.log("[PluginLoader] Updater handlers overridden for External Plugins support");
    } catch (e) {
        console.error("[PluginLoader] Failed to override updater handlers:", e);
    }
}
