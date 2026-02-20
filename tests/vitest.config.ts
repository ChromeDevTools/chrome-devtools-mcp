import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    root: '.',
    include: ['**/*.test.ts'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@extractor': path.resolve(__dirname, '../extension/services/codebase/file-structure-extractor.ts'),
    },
  },
});
