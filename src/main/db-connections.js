'use strict';

const path = require('path');
const fs   = require('fs');

let _dbConnectionsPath = '';

function loadDbConnections(userDataPath) {
  if (userDataPath) _dbConnectionsPath = path.join(userDataPath, 'db-connections.json');
  try {
    return JSON.parse(fs.readFileSync(_dbConnectionsPath, 'utf-8'));
  } catch {
    return [];
  }
}

function saveDbConnections(list, userDataPath) {
  if (userDataPath) _dbConnectionsPath = path.join(userDataPath, 'db-connections.json');
  try {
    fs.mkdirSync(path.dirname(_dbConnectionsPath), { recursive: true });
    fs.writeFileSync(_dbConnectionsPath, JSON.stringify(list, null, 2), 'utf-8');
  } catch {}
}

function register(ipcMain, { app }) {
  const userDataPath = app.getPath('userData');
  _dbConnectionsPath = path.join(userDataPath, 'db-connections.json');

  ipcMain.handle('db-connections-load', () => loadDbConnections());
  ipcMain.handle('db-connections-save', (_event, list) => saveDbConnections(list));
}

module.exports = { loadDbConnections, saveDbConnections, register };
