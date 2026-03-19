'use strict';

const path = require('path');
const fs   = require('fs');

const MAX_RECENTS = 12;

let _recentFiles = [];
let _userDataPath = '';

function loadRecentFiles(userDataPath) {
  _userDataPath = userDataPath;
  const recentFilesPath = path.join(userDataPath, 'recent-files.json');
  try {
    _recentFiles = JSON.parse(fs.readFileSync(recentFilesPath, 'utf-8'));
  } catch {
    _recentFiles = [];
  }
}

function saveRecentFiles() {
  const recentFilesPath = path.join(_userDataPath, 'recent-files.json');
  try {
    fs.mkdirSync(path.dirname(recentFilesPath), { recursive: true });
    fs.writeFileSync(recentFilesPath, JSON.stringify(_recentFiles, null, 2), 'utf-8');
  } catch {}
}

// addRecentFile requires app and Menu (and buildMenu fn) at call time.
// Those are injected via init().
let _app = null;
let _getBuildMenu = null;
let _Menu = null;

function init({ app, Menu, getBuildMenu }) {
  _app = app;
  _Menu = Menu;
  _getBuildMenu = getBuildMenu;
}

function addRecentFile(filePath) {
  _recentFiles = _recentFiles.filter((r) => r.path !== filePath);
  _recentFiles.unshift({ path: filePath, name: path.basename(filePath), date: new Date().toISOString() });
  _recentFiles = _recentFiles.slice(0, MAX_RECENTS);
  saveRecentFiles();
  try { if (_app) _app.addRecentDocument(filePath); } catch {}
  if (_Menu && _getBuildMenu) _Menu.setApplicationMenu(_getBuildMenu());
}

function getRecentFiles() {
  return _recentFiles;
}

function clearRecentFiles() {
  _recentFiles = [];
}

module.exports = {
  MAX_RECENTS,
  loadRecentFiles,
  saveRecentFiles,
  addRecentFile,
  getRecentFiles,
  clearRecentFiles,
  init,
};
