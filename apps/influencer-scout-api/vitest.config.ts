import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['dist/**/*.js'],
      exclude: [
        '**/node_modules/**',
        'dist/index.js',
        'dist/types/**',
        'dist/utils/health-check.js',
      ],
      thresholds: {
        statements: 100,
        branches: 85,
        functions: 100,
        lines: 100,
      },
    },
  },
});
