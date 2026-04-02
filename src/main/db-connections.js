'use strict';

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const { safeStorage } = require('electron');

let _dbConnectionsPath = '';
let _key = null; // cached AES key derived from a single safeStorage call

// ── Encryption helpers ───────────────────────────────────────────────────────

// Derives an AES-256 key from a single safeStorage call, then caches it.
// Only the first call touches the OS keychain; everything after is in-memory.
function getKey() {
  if (_key) return _key;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = safeStorage.encryptString('sharpnote-db-key');
  _key = crypto.createHash('sha256').update(encrypted).digest();
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

function decryptField(value) {
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
    return value; // graceful fallback for unencrypted legacy data
  }
}

// ── Load / Save ──────────────────────────────────────────────────────────────

function loadDbConnections(userDataPath) {
  if (userDataPath) _dbConnectionsPath = path.join(userDataPath, 'db-connections.json');
  try {
    const list = JSON.parse(fs.readFileSync(_dbConnectionsPath, 'utf-8'));
    return list.map((c) => ({
      ...c,
      connectionString: c.encrypted ? decryptField(c.connectionString) : (c.connectionString ?? ''),
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

  // Prime the key derivation so the single keychain prompt happens early,
  // before any renderer IPC arrives.
  getKey();

  ipcMain.handle('db-connections-load', () => loadDbConnections());
  ipcMain.handle('db-connections-save', (_event, list) => saveDbConnections(list));
}

module.exports = { loadDbConnections, saveDbConnections, register };
