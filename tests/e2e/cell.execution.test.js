'use strict';
// E2E tests that actually execute C# code through the kernel.
// Requires a built kernel binary: npm run build:kernel:mac (or :win)

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, kernelBuilt } = require('./helpers/electron');

test.skip(!kernelBuilt(), 'kernel binary not found — run npm run build:kernel:mac first');

let app, window;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
  // Wait for the kernel to reach ready state before any test runs.
  await expect(window.locator('.kernel-status span'))
    .toHaveText('ready', { timeout: 30_000 });
});

test.afterAll(async () => {
  await closeApp(app);
});

// The first code cell and its output, used throughout all tests.
const firstCell   = (win) => win.locator('.cell.code-cell').first();
const firstOutput = (win) => firstCell(win).locator('.output-block').first();

async function clearAndType(win, code) {
  const editor = firstCell(win).locator('.cm-content');
  await editor.click();
  // Ctrl+A moves to line-start in CodeMirror on macOS; Cmd+A (Meta+A) selects all.
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await win.keyboard.press(`${mod}+a`);
  await win.keyboard.type(code);
}

async function runFirstCell(win) {
  await firstCell(win).locator('.run-btn').click();
  // Wait until the running class disappears (cell finished)
  await expect(firstCell(win)).not.toHaveClass(/running/, { timeout: 20_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test('integer expression displays its value', async () => {
  await clearAndType(window, '1 + 1');
  await runFirstCell(window);
  await expect(firstOutput(window)).toContainText('2');
});

test('Console.WriteLine output appears', async () => {
  await clearAndType(window, 'Console.WriteLine("hello e2e");');
  await runFirstCell(window);
  await expect(firstOutput(window)).toContainText('hello e2e');
});

test('expression with trailing semicolon displays its value', async () => {
  await clearAndType(window, 'DateTime.Compare(DateTime.Today, DateTime.Now.AddDays(-1));');
  await runFirstCell(window);
  // Compare returns an int (1 in this case — today is after yesterday)
  await expect(firstOutput(window)).toContainText('1');
});

test('compilation error shows an error block', async () => {
  await clearAndType(window, 'this is not valid csharp!!!');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.error-output, .output-error').first())
    .toBeVisible({ timeout: 10_000 });
});

test('variable declared in one run is available in the next', async () => {
  await clearAndType(window, 'var greeting = "hello from e2e";');
  await runFirstCell(window);

  await clearAndType(window, 'greeting');
  await runFirstCell(window);
  await expect(firstOutput(window)).toContainText('hello from e2e');
});
