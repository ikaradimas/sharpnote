'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ── Settings encryption ─────────────────────────────────────────────────────
// Settings are encrypted with AES-256-GCM. The key is derived from a SHA-256
// hash of the notebook content + a fixed salt. This ties the settings to the
// specific notebook — only the bundled app (which has the notebook) can decrypt.
// The output is base64(salt + iv + authTag + ciphertext).

const SETTINGS_SALT = 'sharpnote-viewer-settings-v1';

function deriveSettingsKey(notebookJson) {
  const material = SETTINGS_SALT + ':' + crypto.createHash('sha256').update(notebookJson).digest('hex');
  return crypto.createHash('sha256').update(material).digest();
}

function encryptSettings(settingsObj, notebookJson) {
  const key = deriveSettingsKey(notebookJson);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(settingsObj);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Prepend a version byte (0x01) for future format changes
  return Buffer.concat([Buffer.from([0x01]), iv, tag, enc]).toString('base64');
}

function decryptSettings(base64Blob, notebookJson) {
  const key = deriveSettingsKey(notebookJson);
  const buf = Buffer.from(base64Blob, 'base64');
  const version = buf[0];
  if (version !== 0x01) return null;
  const iv = buf.subarray(1, 13);
  const tag = buf.subarray(13, 29);
  const enc = buf.subarray(29);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = decipher.update(enc, undefined, 'utf8') + decipher.final('utf8');
  return JSON.parse(plaintext);
}

// ── Export ────────────────────────────────────────────────────────────────────

function register(ipcMain, { app, dialog, mainWindow }) {
  ipcMain.handle('export-standalone-app', async (_ev, { notebookData, title, appName, outputDir, appSettings }) => {
    const name = (appName || title || 'Notebook').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Notebook';

    if (!app.isPackaged) {
      return { success: false, error: 'Export as App is only available in the packaged version of SharpNote.' };
    }

    if (!outputDir) {
      return { success: false, error: 'No output folder specified.' };
    }

    try {
      if (process.platform === 'darwin') {
        return exportMacOS(app, name, notebookData, appSettings, outputDir);
      } else if (process.platform === 'win32') {
        return exportWindows(app, name, notebookData, appSettings, outputDir);
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

function writeStandaloneData(dataDir, appName, notebookData, appSettings) {
  fs.mkdirSync(dataDir, { recursive: true });

  const notebookJson = JSON.stringify(notebookData, null, 2);
  fs.writeFileSync(path.join(dataDir, 'notebook.cnb'), notebookJson, 'utf-8');

  fs.writeFileSync(
    path.join(dataDir, 'standalone.json'),
    JSON.stringify({ notebook: 'notebook.cnb', title: appName, hasSettings: !!appSettings }, null, 2),
    'utf-8'
  );

  // Encrypt and write settings if provided
  if (appSettings && typeof appSettings === 'object') {
    try {
      const encrypted = encryptSettings(appSettings, notebookJson);
      fs.writeFileSync(path.join(dataDir, 'settings.enc'), encrypted, 'utf-8');
    } catch {}
  }
}

function exportMacOS(app, appName, notebookData, appSettings, outputDir) {
  const appBundlePath = path.resolve(process.resourcesPath, '..', '..');
  const destApp = path.join(outputDir, `${appName}.app`);
  const dataDir = path.join(outputDir, `${appName}.app.standalone`);

  if (fs.existsSync(destApp)) fs.rmSync(destApp, { recursive: true, force: true });
  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });

  execSync(`ditto "${appBundlePath}" "${destApp}"`);
  try { execSync(`xattr -cr "${destApp}"`); } catch {}

  writeStandaloneData(dataDir, appName, notebookData, appSettings);

  return { success: true, filePath: destApp };
}

function exportWindows(app, appName, notebookData, appSettings, outputDir) {
  const appDir = path.resolve(process.resourcesPath, '..');
  const destDir = path.join(outputDir, appName);

  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });

  copyDirSync(appDir, destDir);

  const resourcesDir = path.join(destDir, 'resources');
  writeStandaloneData(resourcesDir, appName, notebookData, appSettings);

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

module.exports = { register, decryptSettings, SETTINGS_SALT, deriveSettingsKey };
