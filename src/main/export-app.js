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

  // Copy entire .app bundle using ditto (preserves symlinks, hardlinks,
  // resource forks, and extended attributes that cp -R can break in
  // Electron's framework structure)
  execSync(`ditto "${appBundlePath}" "${destApp}"`);

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

  // Re-sign the entire app bundle with ad-hoc signature + entitlements.
  // V8 requires com.apple.security.cs.allow-jit for JIT compilation.
  // We write a minimal entitlements plist, then use electron-osx-sign's
  // recommended approach: sign each Mach-O inside the bundle individually.
  const entFile = path.join(outputDir, '.tmp-entitlements.plist');
  fs.writeFileSync(entFile, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>`, 'utf-8');

  try {
    // Find every Mach-O binary and .dylib inside the bundle and sign them
    // bottom-up (deepest first, then outer bundles, then the .app last).
    // This is the only reliable way to sign an Electron app ad-hoc.
    const findOutput = execSync(
      `find "${destApp}" -type f \\( -name "*.dylib" -o -perm +111 \\) | sort -r`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    ).trim();

    for (const binPath of findOutput.split('\n').filter(Boolean)) {
      // Check if it's actually a Mach-O binary (not a script/text file)
      try {
        const fileType = execSync(`file -b "${binPath}"`, { encoding: 'utf-8' }).trim();
        if (!fileType.includes('Mach-O') && !binPath.endsWith('.dylib')) continue;
      } catch { continue; }

      try {
        execSync(
          `codesign --force --sign - --entitlements "${entFile}" --timestamp=none "${binPath}"`,
          { stdio: 'pipe' }
        );
      } catch {}
    }

    // Sign each .framework bundle
    const frameworksDir = path.join(destApp, 'Contents', 'Frameworks');
    if (fs.existsSync(frameworksDir)) {
      for (const entry of fs.readdirSync(frameworksDir)) {
        if (entry.endsWith('.framework')) {
          try {
            execSync(
              `codesign --force --sign - --entitlements "${entFile}" --timestamp=none "${path.join(frameworksDir, entry)}"`,
              { stdio: 'pipe' }
            );
          } catch {}
        }
      }
      // Sign helper .app bundles
      for (const entry of fs.readdirSync(frameworksDir)) {
        if (entry.endsWith('.app')) {
          try {
            execSync(
              `codesign --force --sign - --entitlements "${entFile}" --timestamp=none "${path.join(frameworksDir, entry)}"`,
              { stdio: 'pipe' }
            );
          } catch {}
        }
      }
    }

    // Sign the main .app bundle last
    execSync(
      `codesign --force --sign - --entitlements "${entFile}" --timestamp=none "${destApp}"`,
      { stdio: 'pipe' }
    );
  } catch {}

  try { fs.unlinkSync(entFile); } catch {}

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
