'use strict';
// Shared UI interaction helpers used across E2E test files.

const { expect } = require('@playwright/test');

/** Platform-aware modifier key (Meta on macOS, Control elsewhere). */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

// ── IPC helpers ───────────────────────────────────────────────────────────────

/**
 * Trigger a menu-bar action from the Electron main process.
 * This is the cleanest way to open dialogs that are normally
 * triggered by native menu items (Settings, About, Command Palette, …).
 *
 * @param {import('@playwright/test').ElectronApplication} app
 * @param {string} action  e.g. 'settings', 'about', 'command-palette'
 */
async function sendMenuAction(app, action) {
  await app.evaluate(({ BrowserWindow }, act) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('menu-action', act);
  }, action);
}

// ── Tools menu helpers ────────────────────────────────────────────────────────

/**
 * Open the Tools drop-down menu in the toolbar.
 * If the popup is already visible (left open by a previous togglePanel call),
 * this is a no-op — clicking again would toggle it closed.
 */
async function openToolsMenu(win) {
  const popup = win.locator('.tools-menu-popup');
  if (await popup.isVisible()) return;
  await win.locator('button.toolbar-icon-text-btn[title="Tools"]').click();
  await popup.waitFor({ state: 'visible' });
}

/**
 * Toggle a panel open/closed via the Tools menu.
 * Handles the portal-rendered popup correctly.
 *
 * @param {import('@playwright/test').Page} win
 * @param {string} label  e.g. 'Variables', 'Config', 'Logs'
 */
async function togglePanel(win, label) {
  await openToolsMenu(win);
  await win.locator('.tools-menu-item', { hasText: label }).click();
}

// ── Code editor helpers ───────────────────────────────────────────────────────

/**
 * Clear the content of the first code cell's editor and type new code.
 * Uses Cmd+A (macOS) / Ctrl+A (other) to select-all in CodeMirror first.
 *
 * @param {import('@playwright/test').Page} win
 * @param {string} code  Text to type as replacement
 */
async function clearAndType(win, code) {
  const editor = win.locator('.cell.code-cell').first().locator('.cm-content');
  await editor.click();
  await win.keyboard.press(`${MOD}+a`);
  await win.keyboard.type(code);
}

/**
 * Click the Run button on the first code cell and wait until execution finishes.
 */
async function runFirstCell(win) {
  const firstCell = win.locator('.cell.code-cell').first();
  await firstCell.locator('.run-btn').click();
  await expect(firstCell).not.toHaveClass(/running/, { timeout: 20_000 });
}

module.exports = { MOD, sendMenuAction, openToolsMenu, togglePanel, clearAndType, runFirstCell };
