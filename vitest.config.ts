import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    exclude: ['node_modules/**', '.claude/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/lib/**/*.test.ts',
            'src/app/api/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: [
            'src/hooks/**/*.test.ts',
            'src/hooks/**/*.test.tsx',
            'src/components/**/*.test.tsx',
            'src/integration/**/*.test.tsx',
          ],
          setupFiles: ['./src/test-setup.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
