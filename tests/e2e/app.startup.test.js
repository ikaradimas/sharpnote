'use strict';
// E2E tests that verify the UI loads correctly.
// These do NOT require a built kernel binary.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(app);
});

test('window opens and renderer loads', async () => {
  expect(window).toBeTruthy();
  await expect(window.locator('#root')).toBeAttached();
});

test('tab bar is visible', async () => {
  await expect(window.locator('.tab-bar')).toBeVisible();
});

test('at least one code cell is rendered', async () => {
  await expect(window.locator('.cell.code-cell').first()).toBeVisible();
});

test('CodeMirror editor is present inside the first cell', async () => {
  await expect(window.locator('.code-editor-wrap').first()).toBeVisible();
});

test('run button is present on the first cell', async () => {
  await expect(window.locator('.run-btn').first()).toBeVisible();
});

test('kernel status indicator is visible', async () => {
  await expect(window.locator('.kernel-status')).toBeVisible();
});

test('status bar is rendered', async () => {
  await expect(window.locator('.status-bar')).toBeVisible();
});

test('typing in the editor updates the cell content', async () => {
  const wrap   = window.locator('.code-editor-wrap').first();
  const editor = wrap.locator('.cm-content');
  await editor.click();
  // Ctrl+A moves to line start in CodeMirror on macOS; use Meta+A (Cmd+A) instead.
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await window.keyboard.press(`${mod}+a`);
  await window.keyboard.type('hello_unique_test_string');
  await expect(wrap.locator('.cm-line').first()).toContainText('hello_unique_test_string');
});
