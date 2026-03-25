'use strict';
// E2E tests for the main toolbar.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');
const { openToolsMenu } = require('./helpers/ui');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(app);
});

test('toolbar is visible', async () => {
  await expect(window.locator('.toolbar')).toBeVisible();
});

test('notebook title is displayed', async () => {
  await expect(window.locator('.toolbar-title')).toBeVisible();
  // Default notebook has a name (either "Untitled Notebook" or a saved title)
  const text = await window.locator('.toolbar-title').textContent();
  expect(text.trim().length).toBeGreaterThan(0);
});

test('double-clicking the title enters rename mode', async () => {
  await window.locator('.toolbar-title').dblclick();
  await expect(window.locator('.toolbar-rename-input')).toBeVisible();
});

test('pressing Escape in rename mode restores the title', async () => {
  // Rename input should still be open from the previous test
  const original = await window.locator('.toolbar-rename-input').inputValue();
  await window.keyboard.press('Escape');
  await expect(window.locator('.toolbar-rename-input')).not.toBeVisible();
  await expect(window.locator('.toolbar-title')).toHaveText(original);
});

test('renaming via Enter commits the new name', async () => {
  await window.locator('.toolbar-title').dblclick();
  await expect(window.locator('.toolbar-rename-input')).toBeVisible();
  await window.locator('.toolbar-rename-input').fill('E2E Test Notebook');
  await window.keyboard.press('Enter');
  await expect(window.locator('.toolbar-title')).toHaveText('E2E Test Notebook');
});

test('"Run All" button exists in the toolbar', async () => {
  await expect(window.locator('.toolbar-run-all')).toBeVisible();
});

test('"Run All" button is disabled while kernel is not ready', async () => {
  // The kernel may still be starting; either way the button should reflect status
  const kernelText = await window.locator('.kernel-status span').textContent();
  const runAll     = window.locator('.toolbar-run-all');
  if (kernelText !== 'ready') {
    await expect(runAll).toBeDisabled();
  } else {
    await expect(runAll).not.toBeDisabled();
  }
});

test('"+ Code" button is in the toolbar', async () => {
  await expect(window.locator('button[title="Add code cell"]')).toBeVisible();
});

test('"+ Markdown" button is in the toolbar', async () => {
  await expect(window.locator('button[title="Add markdown cell"]')).toBeVisible();
});

test('Save and Open icon buttons are present', async () => {
  await expect(window.locator('button[title="Save notebook"]')).toBeVisible();
  await expect(window.locator('button[title="Open notebook"]')).toBeVisible();
});

test('kernel status indicator is visible', async () => {
  await expect(window.locator('.kernel-status')).toBeVisible();
  const text = await window.locator('.kernel-status span').textContent();
  expect(['ready', 'starting', 'error', 'stopped']).toContain(text.trim());
});

test('Tools button opens the panel dropdown', async () => {
  await openToolsMenu(window);
  await expect(window.locator('.tools-menu-popup')).toBeVisible();
});

test('Tools dropdown contains all expected panel items', async () => {
  // Menu may already be open from previous test; open again if not
  const popup = window.locator('.tools-menu-popup');
  if (!(await popup.isVisible())) await openToolsMenu(window);

  for (const label of ['Config', 'Packages', 'Logs', 'Database', 'Variables',
                        'Table of Contents', 'Library', 'File Explorer']) {
    await expect(popup.locator('.tools-menu-item', { hasText: label })).toBeVisible();
  }
});

test('clicking outside closes the Tools dropdown', async () => {
  const popup = window.locator('.tools-menu-popup');
  if (!(await popup.isVisible())) await openToolsMenu(window);

  // Click on a neutral area — the toolbar title group is safe
  await window.locator('.toolbar-title-group').click({ force: true }).catch(() => {
    // May fail if in rename mode; click body instead
    return window.locator('body').click({ position: { x: 10, y: 200 } });
  });
  await expect(popup).not.toBeVisible();
});
