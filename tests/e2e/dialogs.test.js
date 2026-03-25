'use strict';
// E2E tests for modal dialogs: About, Settings, Command Palette.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');
const { sendMenuAction } = require('./helpers/ui');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(app);
});

// ── About dialog ──────────────────────────────────────────────────────────────

test('About dialog opens via menu-action IPC', async () => {
  await sendMenuAction(app, 'about');
  await expect(window.locator('.about-dialog')).toBeVisible();
});

test('About dialog shows the app name "SharpNote"', async () => {
  await expect(window.locator('.about-name')).toHaveText('SharpNote');
});

test('About dialog shows a version number', async () => {
  const version = await window.locator('.about-version').textContent();
  // Should match semver-ish format: "v1.2.3"
  expect(version).toMatch(/^v\d+\.\d+\.\d+/);
});

test('About dialog lists stack items (e.g. Electron, React)', async () => {
  await expect(window.locator('.about-pill', { hasText: 'Electron' })).toBeVisible();
  await expect(window.locator('.about-pill', { hasText: 'React' })).toBeVisible();
});

test('clicking the overlay closes the About dialog', async () => {
  // The overlay is .quit-overlay (About reuses it); click outside the dialog box
  await window.locator('.quit-overlay').click({ position: { x: 10, y: 10 } });
  await expect(window.locator('.about-dialog')).not.toBeVisible();
});

// ── Settings dialog ───────────────────────────────────────────────────────────

test('Settings dialog opens via menu-action IPC', async () => {
  await sendMenuAction(app, 'settings');
  await expect(window.locator('.settings-dialog')).toBeVisible();
});

test('Settings dialog has a sidebar with category buttons', async () => {
  await expect(window.locator('.settings-dialog-sidebar')).toBeVisible();
  await expect(window.locator('.settings-section-btn').first()).toBeVisible();
});

test('Settings dialog has a main content area', async () => {
  await expect(window.locator('.settings-dialog-main')).toBeVisible();
});

test('Settings dialog closes via the X button', async () => {
  await window.locator('.settings-close-btn').click();
  await expect(window.locator('.settings-dialog')).not.toBeVisible();
});

test('Settings dialog can be reopened after closing', async () => {
  await sendMenuAction(app, 'settings');
  await expect(window.locator('.settings-dialog')).toBeVisible();
  await window.locator('.settings-close-btn').click();
});

test('clicking the settings overlay closes the dialog', async () => {
  await sendMenuAction(app, 'settings');
  await window.locator('.settings-overlay').click({ position: { x: 5, y: 5 } });
  await expect(window.locator('.settings-dialog')).not.toBeVisible();
});

// ── Command Palette ───────────────────────────────────────────────────────────

test('Command Palette opens via menu-action IPC', async () => {
  await sendMenuAction(app, 'command-palette');
  await expect(window.locator('.cmd-palette-overlay')).toBeVisible();
});

test('Command Palette input is immediately focused', async () => {
  await expect(window.locator('.cmd-palette-input')).toBeFocused();
});

test('Command Palette shows a list of commands on startup', async () => {
  await expect(window.locator('.cmd-palette-list')).toBeVisible();
  await expect(window.locator('.cmd-palette-item').first()).toBeVisible();
});

test('typing in Command Palette filters the results', async () => {
  await window.locator('.cmd-palette-input').fill('run');
  // At least one item should match "run"
  await expect(window.locator('.cmd-palette-item').first()).toBeVisible();
  const text = await window.locator('.cmd-palette-item').first().textContent();
  expect(text.toLowerCase()).toContain('run');
});

test('pressing Escape closes the Command Palette', async () => {
  await window.keyboard.press('Escape');
  await expect(window.locator('.cmd-palette-overlay')).not.toBeVisible();
});

test('clicking the overlay closes the Command Palette', async () => {
  await sendMenuAction(app, 'command-palette');
  await window.locator('.cmd-palette-overlay').click({ position: { x: 5, y: 5 } });
  await expect(window.locator('.cmd-palette-overlay')).not.toBeVisible();
});
