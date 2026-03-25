'use strict';
// E2E tests for cell output types and rendering.
// Requires a built kernel binary.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, kernelBuilt } = require('./helpers/electron');
const { clearAndType, runFirstCell } = require('./helpers/ui');

test.skip(!kernelBuilt(), 'kernel binary not found — run npm run build:kernel:mac first');

let app, window;

const firstCell   = (win) => win.locator('.cell.code-cell').first();
const firstOutput = (win) => firstCell(win).locator('.output-block').first();

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
  await expect(window.locator('.kernel-status span'))
    .toHaveText('ready', { timeout: 30_000 });
});

test.afterAll(async () => {
  await closeApp(app);
});

// ── stdout ────────────────────────────────────────────────────────────────────

test('Console.WriteLine output appears in output block', async () => {
  await clearAndType(window, 'Console.WriteLine("output-test-string");');
  await runFirstCell(window);
  await expect(firstOutput(window)).toContainText('output-test-string');
});

test('stdout output has the .output-stdout class', async () => {
  await expect(firstCell(window).locator('.output-stdout')).toBeVisible();
});

// ── auto-display of return value ──────────────────────────────────────────────

test('an integer expression auto-displays its value', async () => {
  await clearAndType(window, '6 * 7');
  await runFirstCell(window);
  await expect(firstOutput(window)).toContainText('42');
});

test('a string expression auto-displays its value', async () => {
  await clearAndType(window, '"hello output"');
  await runFirstCell(window);
  await expect(firstOutput(window)).toContainText('hello output');
});

test('trailing semicolons do not suppress display', async () => {
  await clearAndType(window, 'DateTime.Compare(DateTime.Today, DateTime.Now.AddDays(-1));');
  await runFirstCell(window);
  // Compare returns a positive integer (today > yesterday)
  const text = await firstOutput(window).textContent();
  expect(Number(text.trim())).toBeGreaterThan(0);
});

// ── error output ──────────────────────────────────────────────────────────────

test('compilation error produces an error output block', async () => {
  await clearAndType(window, 'this is not valid C#!!!');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.output-error')).toBeVisible();
});

test('runtime exception produces an error block', async () => {
  await clearAndType(window, 'throw new Exception("e2e-runtime-error");');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.output-error')).toBeVisible();
  await expect(firstCell(window).locator('.output-error')).toContainText('e2e-runtime-error');
});

// ── execution status indicators ───────────────────────────────────────────────

test('successful run shows the green ✓ icon in the cell footer', async () => {
  await clearAndType(window, '1 + 1');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.cell-exec-icon.cell-exec-success')).toBeVisible();
});

test('failed run shows the red ✗ icon in the cell footer', async () => {
  await clearAndType(window, 'throw new Exception("fail");');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.cell-exec-icon.cell-exec-error')).toBeVisible();
});

test('cell footer shows duration after execution', async () => {
  await clearAndType(window, 'System.Threading.Thread.Sleep(50);');
  await runFirstCell(window);
  // Timer shows "0.XXs" or similar
  const timerText = await firstCell(window).locator('.cell-execution-timer').textContent();
  expect(timerText).toMatch(/\d/); // at least one digit
});

// ── output mode: text ─────────────────────────────────────────────────────────

test('output mode "text" renders value as plain text', async () => {
  const sel = firstCell(window).locator('.output-mode-select');
  await sel.selectOption('text');

  await clearAndType(window, '42');
  await runFirstCell(window);
  // In text mode the value goes to stdout output, not auto-display
  await expect(firstCell(window).locator('.output-stdout')).toContainText('42');

  await sel.selectOption('auto');
});

// ── HTML output ───────────────────────────────────────────────────────────────

test('Display.Html() renders HTML in the output', async () => {
  await clearAndType(window, 'Display.Html("<b>bold-e2e</b>");');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.output-html b')).toContainText('bold-e2e');
});
