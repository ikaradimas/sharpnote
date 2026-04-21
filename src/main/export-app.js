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

// Version 0x02: passphrase-based encryption (PBKDF2 + AES-256-GCM)
function derivePassphraseKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha512');
}

function encryptSettingsWithPassphrase(settingsObj, passphrase) {
  const salt = crypto.randomBytes(16);
  const key = derivePassphraseKey(passphrase, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = JSON.stringify(settingsObj);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([0x02]), salt, iv, tag, enc]).toString('base64');
}

function decryptSettingsWithPassphrase(base64Blob, passphrase) {
  const buf = Buffer.from(base64Blob, 'base64');
  if (buf[0] !== 0x02) return null;
  const salt = buf.subarray(1, 17);
  const iv = buf.subarray(17, 29);
  const tag = buf.subarray(29, 45);
  const enc = buf.subarray(45);
  const key = derivePassphraseKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = decipher.update(enc, undefined, 'utf8') + decipher.final('utf8');
  return JSON.parse(plaintext);
}

// ── Secret stripping ────────────────────────────────────────────────────────
function stripSecretsFromSettings(settings) {
  const stripped = { ...settings };
  // Strip DB connection strings
  if (Array.isArray(stripped.dbConnections)) {
    stripped.dbConnections = stripped.dbConnections.map(c => ({
      ...c, connectionString: '', stripped: true
    }));
  }
  // Strip API saved auth tokens
  if (Array.isArray(stripped.apiSaved)) {
    stripped.apiSaved = stripped.apiSaved.map(a => {
      const clean = { ...a };
      if (clean.auth) clean.auth = { type: clean.auth.type || 'none', stripped: true };
      return clean;
    });
  }
  return stripped;
}

function decryptSettings(base64Blob, notebookJson) {
  const buf = Buffer.from(base64Blob, 'base64');
  const version = buf[0];
  if (version === 0x02) return { needsPassphrase: true };
  if (version !== 0x01) return null;
  const key = deriveSettingsKey(notebookJson);
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
  ipcMain.handle('export-standalone-app', async (_ev, { notebookData, title, appName, outputDir, appSettings, passphrase, stripSecrets }) => {
    const name = (appName || title || 'Notebook').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Notebook';

    if (!app.isPackaged) {
      return { success: false, error: 'Export as App is only available in the packaged version of SharpNote.' };
    }

    if (!outputDir) {
      return { success: false, error: 'No output folder specified.' };
    }

    try {
      if (process.platform === 'darwin') {
        return exportMacOS(app, name, notebookData, appSettings, outputDir, passphrase, stripSecrets);
      } else if (process.platform === 'win32') {
        return exportWindows(app, name, notebookData, appSettings, outputDir, passphrase, stripSecrets);
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

function writeStandaloneData(dataDir, appName, notebookData, appSettings, passphrase, stripSecrets) {
  fs.mkdirSync(dataDir, { recursive: true });

  const notebookJson = JSON.stringify(notebookData, null, 2);
  fs.writeFileSync(path.join(dataDir, 'notebook.cnb'), notebookJson, 'utf-8');

  const hasSettings = !!appSettings;
  const hasPassphrase = !!passphrase;

  fs.writeFileSync(
    path.join(dataDir, 'standalone.json'),
    JSON.stringify({ notebook: 'notebook.cnb', title: appName, hasSettings, hasPassphrase }, null, 2),
    'utf-8'
  );

  // Encrypt and write settings if provided
  if (appSettings && typeof appSettings === 'object') {
    try {
      let settingsToEncrypt = appSettings;
      if (stripSecrets) settingsToEncrypt = stripSecretsFromSettings(settingsToEncrypt);

      const encrypted = passphrase
        ? encryptSettingsWithPassphrase(settingsToEncrypt, passphrase)
        : encryptSettings(settingsToEncrypt, notebookJson);
      fs.writeFileSync(path.join(dataDir, 'settings.enc'), encrypted, 'utf-8');
    } catch {}
  }
}

function exportMacOS(app, appName, notebookData, appSettings, outputDir, passphrase, stripSecrets) {
  const appBundlePath = path.resolve(process.resourcesPath, '..', '..');
  const destApp = path.join(outputDir, `${appName}.app`);
  const dataDir = path.join(outputDir, `${appName}.app.standalone`);

  if (fs.existsSync(destApp)) fs.rmSync(destApp, { recursive: true, force: true });
  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });

  execSync(`ditto "${appBundlePath}" "${destApp}"`);
  try { execSync(`xattr -cr "${destApp}"`); } catch {}

  writeStandaloneData(dataDir, appName, notebookData, appSettings, passphrase, stripSecrets);

  return { success: true, filePath: destApp };
}

function exportWindows(app, appName, notebookData, appSettings, outputDir, passphrase, stripSecrets) {
  const appDir = path.resolve(process.resourcesPath, '..');
  const destDir = path.join(outputDir, appName);

  if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });

  copyDirSync(appDir, destDir);

  const resourcesDir = path.join(destDir, 'resources');
  writeStandaloneData(resourcesDir, appName, notebookData, appSettings, passphrase, stripSecrets);

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

module.exports = { register, decryptSettings, decryptSettingsWithPassphrase, SETTINGS_SALT, deriveSettingsKey };
