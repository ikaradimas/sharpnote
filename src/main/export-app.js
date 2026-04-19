'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Export the current notebook as a standalone app by copying
 * the SharpNote app bundle and injecting the notebook + config.
 */
function register(ipcMain, { app, dialog, mainWindow }) {
  ipcMain.handle('export-standalone-app', async (_ev, { notebookData, title, appName, outputDir }) => {
    const name = (appName || title || 'Notebook').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Notebook';

    if (!app.isPackaged) {
      return { success: false, error: 'Export as App is only available in the packaged version of SharpNote.' };
    }

    if (!outputDir) {
      return { success: false, error: 'No output folder specified.' };
    }

    try {
      if (process.platform === 'darwin') {
        return exportMacOS(app, name, notebookData, outputDir);
      } else if (process.platform === 'win32') {
        return exportWindows(app, name, notebookData, outputDir);
      } else {
        return { success: false, error: `Unsupported platform: ${process.platform}` };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-export-app-info', () => ({
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    defaultOutputDir: app.getPath('desktop'),
  }));

  ipcMain.handle('pick-output-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Output Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return result.filePaths[0];
  });
}

function exportMacOS(app, appName, notebookData, outputDir) {
  // The running app is at: /path/to/SharpNote.app/Contents/Resources/app.asar
  // The .app bundle is 3 levels up from resourcesPath
  const appBundlePath = path.resolve(process.resourcesPath, '..', '..');
  const destApp = path.join(outputDir, `${appName}.app`);

  if (fs.existsSync(destApp)) {
    fs.rmSync(destApp, { recursive: true, force: true });
  }

  // Copy entire .app bundle
  execSync(`cp -R "${appBundlePath}" "${destApp}"`);

  // Inject notebook and standalone config into Resources
  const resourcesDir = path.join(destApp, 'Contents', 'Resources');
  fs.writeFileSync(
    path.join(resourcesDir, 'notebook.cnb'),
    JSON.stringify(notebookData, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(resourcesDir, 'standalone.json'),
    JSON.stringify({ notebook: 'notebook.cnb', title: appName }, null, 2),
    'utf-8'
  );

  // Update Info.plist to change the app name
  const plistPath = path.join(destApp, 'Contents', 'Info.plist');
  try {
    let plist = fs.readFileSync(plistPath, 'utf-8');
    plist = plist.replace(/<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/,
      `<key>CFBundleName</key>\n\t<string>${appName}</string>`);
    plist = plist.replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/,
      `<key>CFBundleDisplayName</key>\n\t<string>${appName}</string>`);
    fs.writeFileSync(plistPath, plist, 'utf-8');
  } catch {}

  // Clear quarantine xattrs
  try { execSync(`xattr -cr "${destApp}"`); } catch {}

  // Re-sign the Electron app with ad-hoc signatures, preserving entitlements.
  // V8 requires com.apple.security.cs.allow-jit for JIT compilation — without
  // it macOS kills the process with EXC_BREAKPOINT before any JS runs.
  try {
    const contentsDir = path.join(destApp, 'Contents');
    const frameworksDir = path.join(contentsDir, 'Frameworks');

    // Extract entitlements from the original app binary
    const mainExe = path.join(contentsDir, 'MacOS', 'SharpNote');
    let entitlementsFile = null;
    try {
      const entXml = execSync(
        `codesign -d --entitlements - --xml "${mainExe}" 2>/dev/null`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      if (entXml && entXml.includes('<!DOCTYPE plist')) {
        entitlementsFile = path.join(outputDir, '.tmp-entitlements.plist');
        fs.writeFileSync(entitlementsFile, entXml, 'utf-8');
      }
    } catch {}

    // If we couldn't extract entitlements, create minimal ones for Electron
    if (!entitlementsFile) {
      entitlementsFile = path.join(outputDir, '.tmp-entitlements.plist');
      fs.writeFileSync(entitlementsFile, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>`, 'utf-8');
    }

    const signWithEnt = (target) => {
      try {
        execSync(
          `codesign --force --sign - --entitlements "${entitlementsFile}" "${target}"`,
          { stdio: 'pipe' }
        );
      } catch {
        // Fallback: sign without entitlements (frameworks/dylibs don't need them)
        try { execSync(`codesign --force --sign - "${target}"`, { stdio: 'pipe' }); } catch {}
      }
    };

    const signPlain = (target) => {
      try { execSync(`codesign --force --sign - "${target}"`, { stdio: 'pipe' }); } catch {}
    };

    // 1. Sign frameworks and dylibs (no entitlements needed)
    if (fs.existsSync(frameworksDir)) {
      for (const entry of fs.readdirSync(frameworksDir)) {
        const full = path.join(frameworksDir, entry);
        if (entry.endsWith('.app')) continue; // helpers signed separately
        signPlain(full);
      }
    }

    // 2. Sign helper apps (need entitlements for JIT)
    if (fs.existsSync(frameworksDir)) {
      for (const entry of fs.readdirSync(frameworksDir)) {
        if (entry.endsWith('.app')) signWithEnt(path.join(frameworksDir, entry));
      }
    }

    // 3. Sign the main app bundle last (with entitlements)
    signWithEnt(destApp);

    // Cleanup
    try { fs.unlinkSync(entitlementsFile); } catch {}
  } catch {}

  return { success: true, filePath: destApp };
}

function exportWindows(app, appName, notebookData, outputDir) {
  // On Windows, the app directory is the parent of resources
  const appDir = path.resolve(process.resourcesPath, '..');
  const destDir = path.join(outputDir, appName);

  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }

  // Copy entire app directory
  copyDirSync(appDir, destDir);

  // Inject notebook and standalone config
  const resourcesDir = path.join(destDir, 'resources');
  fs.writeFileSync(
    path.join(resourcesDir, 'notebook.cnb'),
    JSON.stringify(notebookData, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(resourcesDir, 'standalone.json'),
    JSON.stringify({ notebook: 'notebook.cnb', title: appName }, null, 2),
    'utf-8'
  );

  // Rename the exe
  const exes = fs.readdirSync(destDir).filter(f => f.endsWith('.exe'));
  if (exes.length > 0) {
    const oldExe = path.join(destDir, exes[0]);
    const newExe = path.join(destDir, `${appName}.exe`);
    if (oldExe !== newExe) fs.renameSync(oldExe, newExe);
  }

  return { success: true, filePath: destDir };
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

module.exports = { register };
