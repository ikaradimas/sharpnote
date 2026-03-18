import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.{js,jsx}'],
    setupFiles: ['tests/setup.js'],
    environmentMatchGlobs: [
      // main process tests run in Node
      ['tests/main/**', 'node'],
    ],
    // Make vi.mock('electron') automatically use __mocks__/electron.js
    mockReset: false,
  },
});
