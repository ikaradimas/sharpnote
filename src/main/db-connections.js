'use strict';

const path = require('path');
const fs   = require('fs');
const { safeStorage } = require('electron');

let _dbConnectionsPath = '';

// ── Encryption helpers ───────────────────────────────────────────────────────

function encryptField(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return value;
  return safeStorage.encryptString(value).toString('base64');
}

function decryptField(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return value;
  try { return safeStorage.decryptString(Buffer.from(value, 'base64')); }
  catch { return value; } // graceful fallback for unencrypted legacy data
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

  ipcMain.handle('db-connections-load', () => loadDbConnections());
  ipcMain.handle('db-connections-save', (_event, list) => saveDbConnections(list));
}

module.exports = { loadDbConnections, saveDbConnections, register };
