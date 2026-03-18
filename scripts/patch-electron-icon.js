#!/usr/bin/env node
'use strict';
// Replaces the Electron dev-binary icon so the custom >_ icon appears in the
// macOS Dock during development. Safe no-op on Windows/Linux and when the
// Electron bundle is not present (e.g. CI).
const fs   = require('fs');
const path = require('path');

if (process.platform !== 'darwin') process.exit(0);

const src = path.join(__dirname, '..', 'assets', 'icon.icns');
const dst = path.join(__dirname, '..', 'node_modules', 'electron', 'dist',
  'Electron.app', 'Contents', 'Resources', 'electron.icns');

if (!fs.existsSync(dst)) { console.log('patch-electron-icon: Electron bundle not found, skipping.'); process.exit(0); }
if (!fs.existsSync(src)) { console.log('patch-electron-icon: assets/icon.icns not found, skipping.'); process.exit(0); }

fs.copyFileSync(src, dst);
console.log('patch-electron-icon: Electron dev icon patched.');
