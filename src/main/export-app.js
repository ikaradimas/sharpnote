'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Export the current notebook as a standalone app by copying
 * the SharpNote app bundle and injecting the notebook + config.
 */
function register(ipcMain, { app, dialog, mainWindow }) {
  ipcMain.handle('export-standalone-app', async (_ev, { notebookData, title, appName }) => {
    const name = (appName || title || 'Notebook').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Notebook';

    if (!app.isPackaged) {
      return { success: false, error: 'Export as App is only available in the packaged version of SharpNote.' };
    }

    // Ask for output directory
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Export as App — Choose Output Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) return { success: false };

    const outputDir = result.filePaths[0];

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

  // Provide platform info to the renderer
  ipcMain.handle('get-export-app-info', () => ({
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
  }));
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

  // Strip code signing (required after modification)
  try { execSync(`xattr -cr "${destApp}"`); } catch {}
  try { execSync(`codesign --remove-signature "${destApp}"`); } catch {}

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
