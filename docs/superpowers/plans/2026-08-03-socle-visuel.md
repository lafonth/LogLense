# Socle visuel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give LogLense a real design system — Tailwind v4 tokens, UI primitives, and mobile support from 360px — and replace the two dense result surfaces that cannot survive a small screen.

**Architecture:** Tokens are declared once in `src/app/globals.css` via Tailwind v4's `@theme`, so every colour, font, size and breakpoint is a utility class rather than an inline object. Primitives in `src/components/ui/` absorb the styling that 33 components currently duplicate. The talent tree and rotation table are deleted and replaced by two new components whose comparison logic lives in pure, separately tested functions.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Vitest + Testing Library, Playwright (via the `webapp-testing` skill).

**Spec:** `docs/superpowers/specs/2026-08-03-socle-visuel-design.md`

## Global Constraints

- Work directly on `main`. No feature branches.
- Every commit must pass the pre-commit hook: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`.
- Existing tests must pass **unmodified**. `DifficultyRegionFields.test.tsx` and the integration tests query by role and text, never by class — a break means a behaviour regression, not a stale test.
- No inline `style={{}}` in any file this plan touches. Tailwind utility classes only. The single exception is a computed geometric value (a bar width percentage), which uses `style={{ width: \`${pct}%\` }}`.
- Colour, spacing, font-size and radius values never appear as literals in components. They come from the tokens in Task 1.
- All numerals render in `font-mono`.
- Every surface must work at **360px** with no horizontal overflow of `<body>`.
- The item-quality classes `.pct-legendary` / `.pct-epic` / `.pct-rare` / `.pct-uncommon` / `.pct-common` are kept verbatim — they are a domain convention players read without a legend.
- Deviations render in `text-deviation` (blue). `text-danger` (red) is reserved for errors and, later, illegitimate comparisons. Never use red for "below the reference".

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/components/ui/Button.tsx` | The one button. Variants: `primary`, `secondary`, `ghost`. Sizes: `sm`, `md`. |
| `src/components/ui/Card.tsx` | Bordered surface container with optional header slot. |
| `src/components/ui/Input.tsx` | Text input with label and optional error text. |
| `src/components/ui/Select.tsx` | Native `<select>` with label, same shell as `Input`. |
| `src/components/ui/Tabs.tsx` | Accessible tab bar (`role="tablist"`), controlled. |
| `src/components/ui/StatTile.tsx` | Label + monospace value pair. |
| `src/components/ui/ScrollArea.tsx` | Horizontal overflow container that never widens its parent. |
| `src/components/ui/Sheet.tsx` | Bottom sheet under `md`, plain children at and above `md`. |
| `src/lib/comparison/talent-diff.ts` | Pure: splits talent nodes into mine-only / theirs-only / common. |
| `src/lib/comparison/rotation-stats.ts` | Pure: per-ability range, median, deviation, sort. |
| `src/components/results/TalentDiff.tsx` | Renders the talent diff. Replaces `TalentTree`. |
| `src/components/results/RotationCards.tsx` | Renders per-ability cards. Replaces `RotationTable`. |

**Deleted**

`src/components/results/TalentTree.tsx` · `src/components/results/RotationTable.tsx` · `src/components/forms/formStyles.ts`

**Modified** — `src/app/globals.css` (tokens), then the 30 remaining components, surface by surface.

Comparison logic lives in `src/lib/comparison/` rather than inside the components so it can be tested without rendering, and so sub-project 3 can reuse it when the reference set becomes a distribution.

---

## Task 1: Design tokens

**Files:**
- Modify: `src/app/globals.css` (whole file)

**Interfaces:**
- Produces: Tailwind utility classes used by every later task —
  `bg-bg` `bg-surface` `bg-surface-raised` `border-border` `border-border-strong`
  `text-text` `text-muted` `text-dim` `text-brass` `text-brass-bright`
  `text-deviation` `text-positive` `text-warning` `text-danger`
  `font-display` `font-mono`
  `text-2xs`…`text-4xl`, `rounded-xs|sm|md|full`, breakpoints `sm md lg xl`.

- [ ] **Step 1: Replace the stylesheet**

```css
@import url('https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Fira+Code:wght@400;500&display=swap');
@import 'tailwindcss';

@theme {
  --color-bg: #101019;
  --color-surface: #16161f;
  --color-surface-raised: #1c1c26;
  --color-border: #262633;
  --color-border-strong: #34343f;

  --color-text: #f2efe9;
  --color-muted: #9d97a8;
  --color-dim: #6b6577;

  --color-brass: #b08d57;
  --color-brass-bright: #d7b988;

  --color-deviation: #6ea8c9;
  --color-positive: #7fc98f;
  --color-warning: #d9a441;
  --color-danger: #d9636f;

  --font-display: 'IM Fell English', Georgia, serif;
  --font-mono: 'Fira Code', ui-monospace, 'Courier New', monospace;
  --font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;

  --text-2xs: 0.6875rem;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.5rem;
  --text-2xl: 2rem;
  --text-4xl: 2.5rem;

  --radius-xs: 2px;
  --radius-sm: 6px;
  --radius-md: 10px;

  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  /* Nothing may widen the page; dense surfaces scroll inside ScrollArea instead. */
  overflow-x: hidden;
}

h1,
h2,
h3,
h4 {
  font-family: var(--font-display);
  font-weight: normal;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: var(--color-bg);
}
::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-strong);
}

/* Item-quality colours — a WoW convention, kept verbatim. */
.pct-legendary {
  color: #ff8000;
}
.pct-epic {
  color: #a335ee;
}
.pct-rare {
  color: #0070dd;
}
.pct-uncommon {
  color: #1eff00;
}
.pct-common {
  color: #9d9d9d;
}
```

- [ ] **Step 2: Verify the app still builds and every test passes**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all pass. The app will look wrong — components still reference `var(--gold)` and friends, which no longer exist, so gold text falls back to inherited colour. That is expected and is fixed surface by surface from Task 12 onward.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(ui): declare the design tokens as a Tailwind theme"
```

---

## Task 2: Button and Card primitives

**Files:**
- Create: `src/components/ui/Button.tsx`, `src/components/ui/Card.tsx`
- Test: `src/components/ui/__tests__/Button.test.tsx`

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces:
  - `<Button variant?: 'primary' | 'secondary' | 'ghost' = 'primary'; size?: 'sm' | 'md' = 'md'; …ButtonHTMLAttributes>`
  - `<Card header?: ReactNode; className?: string; children: ReactNode>`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/__tests__/Button.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('renders its label and forwards clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Analyse</Button>);

    const button = screen.getByRole('button', { name: 'Analyse' });
    button.click();

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Analyse
      </Button>
    );

    screen.getByRole('button', { name: 'Analyse' }).click();

    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps a visible focus ring in every variant', () => {
    render(<Button variant="ghost">Reset</Button>);

    expect(screen.getByRole('button', { name: 'Reset' }).className).toContain('focus-visible:');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/ui/__tests__/Button.test.tsx`
Expected: FAIL — `Failed to load url ../Button`.

- [ ] **Step 3: Implement Button**

```tsx
// src/components/ui/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brass text-bg hover:bg-brass-bright border border-brass',
  secondary: 'bg-surface text-text border border-border hover:border-border-strong',
  ghost: 'bg-transparent text-muted border border-transparent hover:text-text',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm font-sans transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-bright disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Implement Card**

```tsx
// src/components/ui/Card.tsx
import type { ReactNode } from 'react';

interface CardProps {
  header?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Card({ header, className = '', children }: CardProps) {
  return (
    <section className={`rounded-md border border-border bg-surface ${className}`}>
      {header !== undefined && (
        <header className="border-b border-border px-4 py-3 font-display text-xs tracking-[0.14em] text-muted uppercase">
          {header}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/ui/__tests__/Button.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/Card.tsx src/components/ui/__tests__/Button.test.tsx
git commit -m "feat(ui): add Button and Card primitives"
```

---

## Task 3: Input and Select primitives

**Files:**
- Create: `src/components/ui/Input.tsx`, `src/components/ui/Select.tsx`
- Test: `src/components/ui/__tests__/Input.test.tsx`

**Interfaces:**
- Produces:
  - `<Input label: string; error?: string; …InputHTMLAttributes>`
  - `<Select label: string; children: ReactNode; …SelectHTMLAttributes>`
  Both associate label and control through a generated id, so `getByLabelText` works in tests.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/__tests__/Input.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from '../Input';
import { Select } from '../Select';

describe('Input', () => {
  it('associates its label with the control', () => {
    render(<Input label="Character name" defaultValue="Jumbaa" />);

    expect(screen.getByLabelText('Character name')).toHaveValue('Jumbaa');
  });

  it('exposes the error to assistive technology', () => {
    render(<Input label="Report code" error="Unknown report" />);

    const field = screen.getByLabelText('Report code');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Unknown report')).toBeInTheDocument();
  });
});

describe('Select', () => {
  it('associates its label with the control', () => {
    render(
      <Select label="Region" defaultValue="EU">
        <option value="EU">EU</option>
        <option value="US">US</option>
      </Select>
    );

    expect(screen.getByLabelText('Region')).toHaveValue('EU');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/ui/__tests__/Input.test.tsx`
Expected: FAIL — `Failed to load url ../Input`.

- [ ] **Step 3: Implement Input**

```tsx
// src/components/ui/Input.tsx
import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = '', ...rest }: InputProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-sans text-2xs tracking-[0.1em] text-muted uppercase">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`rounded-sm border bg-surface px-3 py-2 font-mono text-sm text-text placeholder:text-dim focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brass-bright ${error ? 'border-danger' : 'border-border'} ${className}`}
        {...rest}
      />
      {error && (
        <p id={errorId} className="font-sans text-2xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement Select**

```tsx
// src/components/ui/Select.tsx
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

export function Select({ label, className = '', children, ...rest }: SelectProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-sans text-2xs tracking-[0.1em] text-muted uppercase">
        {label}
      </label>
      <select
        id={id}
        className={`cursor-pointer rounded-sm border border-border bg-surface px-3 py-2 font-mono text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brass-bright ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/ui/__tests__/Input.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Input.tsx src/components/ui/Select.tsx src/components/ui/__tests__/Input.test.tsx
git commit -m "feat(ui): add Input and Select primitives"
```

---

## Task 4: Tabs, StatTile and ScrollArea

**Files:**
- Create: `src/components/ui/Tabs.tsx`, `src/components/ui/StatTile.tsx`, `src/components/ui/ScrollArea.tsx`
- Test: `src/components/ui/__tests__/Tabs.test.tsx`

**Interfaces:**
- Produces:
  - `<Tabs tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void>`
  - `<StatTile label: string; value: ReactNode; tone?: 'default' | 'deviation' | 'positive'>`
  - `<ScrollArea className?: string; children: ReactNode>`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/__tests__/Tabs.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from '../Tabs';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'comparison', label: 'Comparison' },
];

describe('Tabs', () => {
  it('marks only the active tab as selected', () => {
    render(<Tabs tabs={TABS} active="comparison" onChange={() => {}} />);

    expect(screen.getByRole('tab', { name: 'Comparison' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false');
  });

  it('reports the clicked tab id', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} active="overview" onChange={onChange} />);

    screen.getByRole('tab', { name: 'Comparison' }).click();

    expect(onChange).toHaveBeenCalledWith('comparison');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/ui/__tests__/Tabs.test.tsx`
Expected: FAIL — `Failed to load url ../Tabs`.

- [ ] **Step 3: Implement the three components**

```tsx
// src/components/ui/Tabs.tsx
interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`shrink-0 cursor-pointer border-b-2 px-4 py-2.5 font-sans text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brass-bright ${
              selected
                ? 'border-brass text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

```tsx
// src/components/ui/StatTile.tsx
import type { ReactNode } from 'react';

type Tone = 'default' | 'deviation' | 'positive';

interface StatTileProps {
  label: string;
  value: ReactNode;
  tone?: Tone;
}

const TONES: Record<Tone, string> = {
  default: 'text-text',
  deviation: 'text-deviation',
  positive: 'text-positive',
};

export function StatTile({ label, value, tone = 'default' }: StatTileProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-2xs tracking-[0.1em] text-dim uppercase">{label}</span>
      <span className={`font-mono text-sm font-medium ${TONES[tone]}`}>{value}</span>
    </div>
  );
}
```

```tsx
// src/components/ui/ScrollArea.tsx
import type { ReactNode } from 'react';

interface ScrollAreaProps {
  className?: string;
  children: ReactNode;
}

/** Confines wide content to its own scroller so it can never widen the page. */
export function ScrollArea({ className = '', children }: ScrollAreaProps) {
  return <div className={`w-full max-w-full overflow-x-auto ${className}`}>{children}</div>;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/ui/__tests__/Tabs.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Tabs.tsx src/components/ui/StatTile.tsx src/components/ui/ScrollArea.tsx src/components/ui/__tests__/Tabs.test.tsx
git commit -m "feat(ui): add Tabs, StatTile and ScrollArea primitives"
```

---

## Task 5: Sheet primitive

Under `md` a sheet is a trigger button plus a panel that slides up from the bottom. At `md` and above it renders its children directly, with no trigger and no panel — that is how `BossSidebar` and `SidebarSwitcher` keep their desktop column while becoming a sheet on a phone.

**Files:**
- Create: `src/components/ui/Sheet.tsx`
- Test: `src/components/ui/__tests__/Sheet.test.tsx`

**Interfaces:**
- Consumes: `Button` (Task 2).
- Produces: `<Sheet triggerLabel: string; title: string; children: ReactNode>`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/__tests__/Sheet.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sheet } from '../Sheet';

describe('Sheet', () => {
  it('renders its children for the desktop layout', () => {
    render(
      <Sheet triggerLabel="Rotmire" title="Bosses">
        <p>Boss list</p>
      </Sheet>
    );

    expect(screen.getByText('Boss list')).toBeInTheDocument();
  });

  it('keeps the mobile panel closed until the trigger is pressed', () => {
    render(
      <Sheet triggerLabel="Rotmire" title="Bosses">
        <p>Boss list</p>
      </Sheet>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    screen.getByRole('button', { name: /Rotmire/ }).click();

    expect(screen.getByRole('dialog', { name: 'Bosses' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/ui/__tests__/Sheet.test.tsx`
Expected: FAIL — `Failed to load url ../Sheet`.

- [ ] **Step 3: Implement Sheet**

```tsx
// src/components/ui/Sheet.tsx
'use client';

import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { Button } from './Button';

interface SheetProps {
  /** What the trigger shows on mobile — usually the current selection. */
  triggerLabel: string;
  title: string;
  children: ReactNode;
}

export function Sheet({ triggerLabel, title, children }: SheetProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      {/* Mobile: a trigger, then a panel. Hidden from md up. */}
      <div className="md:hidden">
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setOpen(true)}>
          {triggerLabel}
        </Button>
        {open && (
          <div
            className="fixed inset-0 z-50 flex items-end bg-bg/80"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="max-h-[70vh] w-full overflow-y-auto rounded-t-md border-t border-border bg-surface p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 id={titleId} className="font-display text-sm tracking-[0.14em] uppercase">
                  {title}
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
              <div onClick={() => setOpen(false)}>{children}</div>
            </div>
          </div>
        )}
      </div>

      {/* Desktop: the children, plain. */}
      <div className="hidden md:block">{children}</div>
    </>
  );
}
```

Note: children render twice in the DOM — once per breakpoint branch — so tests that assert a single occurrence must scope their query. The mobile branch only mounts its copy when `open` is true, so the closed state has exactly one.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/ui/__tests__/Sheet.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Sheet.tsx src/components/ui/__tests__/Sheet.test.tsx
git commit -m "feat(ui): add Sheet primitive for mobile sidebars"
```

---

## Task 6: Migrate the existing ui/ components to tokens

`Badge`, `ErrorBanner`, `LoadingSpinner`, `ProgressSteps` and `ModeSelector` already exist. Their public props do not change; only their styling does.

**Files:**
- Modify: `src/components/ui/Badge.tsx`, `ErrorBanner.tsx`, `LoadingSpinner.tsx`, `ProgressSteps.tsx`, `ModeSelector.tsx`

**Interfaces:**
- Consumes: tokens (Task 1), `Card` and `Button` (Task 2).
- Produces: unchanged props on all five.

- [ ] **Step 1: Rewrite each component's styling with utility classes**

Apply this mapping to every inline style in the five files, then delete the `style` attribute:

| Was | Becomes |
|---|---|
| `var(--bg)` | `bg-bg` / `text-bg` |
| `var(--surface)` | `bg-surface` |
| `var(--border)` | `border-border` |
| `var(--gold)`, `var(--gold-bright)` | `text-brass` / `text-brass-bright` |
| `var(--gold-dim)` | `text-muted` |
| `var(--crimson)` | `text-danger` — **only** when it marks an error. If it marked "below reference", use `text-deviation`. |
| `var(--text)` | `text-text` |
| `var(--text-dim)` | `text-muted` (labels) or `text-dim` (de-emphasised) |
| `var(--font-mono)` | `font-mono` |
| `var(--font-display)` | `font-display` |
| `fontSize: '0.72rem'` and below | `text-2xs` |
| `0.75–0.85rem` | `text-xs` |
| `0.86–0.95rem` | `text-sm` |
| `1–1.2rem` | `text-base` |
| `1.2–1.4rem` | `text-lg` |
| padding/margin/gap in px | nearest of `4 8 12 16 24 32 48 64` → `p-1 p-2 p-3 p-4 p-6 p-8 p-12 p-16` |

`Badge` keeps the `.pct-*` classes exactly as they are.

- [ ] **Step 2: Verify nothing regressed**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`
Expected: all pass, 161 tests.

- [ ] **Step 3: Check every ui/ primitive at 360px**

Run: `pnpm dev`, then use the `webapp-testing` skill to load `http://localhost:3000` at 360×740.
Expected: `document.body.scrollWidth <= 360`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui
git commit -m "refactor(ui): move existing primitives onto the design tokens"
```

---

## Task 7: Talent diff logic

Pure functions first, with no rendering. `TalentNode.talentIds` holds several ids per node — Blizzard returns spec variants — so a node counts as taken when **any** of its ids appears in a player's `talents` record.

**Files:**
- Create: `src/lib/comparison/talent-diff.ts`
- Test: `src/lib/comparison/__tests__/talent-diff.test.ts`

**Interfaces:**
- Consumes: `TalentNode`, `TopPlayer` from `@/types`.
- Produces:

```ts
export interface TalentDiffEntry {
  nodeId: number;
  label: string;
  myRank: number | null;
  referenceCount: number;
  referenceTotal: number;
}

export interface TalentDiffResult {
  mineOnly: TalentDiffEntry[];
  theirsOnly: TalentDiffEntry[];
  sharedCount: number;
  referenceTotal: number;
}

export function diffTalents(
  nodes: TalentNode[],
  myTalents: Record<number, number>,
  topPlayers: TopPlayer[]
): TalentDiffResult;
```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/comparison/__tests__/talent-diff.test.ts
import type { TalentNode, TopPlayer } from '@/types';
import { describe, expect, it } from 'vitest';
import { diffTalents } from '../talent-diff';

function node(id: number, talentIds: number[], name: string): TalentNode {
  return {
    id,
    talentIds,
    name,
    names: [name],
    spellId: id,
    // Distinct row per node — dedupeByPosition collapses nodes sharing a (tree, row, col).
    row: id,
    col: 0,
    maxRanks: 3,
    nodeType: 'single',
    treeType: 'spec',
    children: [],
  };
}

function player(name: string, talents: Record<number, number>): TopPlayer {
  return {
    stats: {
      name,
      avgIlvl: 639,
      primaryStat: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      vers: 0,
      talents,
      dps: 300000,
      killTime: '4:23',
    },
    rotation: { name, fightDurationMs: 263000, casts: {}, buffs: {} },
    damageTable: { entries: [] },
  };
}

const NODES = [
  node(1, [101], 'Sabertooth'),
  node(2, [102], 'Veinripper'),
  node(3, [103], 'Rip'),
  node(4, [104, 105], 'Wild Slashes'),
];

const REFERENCES = [
  player('Aidan', { 102: 3, 103: 1, 104: 2 }),
  player('Brea', { 102: 3, 103: 1 }),
  player('Cass', { 103: 1, 105: 1 }),
];

describe('diffTalents', () => {
  const result = diffTalents(NODES, { 101: 1, 103: 1 }, REFERENCES);

  it('lists what only the player took', () => {
    expect(result.mineOnly.map((e) => e.label)).toEqual(['Sabertooth']);
    expect(result.mineOnly[0].myRank).toBe(1);
    expect(result.mineOnly[0].referenceCount).toBe(0);
  });

  it('lists what only the references took, with how many took it', () => {
    expect(result.theirsOnly.map((e) => [e.label, e.referenceCount])).toEqual([
      ['Veinripper', 2],
      ['Wild Slashes', 2],
    ]);
  });

  it('counts a node taken through any of its talent ids', () => {
    // Wild Slashes is id 104 for Aidan and 105 for Cass — both count.
    expect(result.theirsOnly.find((e) => e.label === 'Wild Slashes')?.referenceCount).toBe(2);
  });

  it('collapses nodes both sides took into a count', () => {
    expect(result.sharedCount).toBe(1); // Rip
    expect(result.referenceTotal).toBe(3);
  });

  it('sorts theirsOnly by how many references took it, descending', () => {
    const counts = result.theirsOnly.map((e) => e.referenceCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('treats every taken node as mine-only when there are no references', () => {
    const solo = diffTalents(NODES, { 101: 1, 103: 1 }, []);

    expect(solo.mineOnly.map((e) => e.label)).toEqual(['Sabertooth', 'Rip']);
    expect(solo.theirsOnly).toEqual([]);
    expect(solo.sharedCount).toBe(0);
    expect(solo.referenceTotal).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/comparison/__tests__/talent-diff.test.ts`
Expected: FAIL — `Failed to load url ../talent-diff`.

- [ ] **Step 3: Implement**

```ts
// src/lib/comparison/talent-diff.ts
import type { TalentNode, TopPlayer } from '@/types';

export interface TalentDiffEntry {
  nodeId: number;
  label: string;
  myRank: number | null;
  referenceCount: number;
  referenceTotal: number;
}

export interface TalentDiffResult {
  mineOnly: TalentDiffEntry[];
  theirsOnly: TalentDiffEntry[];
  sharedCount: number;
  referenceTotal: number;
}

/** Blizzard returns spec-variant copies at the same grid position — keep one, prefer a named node. */
function dedupeByPosition(nodes: TalentNode[]): TalentNode[] {
  const seen = new Map<string, TalentNode>();
  for (const node of nodes) {
    const key = `${node.treeType}:${node.row}:${node.col}`;
    const existing = seen.get(key);
    if (!existing || (node.name && !existing.name)) seen.set(key, node);
  }
  return [...seen.values()];
}

function labelOf(node: TalentNode): string {
  return node.names.filter(Boolean).join(' / ') || node.name || `#${node.id}`;
}

/** The rank a player has on this node, or null if they took none of its talent ids. */
function rankIn(node: TalentNode, talents: Record<number, number>): number | null {
  for (const id of node.talentIds) {
    const rank = talents[id];
    if (rank !== undefined) return rank;
  }
  return null;
}

export function diffTalents(
  nodes: TalentNode[],
  myTalents: Record<number, number>,
  topPlayers: TopPlayer[]
): TalentDiffResult {
  const referenceTotal = topPlayers.length;
  const mineOnly: TalentDiffEntry[] = [];
  const theirsOnly: TalentDiffEntry[] = [];
  let sharedCount = 0;

  for (const node of dedupeByPosition(nodes)) {
    const myRank = rankIn(node, myTalents);
    const referenceCount = topPlayers.filter((p) => rankIn(node, p.stats.talents) !== null).length;

    if (myRank === null && referenceCount === 0) continue;

    const entry: TalentDiffEntry = {
      nodeId: node.id,
      label: labelOf(node),
      myRank,
      referenceCount,
      referenceTotal,
    };

    if (myRank !== null && referenceCount === 0) mineOnly.push(entry);
    else if (myRank === null) theirsOnly.push(entry);
    else sharedCount += 1;
  }

  theirsOnly.sort((a, b) => b.referenceCount - a.referenceCount);

  return { mineOnly, theirsOnly, sharedCount, referenceTotal };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/comparison/__tests__/talent-diff.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comparison/talent-diff.ts src/lib/comparison/__tests__/talent-diff.test.ts
git commit -m "feat(comparison): compute talent build differences"
```

---

## Task 8: TalentDiff component

**Files:**
- Create: `src/components/results/TalentDiff.tsx`
- Test: `src/components/results/__tests__/TalentDiff.test.tsx`

**Interfaces:**
- Consumes: `diffTalents`, `TalentDiffResult` (Task 7); `Card` (Task 2).
- Produces: `<TalentDiff nodes: TalentNode[]; myTalents: Record<number, number>; topPlayers: TopPlayer[]>`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/results/__tests__/TalentDiff.test.tsx
import type { TalentNode, TopPlayer } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TalentDiff } from '../TalentDiff';

function node(id: number, talentIds: number[], name: string): TalentNode {
  return {
    id,
    talentIds,
    name,
    names: [name],
    spellId: id,
    row: id,
    col: 0,
    maxRanks: 3,
    nodeType: 'single',
    treeType: 'spec',
    children: [],
  };
}

function player(name: string, talents: Record<number, number>): TopPlayer {
  return {
    stats: {
      name,
      avgIlvl: 639,
      primaryStat: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      vers: 0,
      talents,
      dps: 300000,
      killTime: '4:23',
    },
    rotation: { name, fightDurationMs: 263000, casts: {}, buffs: {} },
    damageTable: { entries: [] },
  };
}

const NODES = [node(1, [101], 'Sabertooth'), node(2, [102], 'Veinripper'), node(3, [103], 'Rip')];
const REFERENCES = [player('Aidan', { 102: 3, 103: 1 }), player('Brea', { 102: 3, 103: 1 })];

describe('TalentDiff', () => {
  it('shows both difference groups and hides the shared nodes behind a count', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 101: 1, 103: 1 }} topPlayers={REFERENCES} />);

    expect(screen.getByText('Sabertooth')).toBeInTheDocument();
    expect(screen.getByText('Veinripper')).toBeInTheDocument();
    expect(screen.getByText(/1 identical node/)).toBeInTheDocument();
  });

  it('shows how many references took each of their talents', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 101: 1, 103: 1 }} topPlayers={REFERENCES} />);

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('says so when there is nothing to compare against', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 101: 1 }} topPlayers={[]} />);

    expect(screen.getByText(/No comparable logs/)).toBeInTheDocument();
    expect(screen.queryByText('2 / 2')).not.toBeInTheDocument();
  });

  it('reports an identical build rather than showing empty groups', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 102: 3, 103: 1 }} topPlayers={REFERENCES} />);

    expect(screen.getByText(/Identical build/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/results/__tests__/TalentDiff.test.tsx`
Expected: FAIL — `Failed to load url ../TalentDiff`.

- [ ] **Step 3: Implement**

```tsx
// src/components/results/TalentDiff.tsx
import type { TalentDiffEntry } from '@/lib/comparison/talent-diff';
import type { TalentNode, TopPlayer } from '@/types';
import { Card } from '@/components/ui/Card';
import { diffTalents } from '@/lib/comparison/talent-diff';

interface TalentDiffProps {
  nodes: TalentNode[];
  myTalents: Record<number, number>;
  topPlayers: TopPlayer[];
}

function EntryRow({ entry, accent }: { entry: TalentDiffEntry; accent: 'mine' | 'theirs' }) {
  return (
    <li
      className={`flex items-baseline justify-between gap-3 rounded-xs border-l-2 bg-surface-raised px-3 py-2 ${
        accent === 'mine' ? 'border-deviation' : 'border-brass'
      }`}
    >
      <span className="font-sans text-xs text-text">{entry.label}</span>
      <span className="shrink-0 font-mono text-2xs text-muted">
        {entry.referenceTotal > 0 ? `${entry.referenceCount} / ${entry.referenceTotal}` : '—'}
      </span>
    </li>
  );
}

export function TalentDiff({ nodes, myTalents, topPlayers }: TalentDiffProps) {
  const { mineOnly, theirsOnly, sharedCount, referenceTotal } = diffTalents(
    nodes,
    myTalents,
    topPlayers
  );

  if (referenceTotal === 0) {
    return (
      <Card header="Build">
        <p className="font-sans text-xs text-muted">
          No comparable logs — showing your talents only.
        </p>
        <ul className="mt-3 flex flex-col gap-1">
          {mineOnly.map((entry) => (
            <EntryRow key={entry.nodeId} entry={entry} accent="mine" />
          ))}
        </ul>
      </Card>
    );
  }

  if (mineOnly.length === 0 && theirsOnly.length === 0) {
    return (
      <Card header="Build differences">
        <p className="font-sans text-xs text-muted">
          Identical build — every one of the {sharedCount} nodes matches the references.
        </p>
      </Card>
    );
  }

  return (
    <Card header={`Build differences · ${referenceTotal} references`}>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h4 className="mb-2 font-sans text-2xs tracking-[0.12em] text-deviation uppercase">
            You only · {mineOnly.length}
          </h4>
          <ul className="flex flex-col gap-1">
            {mineOnly.map((entry) => (
              <EntryRow key={entry.nodeId} entry={entry} accent="mine" />
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-2 font-sans text-2xs tracking-[0.12em] text-brass uppercase">
            References only · {theirsOnly.length}
          </h4>
          <ul className="flex flex-col gap-1">
            {theirsOnly.map((entry) => (
              <EntryRow key={entry.nodeId} entry={entry} accent="theirs" />
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 border-t border-border pt-3 font-sans text-2xs text-dim">
        {sharedCount} identical node{sharedCount === 1 ? '' : 's'} — hidden
      </p>
    </Card>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/results/__tests__/TalentDiff.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/results/TalentDiff.tsx src/components/results/__tests__/TalentDiff.test.tsx
git commit -m "feat(results): add the talent build-difference view"
```

---

## Task 9: Rotation comparison logic

Covers **both** tables the old `RotationTable` rendered: casts per minute and buff uptimes. They share a shape — one value of yours, a set of reference values — so one function serves both.

**Files:**
- Create: `src/lib/comparison/rotation-stats.ts`
- Test: `src/lib/comparison/__tests__/rotation-stats.test.ts`

**Interfaces:**
- Consumes: `RotationSummary`, `TopPlayer` from `@/types`.
- Produces:

```ts
export interface AbilityComparison {
  name: string;
  mine: number;
  referenceMin: number | null;
  referenceMax: number | null;
  referenceMedian: number | null;
  deviationPct: number | null;
  referenceTotal: number;
}

export function compareCasts(character: RotationSummary, topPlayers: TopPlayer[]): AbilityComparison[];
export function compareUptimes(character: RotationSummary, topPlayers: TopPlayer[]): AbilityComparison[];
```

Rules, applied identically by both:
- The ability set is the union of the character's and every reference's.
- A missing value counts as `0` — not lancing a spell the references lance is information, not an absence.
- `deviationPct = (mine − referenceMedian) / referenceMedian × 100`, rounded to one decimal.
- `deviationPct` is `null` when the median is `0` (no reference uses it) or when there are no references.
- Sorted by `|deviationPct|` descending; entries with a `null` deviation sort last, by `mine` descending.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/comparison/__tests__/rotation-stats.test.ts
import type { RotationSummary, TopPlayer } from '@/types';
import { describe, expect, it } from 'vitest';
import { compareCasts, compareUptimes } from '../rotation-stats';

function reference(name: string, perMin: Record<string, number>, buffs: Record<string, number> = {}): TopPlayer {
  return {
    stats: {
      name,
      avgIlvl: 639,
      primaryStat: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      vers: 0,
      talents: {},
      dps: 300000,
      killTime: '4:23',
    },
    rotation: {
      name,
      fightDurationMs: 263000,
      casts: Object.fromEntries(
        Object.entries(perMin).map(([k, v]) => [k, { casts: Math.round(v * 4), perMin: v }])
      ),
      buffs,
    },
    damageTable: { entries: [] },
  };
}

const MINE: RotationSummary = {
  name: 'Jumbaa',
  fightDurationMs: 263000,
  casts: {
    Shred: { casts: 36, perMin: 8.2 },
    'Ferocious Bite': { casts: 18, perMin: 4.1 },
  },
  buffs: { "Tiger's Fury": 42 },
};

const REFERENCES = [
  reference('Aidan', { Shred: 8, 'Ferocious Bite': 6.6, Thrash: 1.8 }, { "Tiger's Fury": 55 }),
  reference('Brea', { Shred: 8.4, 'Ferocious Bite': 7.2, Thrash: 1.6 }, { "Tiger's Fury": 51 }),
  reference('Cass', { Shred: 7.6, 'Ferocious Bite': 5.4, Thrash: 2.1 }, { "Tiger's Fury": 53 }),
];

describe('compareCasts', () => {
  const rows = compareCasts(MINE, REFERENCES);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

  it('reports the reference range rather than a single value', () => {
    expect(byName['Ferocious Bite'].referenceMin).toBe(5.4);
    expect(byName['Ferocious Bite'].referenceMax).toBe(7.2);
    expect(byName['Ferocious Bite'].referenceMedian).toBe(6.6);
  });

  it('computes the deviation against the median', () => {
    // (4.1 - 6.6) / 6.6 = -37.9 %
    expect(byName['Ferocious Bite'].deviationPct).toBe(-37.9);
  });

  it('counts an ability the player never casts as zero, not as absent', () => {
    expect(byName.Thrash.mine).toBe(0);
    expect(byName.Thrash.deviationPct).toBe(-100);
  });

  it('sorts by absolute deviation, largest first', () => {
    expect(rows.map((r) => r.name)).toEqual(['Thrash', 'Ferocious Bite', 'Shred']);
  });

  it('returns a null deviation when no reference uses the ability', () => {
    const soloAbility = compareCasts(
      { ...MINE, casts: { Swipe: { casts: 4, perMin: 1 } } },
      REFERENCES
    );

    expect(soloAbility.find((r) => r.name === 'Swipe')?.deviationPct).toBeNull();
  });

  it('returns the player values alone when there are no references', () => {
    const rows = compareCasts(MINE, []);

    expect(rows.map((r) => r.name)).toEqual(['Shred', 'Ferocious Bite']);
    expect(rows[0].referenceMedian).toBeNull();
    expect(rows[0].deviationPct).toBeNull();
    expect(rows[0].referenceTotal).toBe(0);
  });
});

describe('compareUptimes', () => {
  it('applies the same rules to buff uptimes', () => {
    const [row] = compareUptimes(MINE, REFERENCES);

    expect(row.name).toBe("Tiger's Fury");
    expect(row.mine).toBe(42);
    expect(row.referenceMin).toBe(51);
    expect(row.referenceMax).toBe(55);
    expect(row.deviationPct).toBe(-20.8); // (42 - 53) / 53
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/comparison/__tests__/rotation-stats.test.ts`
Expected: FAIL — `Failed to load url ../rotation-stats`.

- [ ] **Step 3: Implement**

```ts
// src/lib/comparison/rotation-stats.ts
import type { RotationSummary, TopPlayer } from '@/types';

export interface AbilityComparison {
  name: string;
  mine: number;
  referenceMin: number | null;
  referenceMax: number | null;
  referenceMedian: number | null;
  deviationPct: number | null;
  referenceTotal: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Shared by casts and uptimes: both are "one value of mine against a set of theirs". */
function compare(
  mineByName: Record<string, number>,
  referencesByName: Record<string, number>[]
): AbilityComparison[] {
  const names = [
    ...new Set([...Object.keys(mineByName), ...referencesByName.flatMap((r) => Object.keys(r))]),
  ];
  const referenceTotal = referencesByName.length;

  const rows = names.map((name): AbilityComparison => {
    const mine = mineByName[name] ?? 0;

    if (referenceTotal === 0) {
      return {
        name,
        mine,
        referenceMin: null,
        referenceMax: null,
        referenceMedian: null,
        deviationPct: null,
        referenceTotal: 0,
      };
    }

    const theirs = referencesByName.map((r) => r[name] ?? 0);
    const med = median(theirs);

    return {
      name,
      mine,
      referenceMin: Math.min(...theirs),
      referenceMax: Math.max(...theirs),
      referenceMedian: med,
      deviationPct: med === 0 ? null : round1(((mine - med) / med) * 100),
      referenceTotal,
    };
  });

  return rows.sort((a, b) => {
    if (a.deviationPct === null && b.deviationPct === null) return b.mine - a.mine;
    if (a.deviationPct === null) return 1;
    if (b.deviationPct === null) return -1;
    return Math.abs(b.deviationPct) - Math.abs(a.deviationPct);
  });
}

export function compareCasts(
  character: RotationSummary,
  topPlayers: TopPlayer[]
): AbilityComparison[] {
  const toPerMin = (casts: RotationSummary['casts']) =>
    Object.fromEntries(Object.entries(casts).map(([name, entry]) => [name, entry.perMin]));

  return compare(
    toPerMin(character.casts),
    topPlayers.map((p) => toPerMin(p.rotation.casts))
  );
}

export function compareUptimes(
  character: RotationSummary,
  topPlayers: TopPlayer[]
): AbilityComparison[] {
  return compare(
    character.buffs,
    topPlayers.map((p) => p.rotation.buffs)
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/comparison/__tests__/rotation-stats.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/comparison/rotation-stats.ts src/lib/comparison/__tests__/rotation-stats.test.ts
git commit -m "feat(comparison): compute per-ability reference ranges and deviations"
```

---

## Task 10: RotationCards component

**Files:**
- Create: `src/components/results/RotationCards.tsx`
- Test: `src/components/results/__tests__/RotationCards.test.tsx`

**Interfaces:**
- Consumes: `compareCasts`, `compareUptimes`, `AbilityComparison` (Task 9); `Card` (Task 2).
- Produces: `<RotationCards character: RotationSummary; topPlayers: TopPlayer[]>`

The position bar places `referenceMin`–`referenceMax` as a band and the player's value as a marker, both as percentages of a scale running from `0` to `max(referenceMax, mine) × 1.1`. That is the only computed inline style allowed in this plan.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/results/__tests__/RotationCards.test.tsx
import type { RotationSummary, TopPlayer } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RotationCards } from '../RotationCards';

function reference(name: string, perMin: Record<string, number>): TopPlayer {
  return {
    stats: {
      name,
      avgIlvl: 639,
      primaryStat: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      vers: 0,
      talents: {},
      dps: 300000,
      killTime: '4:23',
    },
    rotation: {
      name,
      fightDurationMs: 263000,
      casts: Object.fromEntries(
        Object.entries(perMin).map(([k, v]) => [k, { casts: Math.round(v * 4), perMin: v }])
      ),
      buffs: {},
    },
    damageTable: { entries: [] },
  };
}

const MINE: RotationSummary = {
  name: 'Jumbaa',
  fightDurationMs: 263000,
  casts: { 'Ferocious Bite': { casts: 18, perMin: 4.1 } },
  buffs: {},
};

const REFERENCES = [
  reference('Aidan', { 'Ferocious Bite': 6.6 }),
  reference('Brea', { 'Ferocious Bite': 7.2 }),
];

describe('RotationCards', () => {
  it('shows the ability, the player value and the reference range', () => {
    render(<RotationCards character={MINE} topPlayers={REFERENCES} />);

    expect(screen.getByText('Ferocious Bite')).toBeInTheDocument();
    expect(screen.getByText('4.10')).toBeInTheDocument();
    expect(screen.getByText(/6\.60.*7\.20/)).toBeInTheDocument();
  });

  it('renders the deviation with a sign', () => {
    render(<RotationCards character={MINE} topPlayers={REFERENCES} />);

    expect(screen.getByText('−40.6 %')).toBeInTheDocument();
  });

  it('shows player values alone when there is nothing to compare against', () => {
    render(<RotationCards character={MINE} topPlayers={[]} />);

    expect(screen.getByText('4.10')).toBeInTheDocument();
    expect(screen.getByText(/No comparable logs/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/results/__tests__/RotationCards.test.tsx`
Expected: FAIL — `Failed to load url ../RotationCards`.

- [ ] **Step 3: Implement**

```tsx
// src/components/results/RotationCards.tsx
import type { AbilityComparison } from '@/lib/comparison/rotation-stats';
import type { RotationSummary, TopPlayer } from '@/types';
import { Card } from '@/components/ui/Card';
import { compareCasts, compareUptimes } from '@/lib/comparison/rotation-stats';

interface RotationCardsProps {
  character: RotationSummary;
  topPlayers: TopPlayer[];
}

function formatDeviation(pct: number): string {
  // U+2212 minus sign, not a hyphen — it aligns with digits in a monospace face.
  const sign = pct < 0 ? '−' : '+';
  return `${sign}${Math.abs(pct).toFixed(1)} %`;
}

function AbilityCard({ row, unit }: { row: AbilityComparison; unit: string }) {
  const hasRange = row.referenceMin !== null && row.referenceMax !== null;
  const scale = Math.max(row.referenceMax ?? 0, row.mine) * 1.1 || 1;
  const bandLeft = hasRange ? (row.referenceMin! / scale) * 100 : 0;
  const bandWidth = hasRange ? ((row.referenceMax! - row.referenceMin!) / scale) * 100 : 0;
  const markerLeft = (row.mine / scale) * 100;

  return (
    <li className="rounded-sm border border-border bg-surface-raised p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-xs text-text">{row.name}</span>
        {row.deviationPct !== null && (
          <span className="shrink-0 font-mono text-xs text-deviation">
            {formatDeviation(row.deviationPct)}
          </span>
        )}
      </div>

      <div className="relative mt-2 h-1 rounded-full bg-border">
        {hasRange && (
          <div
            className="absolute h-1 rounded-full bg-border-strong"
            style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
          />
        )}
        <div
          className="absolute -top-1 h-3 w-0.5 bg-deviation"
          style={{ left: `${markerLeft}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between font-mono text-2xs text-dim">
        <span>
          you <span className="text-text">{row.mine.toFixed(2)}</span> {unit}
        </span>
        {hasRange && (
          <span>
            references {row.referenceMin!.toFixed(2)} – {row.referenceMax!.toFixed(2)}
          </span>
        )}
      </div>
    </li>
  );
}

export function RotationCards({ character, topPlayers }: RotationCardsProps) {
  const casts = compareCasts(character, topPlayers);
  const uptimes = compareUptimes(character, topPlayers).filter((row) => row.mine > 0);

  return (
    <div className="flex flex-col gap-4">
      <Card header={topPlayers.length > 0 ? 'Rotation · by deviation' : 'Rotation'}>
        {topPlayers.length === 0 && (
          <p className="mb-3 font-sans text-2xs text-muted">
            No comparable logs — showing your rotation only.
          </p>
        )}
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {casts.map((row) => (
            <AbilityCard key={row.name} row={row} unit="/min" />
          ))}
        </ul>
      </Card>

      {uptimes.length > 0 && (
        <Card header="Uptime">
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {uptimes.map((row) => (
              <AbilityCard key={row.name} row={row} unit="%" />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/results/__tests__/RotationCards.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/results/RotationCards.tsx src/components/results/__tests__/RotationCards.test.tsx
git commit -m "feat(results): add per-ability rotation cards with reference ranges"
```

---

## Task 11: Wire the new views in and delete the old ones

**Files:**
- Modify: `src/components/results/ComparisonTab.tsx`
- Delete: `src/components/results/TalentTree.tsx`, `src/components/results/RotationTable.tsx`

**Interfaces:**
- Consumes: `TalentDiff` (Task 8), `RotationCards` (Task 10).
- Produces: `ComparisonTab` props are unchanged, so `BossContentPanel` needs no edit.

- [ ] **Step 1: Replace the imports and the two sections**

In `ComparisonTab.tsx`, swap `import { RotationTable } from './RotationTable';` and `import { TalentTree } from './TalentTree';` for:

```tsx
import { RotationCards } from './RotationCards';
import { TalentDiff } from './TalentDiff';
```

Replace the `Rotation` section body with:

```tsx
<RotationCards character={result.character.rotation} topPlayers={result.topPlayers} />
```

Replace the `Talents` section body with:

```tsx
<TalentDiff
  nodes={talentNodes}
  myTalents={result.character.stats.talents}
  topPlayers={result.topPlayers}
/>
```

- [ ] **Step 2: Remove the early return on an empty reference set**

Delete the `if (result.topPlayers.length === 0)` block at `ComparisonTab.tsx:46-59`. Both new components handle that case themselves and still show the player's own data, which the early return threw away.

- [ ] **Step 3: Delete the replaced components**

```bash
git rm src/components/results/TalentTree.tsx src/components/results/RotationTable.tsx
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: all pass. Typecheck is what proves no other file still imports the deleted components.

- [ ] **Step 5: Commit**

```bash
git add src/components/results/ComparisonTab.tsx
git commit -m "refactor(results): replace the talent tree and rotation table"
```

---

## Tasks 12–16: Surface migration

These five tasks apply the same operation to different files: delete every `style={{}}`, express the result with the Task 1 tokens and the Task 2–5 primitives, and make it work at 360px. No behaviour changes, no prop changes, no logic changes.

**Delegation:** one Sonnet subagent per task. The prompt must contain the token table from Task 6 Step 1, the primitive signatures from the Interfaces blocks of Tasks 2–5, and the checklist below.

**Per-task checklist — every task from 12 to 16 repeats all of it:**

- [ ] Replace each `style={{}}` with utility classes, using the Task 6 Step 1 mapping table.
- [ ] Replace hand-rolled buttons with `Button`, hand-rolled fields with `Input` / `Select`, hand-rolled panels with `Card`.
- [ ] Wrap any element that can exceed the viewport — tables, long rows of chips — in `ScrollArea`.
- [ ] Put every numeral in `font-mono`.
- [ ] Check that no colour, size, radius or spacing literal remains in the file.
- [ ] Run `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check` — all must pass, with the existing tests unmodified.
- [ ] With `pnpm dev` running, use the `webapp-testing` skill to load the surface at **360**, **768** and **1280**. Assert at each width: `document.body.scrollWidth <= window.innerWidth`, no clipped text, every control reachable by keyboard with a visible focus ring.
- [ ] Commit with `refactor(ui): move <surface> onto the design system`.

### Task 12: Result surfaces

**Files:** `src/components/results/OverviewTab.tsx`, `ComparisonTab.tsx`, `DpsBanner.tsx`, `StatsTable.tsx`, `DamageBreakdown.tsx`, `src/components/shared/BossContentPanel.tsx`, `src/components/results/BossSidebar.tsx`

Specifics beyond the checklist:
- `StatsTable` and `DamageBreakdown` go inside `ScrollArea`.
- `BossContentPanel`'s hand-rolled tab bar is replaced by `Tabs` (Task 4), keeping its existing `useState<TabId>`.
- `BossSidebar` is wrapped in `Sheet` (Task 5), with `triggerLabel` set to the active boss name and `title` set to `Bosses`.

### Task 13: Dashboard shells

**Files:** `src/components/character/CharacterDashboard.tsx`, `src/components/report/ReportDashboard.tsx`, `src/components/shared/DashboardHeader.tsx`, `SidebarSwitcher.tsx`, `src/components/character/UserCharacterSwitcher.tsx`, `src/components/report/CharacterSwitcher.tsx`

Specifics beyond the checklist:
- Delete `DashboardHeader`'s `paddingRight: '170px'`. It exists to dodge the fixed `AuthHeader`; replace it with a flex row that reserves the space by layout instead.
- `SidebarSwitcher` is wrapped in `Sheet`, with `triggerLabel` set to the active character name and `title` set to `Characters`.
- The dashboard layout becomes a single column below `md` and a sidebar-plus-content grid from `md` up.

### Task 14: Forms

**Files:** `src/components/forms/CharacterForm.tsx`, `LoggedInCharacterForm.tsx`, `ReportForm.tsx`, `SpecSelector.tsx`, `RealmAutocomplete.tsx`, `EncounterSelector.tsx`, `DifficultyRegionFields.tsx`
**Delete at the end of this task:** `src/components/forms/formStyles.ts`

Specifics beyond the checklist:
- `DifficultyRegionFields.test.tsx` and the `ReportForm` / `LoggedInCharacterForm` integration tests must pass untouched. They query by label and role, which `Input` and `Select` preserve through their generated ids.
- `RealmAutocomplete`'s dropdown must stay reachable at 360px: full width, and capped with `max-h-64 overflow-y-auto`.
- `EncounterSelector`'s checkbox grid goes to one column below `sm`.

### Task 15: AI report, mode selector, auth header

**Files:** `src/components/ai/AIReportTab.tsx`, `src/components/ai/StreamingText.tsx`, `src/components/ui/ModeSelector.tsx`, `src/components/auth/AuthHeader.tsx`

Specifics beyond the checklist:
- `AIReportTab` is the longest file at 466 lines. Its provider picker, key fields and boss selector become `Select` and `Input`; its buttons become `Button`.
- The streamed report body is prose: it uses `font-sans`, not `font-mono`, with `max-w-[70ch]` for line length.
- `ModeSelector`'s two cards stack below `sm`.
- `AuthHeader` stops being `position: fixed` at every width — below `md` it sits in the normal flow, so nothing has to dodge it.

### Task 16: Marketing landing

**Files:** `src/components/landing/MarketingLanding.tsx`

Structure, sections and copy stay exactly as they are. Only tokens, primitives and responsive behaviour change. Every section becomes a single column below `md`; the sticky nav collapses to a logo plus the sign-in `Button`.

---

## Final verification

- [ ] **Step 1: Confirm no inline styles survive**

Run: `grep -rn "style={{" src/components src/app | grep -v "width:" | grep -v "left:"`
Expected: no output. The only permitted matches are the computed bar geometry in `RotationCards`.

- [ ] **Step 2: Confirm the old tokens are gone**

Run: `grep -rn -- "--gold\|--crimson\|--text-dim\|--font-display\|--font-mono" src/components src/app/globals.css`
Expected: only the `@theme` declarations in `globals.css`.

- [ ] **Step 3: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all pass.

- [ ] **Step 4: End-to-end walkthrough**

With `pnpm dev` running, use the `webapp-testing` skill at **360**, **768** and **1280**. Walk both paths: character mode — form, results, all three tabs, AI report — and report mode with a WCL report code. At every step assert no horizontal page overflow and no clipped text.

- [ ] **Step 5: Update the code map**

Add `combatant`-style entries for `comparison/talent-diff.ts` and `comparison/rotation-stats.ts` to the code map in `CLAUDE.md`, and note that UI styling goes through Tailwind tokens declared in `globals.css`.

```bash
git add CLAUDE.md
git commit -m "docs: record the design system in the code map"
```
