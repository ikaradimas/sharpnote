'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Export the current notebook as a standalone app.
 *
 * macOS: Creates a wrapper .app bundle containing a small launcher script
 * that runs the real SharpNote binary with the notebook path. The original
 * Electron binary and its signature are never modified — they're symlinked.
 *
 * Windows: Copies the app directory and injects notebook + config.
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
  // Strategy: copy the ENTIRE .app bundle byte-for-byte with ditto
  // (preserves code signature perfectly), then place standalone config
  // and notebook OUTSIDE the signed bundle in a sibling directory.
  //
  // Structure:
  //   MyApp.app/                     ← exact copy of SharpNote.app (signature intact)
  //   MyApp.app.standalone/          ← data directory (outside signed bundle)
  //     standalone.json
  //     notebook.cnb
  //
  // main.js checks for this sibling directory on startup.

  const appBundlePath = path.resolve(process.resourcesPath, '..', '..');
  const destApp = path.join(outputDir, `${appName}.app`);
  const dataDir = path.join(outputDir, `${appName}.app.standalone`);

  if (fs.existsSync(destApp)) fs.rmSync(destApp, { recursive: true, force: true });
  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });

  // Copy the .app bundle exactly — signature stays valid
  execSync(`ditto "${appBundlePath}" "${destApp}"`);

  // Clear quarantine (doesn't break the signature)
  try { execSync(`xattr -cr "${destApp}"`); } catch {}

  // Write standalone data OUTSIDE the bundle
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'notebook.cnb'),
    JSON.stringify(notebookData, null, 2),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(dataDir, 'standalone.json'),
    JSON.stringify({ notebook: 'notebook.cnb', title: appName }, null, 2),
    'utf-8'
  );

  return { success: true, filePath: destApp };
}

function exportWindows(app, appName, notebookData, outputDir) {
  const appDir = path.resolve(process.resourcesPath, '..');
  const destDir = path.join(outputDir, appName);

  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });

  copyDirSync(appDir, destDir);

  // On Windows, put data inside resources (no signing issues)
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
