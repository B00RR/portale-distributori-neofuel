import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['node_modules/**'],
    globals: true,
    testTimeout: 30000,
    hookTimeout: 60000,
    reporters: ['verbose'],
    setupFiles: [resolve(__dirname, '../tests/integration/setup.ts')],
    mockReset: false,
    restoreMocks: false,
    fileParallelism: false
  },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, '../js') },
      { find: '@core', replacement: resolve(__dirname, '../js/core') },
      { find: '@utils', replacement: resolve(__dirname, '../js/utils') },
      { find: '@ui', replacement: resolve(__dirname, '../js/ui') },
      { find: '@shared', replacement: resolve(__dirname, '../js/shared') }
    ]
  }
});
