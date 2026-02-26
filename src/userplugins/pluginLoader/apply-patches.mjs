#!/usr/bin/env node

/**
 * External Plugins — source patcher
 *
 * Applies UI patches to Vencord source files so that External Plugins controls
 * (toggles, buttons, filters) appear in the settings tabs.
 *
 * Idempotent — safe to run multiple times. Skips already-applied patches.
 * Called automatically by the overridden updater (native.ts) and git post-merge hook.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..");

// ── Patch Definitions ──────────────────────────────────────────────────────────
// Each entry: { file, patches: [{ name, find, replace }] }
// `find` must be an exact substring of the UPSTREAM file.
// `replace` is what it becomes after patching.
//
// If `replace` is already present → skip (already patched).
// If `find` is not found → fail (upstream changed the target code).

const PATCH_SETS = [
    // ── Vencord Settings Tab ────────────────────────────────────────────────
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        patches: [
            {
                name: "Import PluginsIcon",
                find: `import { FolderIcon, GithubIcon, LogIcon, PaintbrushIcon, RestartIcon } from "@components/Icons";`,
                replace: `import { FolderIcon, GithubIcon, LogIcon, PaintbrushIcon, PluginsIcon, RestartIcon } from "@components/Icons";`,
            },
            {
                name: "Add pluginLoaderEnabled setting hook",
                find: [
                    `    const settings = useSettings(["useQuickCss", "enableReactDevtools", "frameless", "winNativeTitleBar", "transparent", "winCtrlQ", "disableMinSize"]);`,
                    ``,
                    `    const Switches = [`,
                ].join("\n"),
                replace: [
                    `    const settings = useSettings(["useQuickCss", "enableReactDevtools", "frameless", "winNativeTitleBar", "transparent", "winCtrlQ", "disableMinSize"]);`,
                    `    const pluginLoaderEnabled = useSettings(["plugins.PluginLoader.loadExternalPlugins"]).plugins.PluginLoader.loadExternalPlugins as boolean ?? true;`,
                    ``,
                    `    const Switches = [`,
                ].join("\n"),
            },
            {
                name: "Wrap Switches return in Fragment + add External Plugins toggle",
                find: [
                    `    return Switches.map(setting => {`,
                    `        if (!setting) {`,
                    `            return null;`,
                    `        }`,
                    ``,
                    `        const { key, title, description, restartRequired } = setting;`,
                    ``,
                    `        return (`,
                    `            <FormSwitch`,
                    `                key={key}`,
                    `                title={title}`,
                    `                description={description}`,
                    `                value={settings[key]}`,
                    `                onChange={v => {`,
                    `                    settings[key] = v;`,
                    ``,
                    `                    if (restartRequired) {`,
                    `                        Alerts.show({`,
                    `                            title: "Restart Required",`,
                    `                            body: "A restart is required to apply this change",`,
                    `                            confirmText: "Restart now",`,
                    `                            cancelText: "Later!",`,
                    `                            onConfirm: relaunch`,
                    `                        });`,
                    `                    }`,
                    `                }}`,
                    `            />`,
                    `        );`,
                    `    });`,
                    `}`,
                ].join("\n"),
                replace: [
                    `    return (`,
                    `        <>`,
                    `            {Switches.map(setting => {`,
                    `                if (!setting) {`,
                    `                    return null;`,
                    `                }`,
                    ``,
                    `                const { key, title, description, restartRequired } = setting;`,
                    ``,
                    `                return (`,
                    `                    <FormSwitch`,
                    `                        key={key}`,
                    `                        title={title}`,
                    `                        description={description}`,
                    `                        value={settings[key]}`,
                    `                        onChange={v => {`,
                    `                            settings[key] = v;`,
                    ``,
                    `                            if (restartRequired) {`,
                    `                                Alerts.show({`,
                    `                                    title: "Restart Required",`,
                    `                                    body: "A restart is required to apply this change",`,
                    `                                    confirmText: "Restart now",`,
                    `                                    cancelText: "Later!",`,
                    `                                    onConfirm: relaunch`,
                    `                                });`,
                    `                            }`,
                    `                        }}`,
                    `                    />`,
                    `                );`,
                    `            })}`,
                    `            <FormSwitch`,
                    `                key="externalPlugins"`,
                    `                title="Enable External Plugins"`,
                    `                description="Load .js plugins from the plugins folder"`,
                    `                value={pluginLoaderEnabled}`,
                    `                onChange={v => {`,
                    `                    Vencord.Settings.plugins.PluginLoader.loadExternalPlugins = v;`,
                    `                    Alerts.show({`,
                    `                        title: "Restart Required",`,
                    `                        body: "A restart is required to apply this change",`,
                    `                        confirmText: "Restart now",`,
                    `                        cancelText: "Later!",`,
                    `                        onConfirm: relaunch`,
                    `                    });`,
                    `                }}`,
                    `            />`,
                    `        </>`,
                    `    );`,
                    `}`,
                ].join("\n"),
            },
            {
                name: "Add Open Plugins Folder QuickAction",
                find: [
                    `                    <QuickAction`,
                    `                        Icon={GithubIcon}`,
                    `                        text="View Source Code"`,
                    `                        action={() => VencordNative.native.openExternal("https://github.com/" + gitRemote)}`,
                    `                    />`,
                    `                </QuickActionCard>`,
                ].join("\n"),
                replace: [
                    `                    <QuickAction`,
                    `                        Icon={GithubIcon}`,
                    `                        text="View Source Code"`,
                    `                        action={() => VencordNative.native.openExternal("https://github.com/" + gitRemote)}`,
                    `                    />`,
                    `                    <QuickAction`,
                    `                        Icon={PluginsIcon}`,
                    `                        text="Open Plugins Folder"`,
                    `                        action={() => VencordNative.pluginHelpers.PluginLoader.openPluginsDir()}`,
                    `                    />`,
                    `                </QuickActionCard>`,
                ].join("\n"),
            },
        ],
    },

    // ── Plugins Settings Tab ────────────────────────────────────────────────
    {
        file: "src/components/settings/tabs/plugins/index.tsx",
        patches: [
            {
                name: "Import showToast and Toasts",
                find: [
                    `import { Alerts, Button, lodash, Parser, React, Select, TextInput, Tooltip, useMemo, useState } from "@webpack/common";`,
                    `import { JSX } from "react";`,
                ].join("\n"),
                replace: [
                    `import { Alerts, Button, lodash, Parser, React, Select, TextInput, Tooltip, useMemo, useState } from "@webpack/common";`,
                    `import { showToast, Toasts } from "@webpack/common";`,
                    `import { JSX } from "react";`,
                ].join("\n"),
            },
            {
                name: "Add onReloadPlugins prop to ReloadRequiredCard",
                find: `function ReloadRequiredCard({ required }: { required: boolean; }) {`,
                replace: `function ReloadRequiredCard({ required, onReloadPlugins }: { required: boolean; onReloadPlugins?: () => void; }) {`,
            },
            {
                name: "Add Reload Local Plugins button",
                find: [
                    `                    <Paragraph>Plugins with a cog wheel have settings you can modify!</Paragraph>`,
                    `                    </>`,
                ].join("\n"),
                replace: [
                    `                    <Paragraph>Plugins with a cog wheel have settings you can modify!</Paragraph>`,
                    `                        {onReloadPlugins && (`,
                    `                            <Button`,
                    `                                size={Button.Sizes.SMALL}`,
                    `                                onClick={onReloadPlugins}`,
                    `                                className={cl("restart-button")}`,
                    `                            >`,
                    `                                Reload Local Plugins`,
                    `                            </Button>`,
                    `                        )}`,
                    `                    </>`,
                ].join("\n"),
            },
            {
                name: "Add reloadCount reducer",
                find: [
                    `    const changes = useMemo(() => new ChangeList<string>(), []);`,
                    ``,
                    `    useCleanupEffect`,
                ].join("\n"),
                replace: [
                    `    const changes = useMemo(() => new ChangeList<string>(), []);`,
                    `    const [reloadCount, forceReload] = React.useReducer((x: number) => x + 1, 0);`,
                    ``,
                    `    useCleanupEffect`,
                ].join("\n"),
            },
            {
                name: "Update sortedPlugins useMemo dependency",
                find: [
                    `        Object.values(Plugins).sort((a, b) => a.name.localeCompare(b.name)),`,
                    `        []`,
                    `    );`,
                ].join("\n"),
                replace: [
                    `        Object.values(Plugins).sort((a, b) => a.name.localeCompare(b.name)),`,
                    `        [reloadCount]`,
                    `    );`,
                ].join("\n"),
            },
            {
                name: "Update hasUserPlugins useMemo dependency",
                find: `Object.values(PluginMeta).some(m => m.userPlugin), []);`,
                replace: `Object.values(PluginMeta).some(m => m.userPlugin), [reloadCount]);`,
            },
            {
                name: "Add onReloadPlugins to ReloadRequiredCard usage",
                find: `            <ReloadRequiredCard required={changes.hasChanges} />`,
                replace: [
                    `            <ReloadRequiredCard`,
                    `                required={changes.hasChanges}`,
                    `                onReloadPlugins={"PluginLoader" in Plugins ? async () => {`,
                    `                    try {`,
                    `                        const loader = (Plugins as Record<string, any>)["PluginLoader"];`,
                    `                        if (!loader?.stop || !loader?.start) return;`,
                    `                        loader.stop();`,
                    `                        await loader.start();`,
                    `                        forceReload();`,
                    `                        showToast("Local plugins reloaded", Toasts.Type.SUCCESS);`,
                    `                    } catch (e) {`,
                    `                        showToast("Failed to reload plugins", Toasts.Type.FAILURE);`,
                    `                        logger.error("Failed to reload local plugins:", e);`,
                    `                    }`,
                    `                } : undefined}`,
                    `            />`,
                ].join("\n"),
            },
            {
                name: "Add LOCAL_PLUGINS to SearchStatus enum",
                find: [
                    `    USER_PLUGINS,`,
                    `    API_PLUGINS`,
                ].join("\n"),
                replace: [
                    `    USER_PLUGINS,`,
                    `    LOCAL_PLUGINS,`,
                    `    API_PLUGINS`,
                ].join("\n"),
            },
            {
                name: "Add hasLocalPlugins memo",
                find: `const hasUserPlugins = useMemo(() => !IS_STANDALONE && Object.values(PluginMeta).some(m => m.userPlugin), [reloadCount]);`,
                replace: [
                    `const hasUserPlugins = useMemo(() => !IS_STANDALONE && Object.values(PluginMeta).some(m => m.userPlugin), [reloadCount]);`,
                    `    const hasLocalPlugins = useMemo(() => Object.values(PluginMeta).some(m => (m as any).externalPlugin), [reloadCount]);`,
                ].join("\n"),
            },
            {
                name: "Add LOCAL_PLUGINS filter case",
                find: [
                    `            case SearchStatus.USER_PLUGINS:`,
                    `                if (!PluginMeta[plugin.name]?.userPlugin) return false;`,
                    `                break;`,
                    `            case SearchStatus.API_PLUGINS:`,
                ].join("\n"),
                replace: [
                    `            case SearchStatus.USER_PLUGINS:`,
                    `                if (!PluginMeta[plugin.name]?.userPlugin) return false;`,
                    `                break;`,
                    `            case SearchStatus.LOCAL_PLUGINS:`,
                    `                if (!(PluginMeta[plugin.name] as any)?.externalPlugin) return false;`,
                    `                break;`,
                    `            case SearchStatus.API_PLUGINS:`,
                ].join("\n"),
            },
            {
                name: "Add Show Local Plugins dropdown option",
                find: [
                    `                                hasUserPlugins && { label: "Show UserPlugins", value: SearchStatus.USER_PLUGINS },`,
                    `                                { label: "Show API Plugins", value: SearchStatus.API_PLUGINS },`,
                ].join("\n"),
                replace: [
                    `                                hasUserPlugins && { label: "Show UserPlugins", value: SearchStatus.USER_PLUGINS },`,
                    `                                hasLocalPlugins && { label: "Show Local Plugins", value: SearchStatus.LOCAL_PLUGINS },`,
                    `                                { label: "Show API Plugins", value: SearchStatus.API_PLUGINS },`,
                ].join("\n"),
            },
        ],
    },

    // ── Plugins Styles ──────────────────────────────────────────────────────
    {
        file: "src/components/settings/tabs/plugins/styles.css",
        patches: [
            {
                name: "Remove fixed height from info card",
                find: [
                    `.vc-plugins-info-card {`,
                    `    padding: 1em;`,
                    `    height: 8em;`,
                    `    display: flex;`,
                ].join("\n"),
                replace: [
                    `.vc-plugins-info-card {`,
                    `    padding: 1em;`,
                    `    display: flex;`,
                ].join("\n"),
            },
        ],
    },
];

// ── Main ────────────────────────────────────────────────────────────────────

let totalApplied = 0;
let totalSkipped = 0;
let totalFailed = 0;

for (const { file, patches } of PATCH_SETS) {
    const filePath = join(ROOT, file);

    if (!existsSync(filePath)) {
        console.error(`[MISS] ${file} — file not found`);
        totalFailed += patches.length;
        continue;
    }

    console.log(`\n${file}:`);
    let content = readFileSync(filePath, "utf-8");

    // Normalize line endings for reliable matching
    const hadCRLF = content.includes("\r\n");
    content = content.replace(/\r\n/g, "\n");

    let modified = false;

    for (const { name, find, replace } of patches) {
        // Already applied?
        if (find !== replace && content.includes(replace)) {
            console.log(`  [SKIP] ${name}`);
            totalSkipped++;
            continue;
        }

        // Find target
        if (!content.includes(find)) {
            console.error(`  [FAIL] ${name} — pattern not found`);
            totalFailed++;
            continue;
        }

        content = content.replace(find, replace);
        console.log(`  [ OK ] ${name}`);
        totalApplied++;
        modified = true;
    }

    if (modified) {
        // Restore original line endings
        if (hadCRLF) {
            content = content.replace(/\n/g, "\r\n");
        }
        writeFileSync(filePath, content, "utf-8");
    }
}

console.log(`\nDone: ${totalApplied} applied, ${totalSkipped} skipped, ${totalFailed} failed`);

if (totalFailed > 0) {
    console.error("\nSome patches failed to apply. This usually means upstream Vencord");
    console.error("changed the target files. Update the patches in:");
    console.error("  src/userplugins/pluginLoader/apply-patches.mjs");
    process.exit(1);
}
