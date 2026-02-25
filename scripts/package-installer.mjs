#!/usr/bin/env node

/**
 * Vencord Custom Installer — Packager
 *
 * Builds Vencord (standalone, with External Plugins patches and auto-updater)
 * and creates a distributable installer package.
 *
 * The HTTP updater fetches releases from the VENCORD_REMOTE repository
 * (Kittywy/Vencord by default). Push to that fork → GitHub Actions builds
 * and publishes a release → friends' Vencord auto-updates.
 *
 * Usage:
 *   node scripts/package-installer.mjs [--skip-build]
 *
 * Output:
 *   dist/VencordCustomInstaller/
 *     ├── dist/                    (patcher.js, preload.js, renderer.js, ...)
 *     ├── Install Vencord.exe      (WinForms GUI installer)
 *     └── install.bat              (batch fallback)
 */

import { execSync, execFileSync } from "child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const STAGING = join(DIST, "VencordCustomInstaller");
const STAGING_DIST = join(STAGING, "dist");

const VENCORD_REMOTE = process.env.VENCORD_REMOTE || "Kittywy/Vencord";
const skipBuild = process.argv.includes("--skip-build");

// ── 1. Build ────────────────────────────────────────────────────────────────

if (!skipBuild) {
    console.log("=== Building Vencord ===\n");

    // Ensure patches are applied
    console.log("Applying External Plugins patches...");
    execSync("node src/userplugins/pluginLoader/apply-patches.mjs", {
        cwd: ROOT,
        stdio: "inherit",
    });

    console.log(`\nBuilding standalone (remote: ${VENCORD_REMOTE})...`);
    execSync("pnpm build --standalone", {
        cwd: ROOT,
        stdio: "inherit",
        env: { ...process.env, VENCORD_REMOTE },
    });
} else {
    console.log("Skipping build (--skip-build)");
}

// Verify dist files exist
const REQUIRED_FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];
for (const f of REQUIRED_FILES) {
    if (!existsSync(join(DIST, f))) {
        console.error(`Missing dist/${f}. Run without --skip-build.`);
        process.exit(1);
    }
}

// ── 2. Create staging directory ─────────────────────────────────────────────

console.log("\n=== Packaging installer ===\n");

if (existsSync(STAGING)) {
    rmSync(STAGING, { recursive: true });
}
mkdirSync(STAGING_DIST, { recursive: true });

// Copy dist files
const distFiles = readdirSync(DIST).filter(f =>
    f.endsWith(".js") || f.endsWith(".css") || f.endsWith(".js.map") || f.endsWith(".css.map")
);

for (const f of distFiles) {
    const fullPath = join(DIST, f);
    if (existsSync(fullPath) && statSync(fullPath).isDirectory()) continue;
    copyFileSync(fullPath, join(STAGING_DIST, f));
    console.log(`  dist/${f}`);
}

// ── 3. Generate install.bat (fallback) ──────────────────────────────────────

const batContent = `@echo off
chcp 65001 >nul 2>&1
title Vencord Custom Installer
echo ============================================
echo   Vencord Custom Installer
echo   (with External Plugins support)
echo ============================================
echo.

REM ── Copy dist files ──
set "VENCORD_DIR=%APPDATA%\\Vencord"
set "DEST=%VENCORD_DIR%\\dist"
echo Copying Vencord files to %DEST%...
if not exist "%DEST%" mkdir "%DEST%"
xcopy /Y /Q "%~dp0dist\\*" "%DEST%\\" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy files!
    pause
    exit /b 1
)
echo   OK
echo.

REM ── Find Discord ──
set "DISCORD_BASE=%LOCALAPPDATA%\\Discord"
if not exist "%DISCORD_BASE%" (
    echo [ERROR] Discord not found at %DISCORD_BASE%
    echo Make sure Discord Desktop is installed.
    pause
    exit /b 1
)

REM Find latest app-* version
set "LATEST_APP="
for /d %%d in ("%DISCORD_BASE%\\app-*") do set "LATEST_APP=%%d"

if "%LATEST_APP%"=="" (
    echo [ERROR] No Discord app versions found!
    pause
    exit /b 1
)

set "RESOURCES=%LATEST_APP%\\resources"
set "APP_ASAR=%RESOURCES%\\app.asar"
set "BACKUP_ASAR=%RESOURCES%\\_app.asar"

echo Found Discord: %LATEST_APP%

REM ── Patch Discord ──
echo.
echo Patching Discord...

PowerShell -ExecutionPolicy Bypass -Command ^
    "$distDir = '%DEST%'.Replace('\\\\','\\');" ^
    "$patcherPath = (Join-Path $distDir 'patcher.js').Replace('\\','\\\\');" ^
    "$indexJs = 'require(\"' + $patcherPath + '\")';" ^
    "$packageJson = '{\"name\":\"discord\",\"main\":\"index.js\"}';" ^
    "$header = '{\"files\":{\"index.js\":{\"size\":' + $indexJs.Length + ',\"offset\":\"0\"},\"package.json\":{\"size\":' + $packageJson.Length + ',\"offset\":\"' + $indexJs.Length + '\"}}}';" ^
    "$headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header);" ^
    "$hLen = $headerBytes.Length;" ^
    "$padLen = (($hLen + 3) -band (-bnot 3)) - $hLen;" ^
    "$appAsar = '%APP_ASAR%';" ^
    "$backupAsar = '%BACKUP_ASAR%';" ^
    "if (!(Test-Path $backupAsar) -and (Test-Path $appAsar)) { Move-Item $appAsar $backupAsar -Force };" ^
    "$fs = [System.IO.File]::Create($appAsar);" ^
    "$bw = New-Object System.IO.BinaryWriter($fs);" ^
    "$bw.Write([uint32]4);" ^
    "$bw.Write([uint32]($hLen + $padLen + 8));" ^
    "$bw.Write([uint32]($hLen + $padLen + 4));" ^
    "$bw.Write([uint32]$hLen);" ^
    "$bw.Write($headerBytes);" ^
    "if ($padLen -gt 0) { $bw.Write((New-Object byte[] $padLen)) };" ^
    "$bw.Write([System.Text.Encoding]::UTF8.GetBytes($indexJs));" ^
    "$bw.Write([System.Text.Encoding]::UTF8.GetBytes($packageJson));" ^
    "$bw.Close(); $fs.Close();" ^
    "Write-Host '  OK'"

if errorlevel 1 (
    echo [ERROR] Patching failed!
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Installation complete!
echo   Restart Discord to apply changes.
echo ============================================
echo.
pause
`;

writeFileSync(join(STAGING, "install.bat"), batContent, "utf-8");
console.log("  install.bat");

// ── 4. Compile self-contained GUI installer ─────────────────────────────────
//        Dist files are embedded as .NET resources inside the exe.

const csSourcePath = join(__dirname, "installer-gui.cs");

if (!existsSync(csSourcePath)) {
    console.error("\n  [ERROR] scripts/installer-gui.cs not found!");
    process.exit(1);
}

// Try to compile with csc.exe (.NET Framework 4.0)
const cscPaths = [
    join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
];

const EMBED_FILES = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];

let compiled = false;
for (const csc of cscPaths) {
    if (!existsSync(csc)) continue;

    const exePath = join(STAGING, "Install Vencord.exe");

    // Build /resource: flags — embed each dist file with its filename as the resource name
    const resourceArgs = EMBED_FILES.map(f => `/resource:${join(DIST, f)},${f}`);

    try {
        console.log(`\nCompiling self-contained installer with ${csc}...`);
        execFileSync(csc, [
            "/nologo",
            "/optimize+",
            "/target:winexe",
            "/platform:anycpu",
            "/r:System.Windows.Forms.dll",
            "/r:System.Drawing.dll",
            ...resourceArgs,
            `/out:${exePath}`,
            csSourcePath,
        ], { stdio: "pipe" });

        const size = statSync(exePath).size;
        console.log(`  Install Vencord.exe (${(size / 1024).toFixed(0)} KB)`);
        compiled = true;
        break;
    } catch (e) {
        console.error(`  Compilation failed: ${e.message}`);
    }
}

if (!compiled) {
    console.log("\n  [WARN] Could not compile .exe (csc.exe not found).");
    console.log("  The .bat installer is still available.");
}

// ── 5. Summary ──────────────────────────────────────────────────────────────

console.log("\n=== Done ===\n");
console.log(`Output: ${STAGING}`);
console.log(`Updater remote: ${VENCORD_REMOTE}`);
console.log("\nContents:");
for (const f of readdirSync(STAGING)) {
    const fullPath = join(STAGING, f);
    const isDir = existsSync(fullPath) && statSync(fullPath).isDirectory();
    console.log(`  ${isDir ? f + "/" : f}`);
    if (isDir) {
        for (const sub of readdirSync(fullPath)) {
            console.log(`    ${sub}`);
        }
    }
}

console.log("\nTo distribute:");
console.log("  Send 'Install Vencord.exe' to your friend — it's fully self-contained.");
console.log("  Auto-updates come from: https://github.com/" + VENCORD_REMOTE);
