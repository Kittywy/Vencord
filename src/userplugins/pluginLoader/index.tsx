/*
 * Vencord, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * PluginLoader — injects external .js plugins from %APPDATA%/Vencord/plugins/
 * directly into the native Vencord plugin registry.
 */

import { definePluginSettings, Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";
import definePlugin, { OptionType } from "@utils/types";

import { PluginMeta } from "~plugins";

const Native = VencordNative.pluginHelpers.PluginLoader as PluginNative<typeof import("./native")>;
const logger = new Logger("PluginLoader");

// Track which files we loaded so we can clean up on stop()
const loadedFiles = new Map<string, string>(); // filename → pluginName

export const pluginLoaderSettings = definePluginSettings({
    loadExternalPlugins: {
        type: OptionType.BOOLEAN,
        description: "Load external .js plugins from the plugins folder",
        default: true,
        restartNeeded: true,
    },
});

export async function openPluginsFolder() {
    await Native.openPluginsDir();
}

export default definePlugin({
    name: "PluginLoader",
    description: "Loads external .js plugins from the plugins folder into the native plugin list",
    authors: [{ name: "badcode", id: 0n }],
    hidden: true,
    required: true,
    settings: pluginLoaderSettings,

    async start() {
        if (!pluginLoaderSettings.store.loadExternalPlugins) {
            logger.info("External plugins disabled by user");
            return;
        }

        try {
            const files = await Native.listPlugins();
            const Plugins = Vencord.Plugins.plugins as Record<string, any>;

            for (const file of files) {
                try {
                    const code = await Native.readPlugin(file.name);
                    // Plugin files are wrapped in ({...}) expression
                    const def = (0, eval)(code);

                    if (!def || typeof def !== "object" || !def.name) {
                        logger.error(`${file.name}: invalid format — must be ({name, ...})`);
                        continue;
                    }

                    // Normalize authors to Vencord format
                    if (!def.authors) {
                        def.authors = [{ name: def.author ?? "Unknown", id: 0n }];
                    }

                    // External plugins cannot have webpack patches
                    def.patches = undefined;
                    def.started = false;

                    // Inject into native plugin registry
                    Plugins[def.name] = def;
                    loadedFiles.set(file.name, def.name);

                    // Inject into PluginMeta so they appear under "User Plugins" filter
                    // and the modal doesn't crash trying to read folderName
                    (PluginMeta as Record<string, any>)[def.name] = {
                        folderName: file.name,
                        userPlugin: true,
                    };

                    // Auto-start if user previously enabled this plugin
                    if (Settings.plugins[def.name]?.enabled) {
                        try {
                            def.start?.();
                            def.started = true;
                            logger.info(`Started: ${def.name}`);
                        } catch (e) {
                            logger.error(`Failed to start ${def.name}:`, e);
                        }
                    } else {
                        logger.info(`Loaded (disabled): ${def.name}`);
                    }
                } catch (e) {
                    logger.error(`Failed to load ${file.name}:`, e);
                }
            }

            logger.info(`Loaded ${loadedFiles.size} external plugin(s)`);
        } catch (e) {
            logger.error("Failed to initialize:", e);
        }
    },

    stop() {
        const Plugins = Vencord.Plugins.plugins as Record<string, any>;

        for (const [, pluginName] of loadedFiles) {
            try {
                const plugin = Plugins[pluginName];
                if (plugin?.started) {
                    plugin.stop?.();
                    plugin.started = false;
                }
                delete Plugins[pluginName];
                delete (PluginMeta as Record<string, any>)[pluginName];
            } catch (e) {
                logger.error(`Failed to cleanup ${pluginName}:`, e);
            }
        }

        loadedFiles.clear();
        logger.info("All external plugins unloaded");
    },
});
