// @ts-check
'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Never retry in watch mode; allow 1 retry on CI to absorb flaky spawns.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // No projects needed — Electron tests launch the app themselves.
});
