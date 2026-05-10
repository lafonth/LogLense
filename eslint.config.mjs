// @ts-check
import antfu from '@antfu/eslint-config';
import next from '@next/eslint-plugin-next';

export default antfu(
  {
    typescript: true,
    react: true,
    // Keep Prettier for formatting (handles Tailwind class ordering)
    stylistic: false,
  },
  {
    plugins: { '@next/next': next },
    rules: /** @type {any} */ (next.configs.recommended.rules),
  },
  {
    // process.env is idiomatic in Next.js (Edge + Node runtimes)
    rules: { 'node/prefer-global/process': 'off' },
  },
  {
    ignores: ['**/.next/**', '**/node_modules/**', 'legacy/**', 'prototypes/**'],
  },
);
