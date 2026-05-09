# Phase 1: Scaffold & Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a production-grade Next.js 15 project with pnpm, strict TypeScript, ESLint, Prettier, Vitest, Husky pre-push hooks, and GitHub Actions CI — matching the Quartermaster project's tooling conventions.

**Architecture:** Single Next.js 15 App Router application scaffolded with `create-next-app`, then layered with quality tooling. No application logic in this phase — just the skeleton that all future phases build on.

**Tech Stack:** Next.js 15, pnpm, TypeScript 5, ESLint 9 (flat config), Prettier 3, Vitest 3, Husky 9, GitHub Actions

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: `package.json` (generated)
- Create: `tsconfig.json` (generated)
- Create: `next.config.ts` (generated)
- Create: `src/app/layout.tsx` (generated)
- Create: `src/app/page.tsx` (generated)
- Create: `src/app/globals.css` (generated)

- [ ] **Step 1: Run create-next-app in the repo root**

Run from `C:\Users\lafon\Documents\LogLense`:
```
pnpm create next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --use-pnpm
```
When prompted for project name, enter: `loglense`
When asked about ESLint: **No** (we configure it ourselves)
When asked about `src/` directory: **Yes**
When asked about App Router: **Yes**

Expected: `package.json` created, `src/app/` structure in place, `pnpm-lock.yaml` generated.

- [ ] **Step 2: Verify the scaffold works**

```
pnpm dev
```
Expected: Server starts on `http://localhost:3000`. Open in browser, see default Next.js page. Stop with Ctrl+C.

- [ ] **Step 3: Remove default boilerplate**

Replace `src/app/page.tsx` with a minimal placeholder:
```tsx
export default function Home() {
  return <main>LogLense</main>;
}
```

Replace `src/app/globals.css` with just the Tailwind directives:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 app with pnpm"
```

---

### Task 2: Configure TypeScript strictly

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Replace tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "dom", "dom.iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "legacy", "prototypes"]
}
```

- [ ] **Step 2: Add typecheck script to package.json**

In `package.json`, add to `"scripts"`:
```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Verify typecheck passes**

```
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json package.json
git commit -m "chore: configure strict TypeScript"
```

---

### Task 3: Configure ESLint (flat config)

**Files:**
- Create: `eslint.config.mjs`
- Delete: `.eslintrc.*` (if exists from scaffold)

- [ ] **Step 1: Install ESLint dependencies**

```
pnpm add -D eslint@^9 @typescript-eslint/eslint-plugin@^8 @typescript-eslint/parser@^8 eslint-plugin-react-hooks@^5 @next/eslint-plugin-next@^15
```

- [ ] **Step 2: Create eslint.config.mjs**

```js
// @ts-check
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import next from '@next/eslint-plugin-next';

export default [
  {
    ignores: ['**/.next/**', '**/node_modules/**', 'legacy/**', 'prototypes/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json' },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      '@next/next': next,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...next.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
];
```

- [ ] **Step 3: Remove any scaffold ESLint config**

```bash
# Remove if present
rm -f .eslintrc.json .eslintrc.js .eslintrc.cjs
```

- [ ] **Step 4: Add lint script to package.json**

```json
"lint": "eslint src"
```

- [ ] **Step 5: Verify lint passes**

```
pnpm lint
```
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs package.json
git rm -f .eslintrc.json 2>/dev/null || true
git commit -m "chore: configure ESLint 9 flat config"
```

---

### Task 4: Configure Prettier

**Files:**
- Create: `.prettierrc`
- Create: `.prettierignore`

- [ ] **Step 1: Install Prettier**

```
pnpm add -D prettier@^3 prettier-plugin-tailwindcss@^0.6
```

- [ ] **Step 2: Create .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "es5",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 3: Create .prettierignore**

```
.next/
node_modules/
pnpm-lock.yaml
.agents/
.claude/
prototypes/
legacy/
docs/
```

- [ ] **Step 4: Add format scripts to package.json**

```json
"format": "prettier --write src",
"format:check": "prettier --check src"
```

- [ ] **Step 5: Format existing files and verify**

```
pnpm format
pnpm format:check
```
Expected: `pnpm format:check` exits 0 after formatting.

- [ ] **Step 6: Commit**

```bash
git add .prettierrc .prettierignore package.json src/
git commit -m "chore: configure Prettier with tailwindcss plugin"
```

---

### Task 5: Configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/example.test.ts`

- [ ] **Step 1: Install Vitest**

```
pnpm add -D vitest@^3 @vitejs/plugin-react@^4
```

- [ ] **Step 2: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Add test script to package.json**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a placeholder test to verify setup**

Create `src/lib/__tests__/example.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests**

```
pnpm test
```
Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts src/lib/__tests__/example.test.ts package.json
git commit -m "chore: configure Vitest"
```

---

### Task 6: Configure Husky pre-push hook

**Files:**
- Create: `.husky/pre-push`

- [ ] **Step 1: Install Husky**

```
pnpm add -D husky@^9
```

- [ ] **Step 2: Initialise Husky**

```
pnpm exec husky init
```
Expected: `.husky/` directory created with a `pre-commit` file.

- [ ] **Step 3: Replace pre-commit with pre-push**

Delete `.husky/pre-commit`, create `.husky/pre-push`:
```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

```bash
rm .husky/pre-commit
echo 'pnpm typecheck && pnpm lint && pnpm format:check && pnpm test' > .husky/pre-push
```

- [ ] **Step 4: Add prepare script to package.json**

```json
"prepare": "husky"
```

- [ ] **Step 5: Verify the hook runs**

```
bash .husky/pre-push
```
Expected: All four checks pass.

- [ ] **Step 6: Commit**

```bash
git add .husky package.json
git commit -m "chore: configure Husky pre-push hook"
```

---

### Task 7: Configure GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    name: Quality Gate
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: jdx/mise-action@v2

      - uses: pnpm/action-setup@v4
        with:
          version: latest

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Test
        run: pnpm test
```

- [ ] **Step 2: Verify mise.toml has node and pnpm**

`mise.toml` must contain:
```toml
[tools]
node = "26"
pnpm = "latest"
```
(Already added in the previous session.)

- [ ] **Step 3: Commit and push to trigger CI**

```bash
git add .github/
git commit -m "chore: add GitHub Actions CI workflow"
git push
```

Expected: GitHub Actions tab shows the CI workflow running. All steps pass.

---

### Task 8: Create .env.example

**Files:**
- Create: `.env.local` (gitignored)
- Create: `.env.example`

- [ ] **Step 1: Create .env.example**

```bash
# Warcraft Logs API credentials
# Register at: https://www.warcraftlogs.com/api/clients/
WCL_CLIENT_ID=your_client_id_here
WCL_CLIENT_SECRET=your_client_secret_here
```

- [ ] **Step 2: Create .env.local with real credentials**

Copy `.env.example` to `.env.local` and fill in your actual WCL API credentials.

- [ ] **Step 3: Verify .env.local is gitignored**

```bash
git status
```
Expected: `.env.local` does NOT appear in the output (it's ignored by Next.js default `.gitignore`).

- [ ] **Step 4: Commit .env.example**

```bash
git add .env.example
git commit -m "chore: add .env.example for WCL credentials"
```

---

### Verification

- [ ] `pnpm dev` starts on localhost:3000 and shows "LogLense"
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm format:check` exits 0
- [ ] `pnpm test` shows `1 passed`
- [ ] `bash .husky/pre-push` passes all checks
- [ ] GitHub Actions CI passes on the `main` branch
