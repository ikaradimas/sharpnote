'use strict';
// E2E tests for the Variables panel.
// Requires a built kernel binary.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, kernelBuilt } = require('./helpers/electron');
const { clearAndType, runFirstCell, togglePanel } = require('./helpers/ui');

test.skip(!kernelBuilt(), 'kernel binary not found — run npm run build:kernel:mac first');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
  await expect(window.locator('.kernel-status span'))
    .toHaveText('ready', { timeout: 30_000 });

  // Open the Variables panel before any tests run
  await togglePanel(window, 'Variables');
  await expect(window.locator('.vars-panel')).toBeVisible();
});

test.afterAll(async () => {
  await closeApp(app);
});

test('Variables panel is visible', async () => {
  await expect(window.locator('.vars-panel')).toBeVisible();
});

test('Variables panel starts empty (or shows "no variables" state)', async () => {
  // Before any code is run, the panel should be empty or show a message
  const panel    = window.locator('.vars-panel');
  const rowCount = await panel.locator('tbody tr, .vars-row').count();
  if (rowCount === 0) {
    await expect(panel.locator('.vars-empty')).toBeVisible();
  }
  // Otherwise variables from prior runs exist — that's also fine
});

test('running code that declares a variable adds it to the panel', async () => {
  await clearAndType(window, 'var myNumber = 99;');
  await runFirstCell(window);
  // Wait for the vars_update to propagate
  await expect(window.locator('.vars-panel').locator('td', { hasText: 'myNumber' }))
    .toBeVisible({ timeout: 10_000 });
});

test('variable row shows the correct type', async () => {
  const row = window.locator('.vars-panel').locator('tr', { hasText: 'myNumber' });
  // Type column should show "Int32" (or "int")
  await expect(row.locator('td').nth(1)).toContainText('Int32');
});

test('variable row shows the correct value', async () => {
  const row = window.locator('.vars-panel').locator('tr', { hasText: 'myNumber' });
  await expect(row.locator('td').nth(2)).toContainText('99');
});

test('search box filters variables by name', async () => {
  // Add a second variable so there is something to filter
  await clearAndType(window, 'var anotherVar = "hello";');
  await runFirstCell(window);
  await expect(window.locator('.vars-panel td', { hasText: 'anotherVar' }))
    .toBeVisible({ timeout: 10_000 });

  await window.locator('.vars-search').fill('myNum');
  // myNumber should be visible, anotherVar should not
  await expect(window.locator('.vars-panel td', { hasText: 'myNumber' })).toBeVisible();
  await expect(window.locator('.vars-panel td', { hasText: 'anotherVar' })).not.toBeVisible();

  // Clear search
  await window.locator('.vars-search').fill('');
});

test('updating a variable updates its value in the panel', async () => {
  await clearAndType(window, 'myNumber = 200;');
  await runFirstCell(window);
  const row = window.locator('.vars-panel').locator('tr', { hasText: 'myNumber' });
  await expect(row.locator('td').nth(2)).toContainText('200', { timeout: 10_000 });
});

test('Variables panel can be closed via Tools menu', async () => {
  await togglePanel(window, 'Variables');
  await expect(window.locator('.vars-panel')).not.toBeVisible();
});
