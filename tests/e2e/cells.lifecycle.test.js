'use strict';
// E2E tests for code-cell lifecycle: add, move, lock, delete.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(app);
});

// ── Initial state ─────────────────────────────────────────────────────────────

test('at least one code cell exists on startup', async () => {
  await expect(window.locator('.cell.code-cell').first()).toBeVisible();
});

test('cells show index badges', async () => {
  await expect(window.locator('.cell-index-badge').first()).toBeVisible();
  await expect(window.locator('.cell-index-badge').first()).toHaveText('1');
});

test('first cell shows the C# language label', async () => {
  await expect(window.locator('.cell.code-cell').first().locator('.cell-lang-label'))
    .toHaveText('C#');
});

// ── Adding cells ──────────────────────────────────────────────────────────────

test('"+ Code" button appends a new code cell', async () => {
  const before = await window.locator('.cell.code-cell').count();
  await window.locator('button[title="Add code cell"]').click();
  await expect(window.locator('.cell.code-cell')).toHaveCount(before + 1);
});

test('newly added code cell gets the next index badge', async () => {
  const count = await window.locator('.cell').count();
  await expect(window.locator('.cell-index-badge').last()).toHaveText(String(count));
});

test('"+ Markdown" button appends a new markdown cell', async () => {
  const before = await window.locator('.cell.markdown-cell').count();
  await window.locator('button[title="Add markdown cell"]').click();
  await expect(window.locator('.cell.markdown-cell')).toHaveCount(before + 1);
});

test('new markdown cell starts in edit mode', async () => {
  // The newly created (empty) markdown cell should show the CodeMirror editor
  const lastMd = window.locator('.cell.markdown-cell').last();
  await expect(lastMd.locator('.code-editor-wrap')).toBeVisible();
});

// ── Output mode ───────────────────────────────────────────────────────────────

test('output mode selector defaults to "auto"', async () => {
  await expect(window.locator('.cell.code-cell').first().locator('.output-mode-select'))
    .toHaveValue('auto');
});

test('output mode selector accepts "text"', async () => {
  const sel = window.locator('.cell.code-cell').first().locator('.output-mode-select');
  await sel.selectOption('text');
  await expect(sel).toHaveValue('text');
  // Reset
  await sel.selectOption('auto');
});

// ── Cell controls ─────────────────────────────────────────────────────────────

test('run button is visible on each code cell', async () => {
  const cells = window.locator('.cell.code-cell');
  const count = await cells.count();
  for (let i = 0; i < Math.min(count, 3); i++) {
    await expect(cells.nth(i).locator('.run-btn')).toBeVisible();
  }
});

test('move-up button is present on the second code cell', async () => {
  const second = window.locator('.cell.code-cell').nth(1);
  await expect(second.locator('.cell-ctrl-btn[title="Move Up"]')).toBeVisible();
});

test('move-down button is present on the first code cell', async () => {
  const first = window.locator('.cell.code-cell').first();
  await expect(first.locator('.cell-ctrl-btn[title="Move Down"]')).toBeVisible();
});

test('move-down reorders cells', async () => {
  const cells  = window.locator('.cell.code-cell');
  const before = await cells.first().locator('.cell-id-label').textContent();
  await cells.first().locator('.cell-ctrl-btn[title="Move Down"]').click();
  // After moving down the second cell now has the old first cell's ID
  const after = await cells.nth(1).locator('.cell-id-label').textContent();
  expect(after).toBe(before);
  // Move it back so state is consistent for the rest of the tests
  await cells.nth(1).locator('.cell-ctrl-btn[title="Move Up"]').click();
});

// ── Cell locking ──────────────────────────────────────────────────────────────

test('lock button is present in the cell footer', async () => {
  await expect(window.locator('.cell.code-cell').first().locator('.cell-lock-btn'))
    .toBeVisible();
});

test('clicking lock toggles the locked state', async () => {
  const firstCell = window.locator('.cell.code-cell').first();
  const lockBtn   = firstCell.locator('.cell-lock-btn');

  // Lock it
  await lockBtn.click();
  await expect(firstCell).toHaveClass(/cell-locked/);

  // Unlock it
  await firstCell.locator('.cell-lock-btn-on').click();
  await expect(firstCell).not.toHaveClass(/cell-locked/);
});

// ── Cell deletion ─────────────────────────────────────────────────────────────

test('delete button shows a confirmation prompt', async () => {
  // Add a disposable cell first so we don't wreck the notebook
  await window.locator('button[title="Add code cell"]').click();
  const lastCell = window.locator('.cell.code-cell').last();
  await lastCell.locator('.cell-ctrl-btn[title="Delete"]').click();
  await expect(lastCell.locator('.delete-confirm-label')).toBeVisible();
});

test('confirming deletion removes the cell', async () => {
  const before   = await window.locator('.cell.code-cell').count();
  const lastCell = window.locator('.cell.code-cell').last();
  // Confirmation prompt should still be open from previous test
  await lastCell.locator('.cell-ctrl-btn.cell-ctrl-danger').click();
  await expect(window.locator('.cell.code-cell')).toHaveCount(before - 1);
});
