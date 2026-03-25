'use strict';
// E2E tests for the tab bar.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, mockNativeDialog, restoreNativeDialog } = require('./helpers/electron');
const { MOD } = require('./helpers/ui');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(app);
});

test('tab bar is visible', async () => {
  await expect(window.locator('.tab-bar')).toBeVisible();
});

test('at least one tab is shown on startup', async () => {
  const count = await window.locator('.tab').count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test('one tab is marked active', async () => {
  await expect(window.locator('.tab.tab-active')).toHaveCount(1);
});

test('"+" new-notebook button is in the tab bar', async () => {
  await expect(window.locator('.tab-new')).toBeVisible();
});

test('clicking "+" creates a second tab', async () => {
  // "New Notebook" triggers a native dialog — mock it to pick "Blank" (index 1)
  // so the test doesn't block on an OS dialog box.
  await mockNativeDialog(app, 1);
  const before = await window.locator('.tab').count();
  await window.locator('.tab-new').click();
  await expect(window.locator('.tab')).toHaveCount(before + 1);
  await restoreNativeDialog(app);
});

test('new tab becomes the active tab', async () => {
  // The most recently created tab should be active
  const tabs       = window.locator('.tab');
  const count      = await tabs.count();
  const lastTab    = tabs.nth(count - 1);
  await expect(lastTab).toHaveClass(/tab-active/);
});

test('clicking a different tab activates it', async () => {
  // Click the first tab (not the one we just created)
  const firstTab = window.locator('.tab').first();
  await firstTab.click();
  await expect(firstTab).toHaveClass(/tab-active/);
});

test('active tab shows a tab-title', async () => {
  const activeTitle = window.locator('.tab.tab-active .tab-title');
  await expect(activeTitle).toBeVisible();
  const text = await activeTitle.textContent();
  expect(text.trim().length).toBeGreaterThan(0);
});

test('tab shows dirty indicator after content changes', async () => {
  // Type something in the editor to make the notebook dirty
  const editor = window.locator('.cm-content').first();
  await editor.click();
  await window.keyboard.press(`${MOD}+a`);
  await window.keyboard.type('// dirty-test');
  // Active tab should now show the dirty dot
  await expect(window.locator('.tab.tab-active .tab-dirty')).toBeVisible();
});

test('tab can be renamed via double-click on its title', async () => {
  const activeTab = window.locator('.tab.tab-active');
  await activeTab.locator('.tab-title').dblclick();
  const input = activeTab.locator('.tab-rename-input');
  await expect(input).toBeVisible();
  await input.fill('Renamed Tab');
  await window.keyboard.press('Enter');
  await expect(activeTab.locator('.tab-title')).toHaveText('Renamed Tab');
});

test('tab color button opens the color picker', async () => {
  const colorBtn = window.locator('.tab.tab-active .tab-color-btn');
  await expect(colorBtn).toBeVisible();
  await colorBtn.click();
  await expect(window.locator('.tab-color-picker')).toBeVisible();
});

test('clicking a color swatch applies it to the tab', async () => {
  const swatch = window.locator('.tab-color-swatch').nth(1); // first non-clear swatch
  await swatch.click();
  // Picker should close after selection
  await expect(window.locator('.tab-color-picker')).not.toBeVisible();
  // Color button should now have the "has-color" class
  await expect(window.locator('.tab.tab-active .tab-color-btn.has-color')).toBeVisible();
});

test('tab close button removes the tab', async () => {
  // Close the last tab (the extra blank one we created earlier).
  // There must be ≥ 2 tabs for this to be meaningful — the earlier "+" test
  // guarantees a second tab exists if it passed.
  const before = await window.locator('.tab').count();
  if (before < 2) {
    // Safety: re-create if the previous test was skipped
    await mockNativeDialog(app, 1);
    await window.locator('.tab-new').click();
    await restoreNativeDialog(app);
    await expect(window.locator('.tab')).toHaveCount(2);
  }
  const lastTab = window.locator('.tab').last();
  await lastTab.locator('.tab-close').click();
  await expect(window.locator('.tab')).toHaveCount(before < 2 ? 1 : before - 1);
});
