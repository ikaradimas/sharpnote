import { defineConfig } from 'vitest/config';

const shared = {
  globals: true,
  setupFiles: ['tests/setup.js'],
  mockReset: false,
  pool: 'forks',
  poolOptions: {
    forks: { maxForks: 2 },
  },
};

const esbuildJsx = {
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
};

export default defineConfig({
  ...esbuildJsx,
  test: {
    projects: [
      {
        // Renderer tests: React components with happy-dom
        ...esbuildJsx,
        test: {
          ...shared,
          include: ['tests/renderer/**/*.test.{js,jsx}'],
          environment: 'happy-dom',
        },
      },
      {
        // Main process tests: Node.js environment (no DOM)
        test: {
          ...shared,
          include: ['tests/main/**/*.test.{js,jsx}'],
          environment: 'node',
        },
      },
    ],
  },
});
