'use strict';
// Screenshot capture suite — generates docs/screenshots/*.png for README and in-app docs.
// Run with: npm run screenshots
// Requires a built kernel binary: npm run build:kernel:mac

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp, kernelBuilt } = require('./helpers/electron');
const { sendMenuAction, togglePanel } = require('./helpers/ui');
const path = require('path');
const fs   = require('fs');

const OUT = path.resolve(__dirname, '../../docs/screenshots');
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test.skip(!kernelBuilt(), 'kernel binary not found — run npm run build:kernel:mac first');

// Run all screenshots in a single app session, sequentially.
test.describe.configure({ mode: 'serial' });

let app, win;

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  ({ app, window: win } = await launchApp());
  await expect(win.locator('.kernel-status span').first())
    .toHaveText('ready', { timeout: 30_000 });
  await win.waitForTimeout(600);
});

test.afterAll(async () => { await closeApp(app); });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function shot(name) {
  await win.waitForTimeout(500);
  await win.screenshot({ path: path.join(OUT, name) });
  console.log(`  ✓  docs/screenshots/${name}`);
}

async function typeInCell(cell, code) {
  const editor = cell.locator('.cm-content');
  await editor.click();
  await win.keyboard.press(`${MOD}+a`);
  await win.keyboard.type(code);
}

async function runCell(cell) {
  await cell.locator('.run-btn').click();
  await expect(cell).not.toHaveClass(/running/, { timeout: 30_000 });
}

// ── 1. Overview ───────────────────────────────────────────────────────────────

test('01 overview — clean launch', async () => {
  await shot('overview.png');
});

// ── 2. Code execution ─────────────────────────────────────────────────────────

test('02 code execution', async () => {
  const cell = win.locator('.cell.code-cell').first();
  await typeInCell(cell, [
    'var name = "SharpNote";',
    '$"Hello from {name}! Running .NET {Environment.Version}".Display();',
  ].join('\n'));
  await runCell(cell);
  await shot('execution.png');
});

// ── 3. Table output ───────────────────────────────────────────────────────────

test('03 table output', async () => {
  await win.locator('button[title="Add code cell"]').click();
  const cell = win.locator('.cell.code-cell').last();
  await typeInCell(cell, [
    'Enumerable.Range(1, 6)',
    '  .Select(i => new {',
    '    Month   = new[]{"Jan","Feb","Mar","Apr","May","Jun"}[i - 1],',
    '    Revenue = i * 15 + 10,',
    '    Costs   = i * 8 + 5,',
    '    Profit  = i * 7 + 5,',
    '  })',
    '  .DisplayTable();',
  ].join('\n'));
  await runCell(cell);
  await shot('table.png');
});

// ── 4. Graph output ───────────────────────────────────────────────────────────

test('04 graph output', async () => {
  await win.locator('button[title="Add code cell"]').click();
  const cell = win.locator('.cell.code-cell').last();
  await cell.locator('.output-mode-select').selectOption('graph');
  await typeInCell(cell, [
    'new {',
    '  type = "bar",',
    '  data = new {',
    '    labels   = new[]{"Q1","Q2","Q3","Q4"},',
    '    datasets = new[] {',
    '      new { label = "Revenue ($k)", data = new[]{42,58,51,74}, backgroundColor = "rgba(78,201,176,0.75)" },',
    '      new { label = "Costs ($k)",   data = new[]{31,35,38,40}, backgroundColor = "rgba(244,71,71,0.6)" },',
    '    },',
    '  },',
    '  options = new {',
    '    responsive = true,',
    '    plugins = new { title = new { display = true, text = "Quarterly Revenue vs Costs ($k)" } },',
    '  },',
    '}',
  ].join('\n'));
  await runCell(cell);
  await shot('graph.png');
});

// ── 5. Variables panel ────────────────────────────────────────────────────────

test('05 variables panel', async () => {
  await win.locator('button[title="Add code cell"]').click();
  const cell = win.locator('.cell.code-cell').last();
  await typeInCell(cell, [
    'var revenue = 42000;',
    'var costs   = 18500;',
    'var profit  = revenue - costs;',
    'var margin  = Math.Round((double)profit / revenue * 100, 1);',
    '$"Profit: ${profit:N0}  |  Margin: {margin}%".Display();',
  ].join('\n'));
  await runCell(cell);
  await togglePanel(win, 'Variables');
  await expect(win.locator('.vars-panel')).toBeVisible();
  await shot('vars.png');
  await togglePanel(win, 'Variables');
});

// ── 6. Confirm widget ─────────────────────────────────────────────────────────

test('06 confirm widget', async () => {
  await win.locator('button[title="Add code cell"]').click();
  const cell = win.locator('.cell.code-cell').last();
  await typeInCell(cell, [
    'var ok = await Util.ConfirmAsync(',
    '    "Do you want to proceed with the analysis?",',
    '    "Confirm Action");',
    'ok.Display();',
  ].join('\n'));
  // Start running — cell will pause at the confirm widget, don't await completion yet
  await cell.locator('.run-btn').click();
  await expect(cell.locator('.confirm-widget--pending')).toBeVisible({ timeout: 10_000 });
  await shot('confirm-widget.png');
  // Unblock execution
  await cell.locator('.confirm-btn--ok').click();
  await expect(cell).not.toHaveClass(/running/, { timeout: 15_000 });
});

// ── 7. Util.Time output ───────────────────────────────────────────────────────

test('07 util helpers', async () => {
  await win.locator('button[title="Add code cell"]').click();
  const cell = win.locator('.cell.code-cell').last();
  await typeInCell(cell, [
    'Util.Time(() => {',
    '  var result = Enumerable.Range(1, 10_000).Sum();',
    '}, "Sum 1–10 000");',
  ].join('\n'));
  await runCell(cell);
  await shot('util-time.png');
});

// ── 8. Table of Contents panel ────────────────────────────────────────────────

test('08 table of contents', async () => {
  // Add a markdown cell with headings
  await win.locator('button[title="Add markdown cell"]').click();
  const mdCell = win.locator('.cell.markdown-cell').last();
  const editor = mdCell.locator('.cm-content');
  await editor.click();
  await win.keyboard.type('## Analysis Results\n\nQuarterly breakdown with revenue and cost data.');
  // Click outside to render the markdown
  await win.locator('.cell.code-cell').first().locator('.cm-content').click();
  await win.waitForTimeout(400);
  await togglePanel(win, 'Table of Contents');
  await expect(win.locator('.toc-panel')).toBeVisible();
  await shot('toc.png');
  await togglePanel(win, 'Table of Contents');
});

// ── 9. Command palette ────────────────────────────────────────────────────────

test('09 command palette', async () => {
  await sendMenuAction(app, 'command-palette');
  await expect(win.locator('.cmd-palette')).toBeVisible({ timeout: 5_000 });
  await shot('command-palette.png');
  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

// ── 10. Settings dialog ───────────────────────────────────────────────────────

test('10 settings', async () => {
  await sendMenuAction(app, 'settings');
  await expect(win.locator('.settings-overlay')).toBeVisible({ timeout: 5_000 });
  await shot('settings.png');
  // Close by clicking the overlay backdrop
  await win.locator('.settings-overlay').click({ position: { x: 10, y: 10 } });
  await win.waitForTimeout(200);
});

// ── 11. Logs panel ────────────────────────────────────────────────────────────

test('11 logs panel', async () => {
  await togglePanel(win, 'Logs');
  await expect(win.locator('.log-panel')).toBeVisible();
  await shot('logs.png');
  await togglePanel(win, 'Logs');
});

// ── 12. Config panel ──────────────────────────────────────────────────────────

test('12 config panel', async () => {
  await togglePanel(win, 'Config');
  await expect(win.locator('.config-panel')).toBeVisible();
  await shot('config.png');
  await togglePanel(win, 'Config');
});

// ── 13. Database panel ────────────────────────────────────────────────────────

test('13 database panel', async () => {
  await togglePanel(win, 'Database');
  await expect(win.locator('.db-panel')).toBeVisible();
  await shot('db.png');
  await togglePanel(win, 'Database');
});

// ── 14. API Browser ───────────────────────────────────────────────────────────

test('14 api browser', async () => {
  await togglePanel(win, 'API Browser');
  await expect(win.locator('.api-panel')).toBeVisible();
  await shot('api.png');
  await togglePanel(win, 'API Browser');
});

// ── 15. Code Library ──────────────────────────────────────────────────────────

test('15 code library', async () => {
  await togglePanel(win, 'Library');
  await expect(win.locator('.library-panel')).toBeVisible();
  await shot('library.png');
  await togglePanel(win, 'Library');
});

// ── 16. File Explorer ─────────────────────────────────────────────────────────

test('16 file explorer', async () => {
  await togglePanel(win, 'File Explorer');
  await expect(win.locator('.files-panel')).toBeVisible();
  await shot('files.png');
  await togglePanel(win, 'File Explorer');
});

// ── 17. To Do panel ───────────────────────────────────────────────────────────

test('17 to do panel', async () => {
  await togglePanel(win, 'To Do');
  await expect(win.locator('.todo-panel')).toBeVisible();
  await shot('todo.png');
  await togglePanel(win, 'To Do');
});

// ── 18. NuGet / Packages panel ────────────────────────────────────────────────

test('18 nuget packages', async () => {
  await togglePanel(win, 'Packages');
  await expect(win.locator('.nuget-panel')).toBeVisible();
  await shot('nuget.png');
  await togglePanel(win, 'Packages');
});

// ── 19. Dock layout ───────────────────────────────────────────────────────────

test('19 dock layout — multiple panels', async () => {
  // Open three panels so the dock zones are visible simultaneously
  await togglePanel(win, 'Variables');
  await expect(win.locator('.vars-panel')).toBeVisible();
  await togglePanel(win, 'Logs');
  await expect(win.locator('.log-panel')).toBeVisible();
  await shot('dock.png');
  // Clean up
  await togglePanel(win, 'Variables');
  await togglePanel(win, 'Logs');
});
