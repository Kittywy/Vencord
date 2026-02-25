# Vencord + External Plugins

A fork of [Vencord](https://github.com/Vendicated/Vencord) with **External Plugins** support — load custom `.js` plugins without rebuilding Vencord.

## What's different?

Regular Vencord requires you to clone the repo, place your plugin source into `src/userplugins/`, and rebuild the entire project with Node.js every time you want to add or update a plugin.

**This fork adds a simpler approach:**

1. Drop a `.js` plugin file into `%APPDATA%\Vencord\plugins\`
2. Toggle it in Settings → Plugins
3. Done. No Node.js, no building, no terminal commands.

Plugins are loaded at runtime and can be enabled, disabled, or replaced without touching the Vencord source code.

## Installing

### For regular users

1. Download the latest [installer release](https://github.com/Kittywy/Vencord/releases)
2. Unzip and run `Install Vencord.exe`
3. Restart Discord

The installer copies Vencord files and patches Discord automatically. Updates are delivered through the built-in Vencord updater (Settings → Updater).

### For developers

```bash
git clone https://github.com/Kittywy/Vencord.git
cd Vencord
pnpm install
pnpm build
pnpm inject
```

## Adding External Plugins

1. Open the plugins folder: **Settings → Vencord → Open Plugins Folder** (or navigate to `%APPDATA%\Vencord\plugins\`)
2. Place any `.js` plugin file there
3. Go to **Settings → Plugins**, click **Reload Local Plugins**
4. Enable the plugin and restart Discord if prompted

## Auto-Updates

This fork includes a working auto-updater. When a new version is pushed here, the updater in Discord will notify you and apply the update — no manual steps required.

## Credits

- [Vendicated](https://github.com/Vendicated) and the [Vencord](https://github.com/Vendicated/Vencord) contributors for the original project
- All 100+ built-in Vencord plugins are included as-is

## Disclaimer

Discord is a trademark of Discord Inc. and is solely mentioned for the sake of descriptivity.
Mention of it does not imply any affiliation with or endorsement by Discord Inc.

Client modifications are against Discord's Terms of Service. Use at your own risk.
