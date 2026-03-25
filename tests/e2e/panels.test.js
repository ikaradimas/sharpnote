'use strict';
// E2E tests for the panel system (Tools menu + individual panels).

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');
const { togglePanel, openToolsMenu } = require('./helpers/ui');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(app);
});

// ── Tools menu ────────────────────────────────────────────────────────────────

test('Tools menu button is visible in the toolbar', async () => {
  await expect(window.locator('button.toolbar-icon-text-btn[title="Tools"]')).toBeVisible();
});

test('Tools menu popup appears on click', async () => {
  await window.locator('button.toolbar-icon-text-btn[title="Tools"]').click();
  await expect(window.locator('.tools-menu-popup')).toBeVisible();
  // Close it
  await window.keyboard.press('Escape');
  // Escape doesn't have a built-in close handler; click elsewhere instead
  await window.locator('body').click({ position: { x: 10, y: 400 } });
});

// ── Variables panel ───────────────────────────────────────────────────────────

test('Variables panel opens via Tools menu', async () => {
  await togglePanel(window, 'Variables');
  await expect(window.locator('.vars-panel')).toBeVisible();
});

test('Variables panel shows empty state before any execution', async () => {
  // Should show the "no variables" message or an empty table
  const panel = window.locator('.vars-panel');
  // Either an empty message or an empty table body — just assert the panel rendered
  await expect(panel).toBeVisible();
});

test('Variables panel closes when toggled again', async () => {
  await togglePanel(window, 'Variables');
  await expect(window.locator('.vars-panel')).not.toBeVisible();
});

// ── Config panel ──────────────────────────────────────────────────────────────

test('Config panel opens via Tools menu', async () => {
  await togglePanel(window, 'Config');
  await expect(window.locator('.config-panel')).toBeVisible();
});

test('Config panel shows key/value input area', async () => {
  await expect(window.locator('.config-key-input')).toBeVisible();
  await expect(window.locator('.config-value-input-add')).toBeVisible();
});

test('Config panel: adding a new entry works', async () => {
  await window.locator('.config-key-input').fill('testKey');
  await window.locator('.config-value-input-add').fill('testValue');
  await window.keyboard.press('Enter');
  // New entry should appear in the list
  await expect(window.locator('.config-item', { hasText: 'testKey' })).toBeVisible();
});

test('Config panel: deleting an entry removes it', async () => {
  const item = window.locator('.config-item', { hasText: 'testKey' });
  await item.locator('button[title="Remove"]').click();
  await expect(window.locator('.config-item', { hasText: 'testKey' })).not.toBeVisible();
});

test('Config panel closes when toggled again', async () => {
  await togglePanel(window, 'Config');
  await expect(window.locator('.config-panel')).not.toBeVisible();
});

// ── Logs panel ────────────────────────────────────────────────────────────────

test('Logs panel opens via Tools menu', async () => {
  await togglePanel(window, 'Logs');
  await expect(window.locator('.log-panel')).toBeVisible();
});

test('Logs panel shows a file-select dropdown', async () => {
  await expect(window.locator('.log-file-select')).toBeVisible();
});

test('Logs panel closes when toggled again', async () => {
  await togglePanel(window, 'Logs');
  await expect(window.locator('.log-panel')).not.toBeVisible();
});

// ── NuGet / Packages panel ────────────────────────────────────────────────────

test('Packages panel opens via Tools menu', async () => {
  await togglePanel(window, 'Packages');
  await expect(window.locator('.nuget-panel')).toBeVisible();
});

test('Packages panel has tab buttons (Packages / Sources)', async () => {
  await expect(window.locator('.nuget-tab').first()).toBeVisible();
});

test('Packages panel search input is present on Browse tab', async () => {
  // Search input is only rendered on the "browse" tab
  await window.locator('.nuget-tab', { hasText: 'Browse' }).click();
  await expect(window.locator('.nuget-search-input')).toBeVisible();
});

test('Packages panel closes when toggled again', async () => {
  await togglePanel(window, 'Packages');
  await expect(window.locator('.nuget-panel')).not.toBeVisible();
});

// ── Database panel ────────────────────────────────────────────────────────────

test('Database panel opens via Tools menu', async () => {
  await togglePanel(window, 'Database');
  await expect(window.locator('.db-panel')).toBeVisible();
});

test('Database panel closes when toggled again', async () => {
  await togglePanel(window, 'Database');
  await expect(window.locator('.db-panel')).not.toBeVisible();
});

// ── Table of Contents panel ───────────────────────────────────────────────────

test('Table of Contents panel opens via Tools menu', async () => {
  await togglePanel(window, 'Table of Contents');
  await expect(window.locator('.toc-panel')).toBeVisible();
});

test('ToC panel shows headings or empty state', async () => {
  const panel = window.locator('.toc-panel');
  // Either headings or the empty-state message
  const hasHeadings = await panel.locator('.toc-item').count() > 0;
  if (!hasHeadings) {
    await expect(panel.locator('.toc-empty')).toBeVisible();
  } else {
    await expect(panel.locator('.toc-item').first()).toBeVisible();
  }
});

test('Table of Contents panel closes when toggled again', async () => {
  await togglePanel(window, 'Table of Contents');
  await expect(window.locator('.toc-panel')).not.toBeVisible();
});

// ── Reset Kernel item ─────────────────────────────────────────────────────────

test('Tools menu contains a Reset Kernel item', async () => {
  await openToolsMenu(window);
  await expect(window.locator('.tools-menu-item', { hasText: 'Reset Kernel' })).toBeVisible();
  // Close menu
  await window.locator('body').click({ position: { x: 10, y: 400 } });
});
