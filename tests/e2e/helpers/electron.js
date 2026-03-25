'use strict';
// Shared helpers for launching and closing the Electron app in E2E tests.

const { _electron: electron } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const ROOT         = path.resolve(__dirname, '../../..');
const KERNEL_PATHS = [
  path.join(ROOT, 'kernel', 'bin', 'osx-arm64', 'kernel'),
  path.join(ROOT, 'kernel', 'bin', 'osx-x64',  'kernel'),
  path.join(ROOT, 'kernel', 'bin', 'win-x64',  'kernel.exe'),
];

/**
 * Returns true when at least one kernel binary exists in kernel/bin/.
 * Execution tests should skip when this returns false.
 */
function kernelBuilt() {
  return KERNEL_PATHS.some((p) => fs.existsSync(p));
}

/**
 * Launch the SharpNote Electron app and return { app, window }.
 *
 * opts.env — extra environment variables merged on top of process.env.
 */
async function launchApp(opts = {}) {
  const app = await electron.launch({
    args: [ROOT],
    env: { ...process.env, ...opts.env },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window };
}

/**
 * Close the Electron app cleanly (bypasses the quit-confirmation dialog).
 */
async function closeApp(app) {
  // Mark allowQuit via the main-process API so the window-close handler
  // doesn't preventDefault and swallow the exit.
  try {
    await app.evaluate(({ app }) => app.exit(0));
  } catch {
    // The process may have already gone away — that's fine.
  }
}

module.exports = { launchApp, closeApp, kernelBuilt };
