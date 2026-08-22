'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';

const MODES = [
  {
    icon: '⚔️',
    title: 'Character analysis',
    desc: 'Give a character name. We find your best parse, then build a bench of players who actually ran your fight — same tier set, same gear band, same kill window, no Power Infusion carrying them.',
  },
  {
    icon: '📋',
    title: 'Report analysis',
    desc: 'Paste any WarcraftLogs report code and pick anyone in the raid. Same comparison, on a pull you choose rather than the one the rankings picked for you.',
  },
  {
    icon: '🏅',
    title: 'Raid ranking',
    desc: 'Rank everyone in a single pull — on percentile when the logs carry one, on raw damage when they do not. The screen names which of the two it used.',
  },
  {
    icon: '📈',
    title: 'Pull comparison',
    desc: 'Two of your own pulls, side by side. The gap is split into what came from gear, what came from kill time, and what came from you.',
  },
] as const;

const STEPS = [
  { n: '1', title: 'Sign in', desc: 'Connect your Battle.net account' },
  { n: '2', title: 'Pick a character', desc: 'Or paste a WCL report code' },
  { n: '3', title: 'Analyse', desc: 'Get your breakdown in seconds' },
] as const;

const TIERS = [
  {
    name: 'Raider',
    scope: 'Individual · season pass',
    lines: [
      'Full comparability filter — tier set, externals, item level, kill time',
      'A banner when no legitimate bench exists, instead of a number that lies',
      'Progression history across the whole tier, not one snapshot',
      'AI coaching report on every parse',
    ],
  },
  {
    name: 'Roster',
    scope: 'Guild · season pass',
    lines: [
      'One purchase covers the roster — the raid leader buys, everyone is in',
      'Who is progressing and who has stalled, across the tier',
      'Player against player at the same role, on the same fights',
      'Not an unlocked copy of the individual screen — a view that only exists at roster scale',
    ],
  },
] as const;

function Divider({ label }: { label: string }) {
  return (
    <div className="mx-auto flex max-w-[680px] items-center gap-4 px-6">
      <div className="bg-border-strong h-px flex-1" />
      <div className="text-2xs text-muted tracking-display font-mono whitespace-nowrap uppercase">
        {label}
      </div>
      <div className="bg-border-strong h-px flex-1" />
    </div>
  );
}

function CtaButton({ children }: { children: React.ReactNode }) {
  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={() => void signIn('battlenet')}
      className="border-brass text-brass hover:text-brass-bright bg-transparent font-mono tracking-widest uppercase"
    >
      {children}
    </Button>
  );
}

export function MarketingLanding() {
  return (
    <div className="bg-bg text-text h-full">
      {/* Nav — logo only. The global AuthHeader (rendered in layout.tsx, above this page)
          already provides the sign-in control, so this nav does not duplicate it. */}
      <nav className="bg-bg/90 border-border sticky top-0 z-30 flex items-center border-b px-8 py-3 backdrop-blur-sm">
        <span className="font-display text-brass text-lg tracking-wide">LogLense</span>
      </nav>

      {/* Hero */}
      <section className="from-brass/7 bg-radial-[at_50%_0%] to-transparent px-6 pt-24 pb-20 text-center">
        <div className="text-2xs text-muted tracking-display mb-4 font-mono uppercase">
          WarcraftLogs · Performance Analysis
        </div>
        <h1 className="font-display text-brass mb-5 text-4xl leading-none md:text-5xl lg:text-6xl">
          LogLense
        </h1>
        <p className="text-dim mx-auto mb-10 max-w-[560px] font-mono text-xs leading-[1.7] md:text-base">
          Half the gap you are shown is not yours.{' '}
          <span className="text-text">It belongs to the players you are compared against.</span>
          <br />
          LogLense benches the ones who are not comparable — and tells you when nobody is.
        </p>
        <CtaButton>Sign in with Battle.net</CtaButton>
      </section>

      <Divider label="Why it matters" />

      {/* Proof — the one number no competitor can produce */}
      <section className="mx-auto max-w-[720px] px-6 py-16">
        <div className="border-border bg-surface rounded-md border px-6 py-7 md:px-8 md:py-9">
          <div className="text-2xs text-muted tracking-caps mb-4 font-mono uppercase">
            One real analysis
          </div>
          <p className="text-dim font-mono text-xs leading-[1.8] md:text-sm">
            The reference pool sat at item level <span className="text-text">292</span>. The player
            was at <span className="text-text">284</span>. Filtered down to players who actually had
            his gear, his tier set and his kill time, the deficit we were about to put on his screen
            fell from <span className="text-muted line-through">55k DPS</span> to{' '}
            <span className="text-deviation">25k DPS</span>.
          </p>
          <p className="text-dim mt-4 font-mono text-xs leading-[1.8] md:text-sm">
            <span className="text-text">
              More than half of what looked like a rotation problem was somebody else&apos;s gear.
            </span>{' '}
            Every tool will show you a percentile. Ours is the one that refuses to show you a
            comparison it cannot defend.
          </p>
        </div>
      </section>

      <Divider label="What you get" />

      {/* Modes */}
      <section className="mx-auto max-w-[900px] px-6 py-16">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {MODES.map((mode) => (
            <div key={mode.title} className="border-border bg-surface rounded-sm border px-5 py-6">
              <span className="mb-3 block text-lg">{mode.icon}</span>
              <div className="text-text mb-2 font-mono text-xs font-medium">{mode.title}</div>
              <p className="text-dim text-2xs font-mono leading-[1.65]">{mode.desc}</p>
            </div>
          ))}

          {/* AI Coaching Report — full width, hero card */}
          <div className="from-surface to-brass/6 border-brass/35 flex flex-col items-center gap-8 rounded-sm border bg-linear-[135deg] px-7 py-8 text-center md:col-span-2 md:flex-row md:text-left">
            <div className="shrink-0 text-center">
              <span className="block text-4xl">🤖</span>
            </div>
            <div className="flex-1">
              <div className="text-brass mb-2.5 flex items-center justify-center gap-2.5 font-mono text-base font-medium md:justify-start">
                AI Coaching Report
                <span className="text-brass border-brass-dim text-2xs rounded-xs border px-1.5 py-0.5 tracking-widest uppercase">
                  Pro
                </span>
              </div>
              <p className="text-dim font-mono text-xs leading-[1.75]">
                An AI reads the comparison — not your raw log — and writes what to change first.{' '}
                <span className="text-text">
                  Specific actions ranked by impact, for your character, your boss, your kill.
                </span>{' '}
                It is only worth reading because the bench underneath it is honest.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Divider label="How it works" />

      {/* Steps */}
      <section className="px-6 py-16">
        <div className="relative mx-auto flex max-w-[600px] flex-col items-center gap-8 md:flex-row md:items-start md:gap-0">
          {/* connecting line — desktop only, mirrors the 3-up row layout */}
          <div className="bg-border absolute top-5 right-[calc(16.6%+12px)] left-[calc(16.6%+12px)] hidden h-px md:block" />
          {STEPS.map((step) => (
            <div key={step.n} className="flex flex-col items-center gap-2.5 md:flex-1">
              <div className="bg-surface border-border font-display text-muted relative z-10 flex h-10 w-10 items-center justify-center rounded-full border text-base">
                <span className="font-mono">{step.n}</span>
              </div>
              <div className="text-dim text-2xs max-w-[100px] text-center font-mono leading-normal">
                <span className="text-text mb-0.5 block font-medium">{step.title}</span>
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Divider label="Two levels" />

      {/* Tiers — named and described, deliberately unpriced. The public page carries no
          amount, no cart and no subscribe button; its only call to action is the sign-in
          above. See PRODUCT_CONTEXT.md §5. */}
      <section className="mx-auto max-w-[900px] px-6 py-16">
        <p className="text-dim mx-auto mb-8 max-w-[560px] text-center font-mono text-xs leading-[1.7]">
          Reading a single log stays free — that much WarcraftLogs already gives you. What is paid
          is the comparison, and it is sold by season, not by month: you pay for the tier you are
          raiding, and there is nothing to remember to cancel.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {TIERS.map((tier) => (
            <div key={tier.name} className="border-border bg-surface rounded-md border px-6 py-7">
              <div className="font-display text-brass text-xl">{tier.name}</div>
              <div className="text-2xs text-muted tracking-caps mt-1 mb-5 font-mono uppercase">
                {tier.scope}
              </div>
              <ul className="flex flex-col gap-2.5">
                {tier.lines.map((line) => (
                  <li
                    key={line}
                    className="text-dim text-2xs flex gap-2.5 font-mono leading-[1.65]"
                  >
                    <span className="text-brass-dim shrink-0">▸</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="text-muted text-2xs mt-8 text-center font-mono tracking-wider uppercase">
          Pricing announced later · free for everyone during the closed beta
        </p>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-20 text-center">
        <h2 className="font-display text-brass mb-3 text-2xl">A new tier just opened</h2>
        <p className="text-dim mx-auto mb-8 max-w-[440px] font-mono text-xs leading-[1.7]">
          No guide has been written yet. For a few weeks, your own logs are the only source of truth
          there is — connect your Battle.net account and read them properly.
        </p>
        <CtaButton>Sign in with Battle.net</CtaButton>
      </section>

      {/* Footer */}
      <footer className="border-border flex flex-col items-center gap-2 border-t px-8 py-5 text-center md:flex-row md:items-center md:justify-between md:text-left">
        <span className="text-border text-2xs font-mono">LogLense © 2026</span>
        <span className="text-border text-2xs font-mono">
          Not affiliated with Blizzard Entertainment or WarcraftLogs
        </span>
      </footer>
    </div>
  );
}
