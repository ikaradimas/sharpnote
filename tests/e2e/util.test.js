'use strict';
// E2E tests for Util.* scripting helpers, .Dump() alias, and table column sorting.
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

// ── .Dump() alias ─────────────────────────────────────────────────────────────

test('.Dump() produces output like .Display()', async () => {
  await clearAndType(window, '"dump-test-string".Dump();');
  await runFirstCell(window);
  await expect(firstOutput(window)).toContainText('dump-test-string');
});

test('.DumpTable() renders a collection as a data table', async () => {
  await clearAndType(window, 'new[] { new { A = 1 }, new { A = 2 } }.DumpTable();');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.data-table')).toBeVisible();
});

// ── Util.Time ─────────────────────────────────────────────────────────────────

test('Util.Time() displays a .util-time block with the label', async () => {
  await clearAndType(window, 'Util.Time(() => { }, "bench-label");');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.util-time')).toBeVisible();
  await expect(firstCell(window).locator('.util-time')).toContainText('bench-label');
});

test('Util.Time<T>() returns the function result', async () => {
  await clearAndType(window, 'var x = Util.Time(() => 99, "fn"); x.Dump();');
  await runFirstCell(window);
  await expect(firstOutput(window)).toContainText('99');
});

// ── Util.Metatext ─────────────────────────────────────────────────────────────

test('Util.Metatext() renders .util-metatext with the given text', async () => {
  await clearAndType(window, 'Util.Metatext("meta-annotation-text");');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.util-metatext')).toBeVisible();
  await expect(firstCell(window).locator('.util-metatext')).toContainText('meta-annotation-text');
});

// ── Util.Highlight ────────────────────────────────────────────────────────────

test('Util.Highlight() renders .util-highlight containing the value', async () => {
  await clearAndType(window, 'Util.Highlight("highlighted-value");');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.util-highlight')).toBeVisible();
  await expect(firstCell(window).locator('.util-highlight')).toContainText('highlighted-value');
});

// ── Util.Dif ──────────────────────────────────────────────────────────────────

test('Util.Dif() renders a .util-dif block with add/del spans', async () => {
  await clearAndType(window, 'Util.Dif("a\\nb\\nc", "a\\nX\\nc");');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.util-dif')).toBeVisible();
  await expect(firstCell(window).locator('.diff-add').first()).toBeVisible();
  await expect(firstCell(window).locator('.diff-del').first()).toBeVisible();
});

test('Util.Dif() shows provided labels', async () => {
  await clearAndType(window, 'Util.Dif("old", "new", "before", "after");');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.util-dif-header')).toContainText('before');
  await expect(firstCell(window).locator('.util-dif-header')).toContainText('after');
});

// ── Util.HorizontalRun ────────────────────────────────────────────────────────

test('Util.HorizontalRun() renders a .horizontal-output flex container', async () => {
  await clearAndType(window, 'Util.HorizontalRun("12px", "left item", "right item");');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.horizontal-output')).toBeVisible();
});

test('Util.HorizontalRun() creates one .horizontal-output-item per argument', async () => {
  // Table is still visible from the previous run; re-run with a fresh expression
  await clearAndType(window, 'Util.HorizontalRun("8px", "a", "b", "c");');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.horizontal-output-item')).toHaveCount(3);
});

// ── Table column sorting ──────────────────────────────────────────────────────

test('data table column headers have the sortable class', async () => {
  await clearAndType(window,
    'new[] { new { Name = "Charlie", Score = 3 }, new { Name = "Alice", Score = 1 }, new { Name = "Bob", Score = 2 } }.DisplayTable();');
  await runFirstCell(window);
  await expect(firstCell(window).locator('.data-table th.sortable').first()).toBeVisible();
});

test('clicking a column header sorts the table ascending', async () => {
  const nameHeader = firstCell(window).locator('.data-table th.sortable', { hasText: 'Name' });
  await nameHeader.click();
  await expect(
    firstCell(window).locator('.data-table tbody tr').first().locator('td').first()
  ).toContainText('Alice');
});

test('clicking the active column header again sorts descending', async () => {
  const nameHeader = firstCell(window).locator('.data-table th.sortable', { hasText: 'Name' });
  await nameHeader.click(); // was asc → now desc
  await expect(
    firstCell(window).locator('.data-table tbody tr').first().locator('td').first()
  ).toContainText('Charlie');
});

test('sort indicator arrow is shown on the active column', async () => {
  // Currently sorted desc on Name; indicator should show ▼
  await expect(
    firstCell(window).locator('.data-table th.sortable', { hasText: 'Name' })
      .locator('.sort-indicator.active')
  ).toBeVisible();
});
