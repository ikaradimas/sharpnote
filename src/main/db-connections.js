'use strict';

const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');

let _dbConnectionsPath = '';
let _key = null;

// ── Encryption helpers ───────────────────────────────────────────────────────
// AES-256-GCM with a key derived from the user's data directory path.
// The data directory is already protected by OS-level login; this adds a
// defence-in-depth layer so connection strings aren't stored as plaintext.
// No OS keychain interaction — zero password prompts.

function getKey(app) {
  if (_key) return _key;
  const material = _dbConnectionsPath || app?.getPath('userData') || os.homedir();
  _key = crypto.createHash('sha256').update(`sharpnote:${material}`).digest();
  return _key;
}

function encryptField(value) {
  const key = getKey();
  if (!key || !value) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptField(value, wasMarkedEncrypted) {
  const key = getKey();
  if (!key || !value) return value;
  try {
    const buf = Buffer.from(value, 'base64');
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    // If the record was marked encrypted but we can't decrypt it (e.g. it was
    // encrypted by a previous method like safeStorage), return empty rather than
    // passing garbled data to the DB provider.
    return wasMarkedEncrypted ? '' : value;
  }
}

// ── Load / Save ──────────────────────────────────────────────────────────────

function loadDbConnections(userDataPath) {
  if (userDataPath) _dbConnectionsPath = path.join(userDataPath, 'db-connections.json');
  try {
    const list = JSON.parse(fs.readFileSync(_dbConnectionsPath, 'utf-8'));
    return list.map((c) => ({
      ...c,
      connectionString: c.encrypted ? decryptField(c.connectionString, true) : (c.connectionString ?? ''),
    }));
  } catch {
    return [];
  }
}

function saveDbConnections(list, userDataPath) {
  if (userDataPath) _dbConnectionsPath = path.join(userDataPath, 'db-connections.json');
  try {
    const encrypted = list.map((c) => ({
      ...c,
      connectionString: encryptField(c.connectionString ?? ''),
      encrypted: true,
    }));
    fs.mkdirSync(path.dirname(_dbConnectionsPath), { recursive: true });
    fs.writeFileSync(_dbConnectionsPath, JSON.stringify(encrypted, null, 2), 'utf-8');
  } catch {}
}

function register(ipcMain, { app }) {
  const userDataPath = app.getPath('userData');
  _dbConnectionsPath = path.join(userDataPath, 'db-connections.json');
  getKey(app);

  ipcMain.handle('db-connections-load', () => loadDbConnections());
  ipcMain.handle('db-connections-save', (_event, list) => saveDbConnections(list));
}

module.exports = { loadDbConnections, saveDbConnections, register };
