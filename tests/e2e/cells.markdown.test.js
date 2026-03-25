'use strict';
// E2E tests for markdown cell editing and rendering.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');
const { MOD } = require('./helpers/ui');

let app, window;
let mdCell; // locator for the markdown cell used throughout this file

test.beforeAll(async () => {
  ({ app, window } = await launchApp());

  // Add a fresh markdown cell at the end; the example notebook already has some.
  await window.locator('button[title="Add markdown cell"]').click();
  mdCell = window.locator('.cell.markdown-cell').last();
});

test.afterAll(async () => {
  await closeApp(app);
});

test('new markdown cell starts in edit mode (empty → editor visible)', async () => {
  await expect(mdCell.locator('.code-editor-wrap')).toBeVisible();
});

test('typing markdown content in the editor updates the draft', async () => {
  const editor = mdCell.locator('.cm-content');
  await editor.click();
  await window.keyboard.press(`${MOD}+a`);
  await window.keyboard.type('# Hello E2E\n\nThis is a **test** paragraph.');
  await expect(mdCell.locator('.cm-line').first()).toContainText('Hello E2E');
});

test('clicking OK commits the content and shows the rendered view', async () => {
  await mdCell.locator('.md-ok-btn').click();
  // Edit mode gone — rendered view appears
  await expect(mdCell.locator('.code-editor-wrap')).not.toBeVisible();
  await expect(mdCell.locator('.markdown-render')).toBeVisible();
});

test('rendered markdown shows an h1 for the # heading', async () => {
  await expect(mdCell.locator('.markdown-render h1')).toContainText('Hello E2E');
});

test('rendered markdown shows bold text for ** syntax', async () => {
  await expect(mdCell.locator('.markdown-render strong')).toContainText('test');
});

test('double-clicking the rendered view re-enters edit mode', async () => {
  await mdCell.locator('.markdown-render-wrap').dblclick();
  await expect(mdCell.locator('.code-editor-wrap')).toBeVisible();
});

test('pressing Escape cancels the edit and restores rendered content', async () => {
  // Type something different in the editor
  const editor = mdCell.locator('.cm-content');
  await editor.click();
  await window.keyboard.press(`${MOD}+a`);
  await window.keyboard.type('THIS SHOULD NOT APPEAR');
  await window.keyboard.press('Escape');
  // Edit mode should close and original content be shown
  await expect(mdCell.locator('.code-editor-wrap')).not.toBeVisible();
  await expect(mdCell.locator('.markdown-render h1')).toContainText('Hello E2E');
});

test('Ctrl+Enter commits the edit (same as OK button)', async () => {
  await mdCell.locator('.markdown-render-wrap').dblclick();
  const editor = mdCell.locator('.cm-content');
  await editor.click();
  await window.keyboard.press(`${MOD}+a`);
  await window.keyboard.type('## Updated via Ctrl+Enter');
  await window.keyboard.press('Control+Enter');
  await expect(mdCell.locator('.code-editor-wrap')).not.toBeVisible();
  await expect(mdCell.locator('.markdown-render h2')).toContainText('Updated via Ctrl+Enter');
});

test('Cancel button discards unsaved changes', async () => {
  await mdCell.locator('.markdown-render-wrap').dblclick();
  const editor = mdCell.locator('.cm-content');
  await editor.click();
  await window.keyboard.press(`${MOD}+a`);
  await window.keyboard.type('DISCARDED');
  await mdCell.locator('.md-cancel-btn').click();
  await expect(mdCell.locator('.markdown-render h2')).toContainText('Updated via Ctrl+Enter');
});

test('an empty markdown cell shows the placeholder text', async () => {
  // Add another fresh markdown cell
  await window.locator('button[title="Add markdown cell"]').click();
  const emptyMd = window.locator('.cell.markdown-cell').last();
  // Click OK without typing anything
  await emptyMd.locator('.md-ok-btn').click();
  await expect(emptyMd.locator('.markdown-placeholder')).toBeVisible();
});

test('existing notebook markdown cells are rendered (not in edit mode)', async () => {
  // All cells except a freshly-created empty one should be in rendered mode
  const cells = window.locator('.cell.markdown-cell');
  const count = await cells.count();
  // At least the first cell from the example notebook should be rendered
  await expect(cells.first().locator('.markdown-render')).toBeVisible();
  await expect(cells.first().locator('.code-editor-wrap')).not.toBeVisible();
  void count; // used implicitly
});
