'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/Button';

const STEPS = [
  { n: '1', title: 'Sign in', desc: 'Connect your Battle.net account' },
  { n: '2', title: 'Pick a character', desc: 'Or paste a WCL report code' },
  { n: '3', title: 'Analyse', desc: 'Get your breakdown in seconds' },
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
        <p className="text-dim mx-auto mb-10 max-w-[520px] font-mono text-xs leading-[1.7] md:text-base">
          Stop reading raw logs. <span className="text-text">Understand your performance.</span>
          <br />
          Compare your rotation, talents and stats against the players at the top of the leaderboard
          — and get AI coaching on exactly what to fix.
        </p>
        <CtaButton>Sign in with Battle.net</CtaButton>
      </section>

      <Divider label="What you get" />

      {/* Feature cards */}
      <section className="mx-auto max-w-[900px] px-6 py-16">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Rotation Analysis */}
          <div className="border-border bg-surface rounded-sm border px-5 py-6">
            <span className="mb-3 block text-lg">⚔️</span>
            <div className="text-text mb-2 font-mono text-xs font-medium">Rotation Analysis</div>
            <p className="text-dim text-2xs font-mono leading-[1.65]">
              See your cast timeline side-by-side with top players. Identify missed procs, clipped
              buffs, and dead GCDs instantly.
            </p>
          </div>

          {/* Talent & Stat Comparison */}
          <div className="border-border bg-surface rounded-sm border px-5 py-6">
            <span className="mb-3 block text-lg">📊</span>
            <div className="text-text mb-2 font-mono text-xs font-medium">
              Talent & Stat Comparison
            </div>
            <p className="text-dim text-2xs font-mono leading-[1.65]">
              How does your build compare to the 99th percentile on each boss? Talent choices, gear
              stats, and itemisation — all in one view.
            </p>
          </div>

          {/* WCL Log Analysis */}
          <div className="border-border bg-surface rounded-sm border px-5 py-6">
            <span className="mb-3 block text-lg">📋</span>
            <div className="text-text mb-2 font-mono text-xs font-medium">WCL Log Analysis</div>
            <p className="text-dim text-2xs font-mono leading-[1.65]">
              Paste any WarcraftLogs report code. Analyse any player in the raid — your character or
              anyone else&apos;s kills.
            </p>
          </div>

          {/* AI Coaching Report — full width, hero card */}
          <div className="from-surface to-brass/6 border-brass/35 flex flex-col items-center gap-8 rounded-sm border bg-linear-[135deg] px-7 py-8 text-center md:col-span-2 md:flex-row md:text-left lg:col-span-3">
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
                An AI reads your parse and writes a personalised coaching report. Not generic tips —{' '}
                <span className="text-text">
                  specific actions ranked by impact for your character, your boss, your kill.
                </span>{' '}
                Understand in plain language exactly what is holding your DPS back and what to fix
                first.
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

      {/* Bottom CTA */}
      <section className="px-6 py-20 text-center">
        <h2 className="font-display text-brass mb-3 text-2xl">Ready to improve?</h2>
        <p className="text-dim mb-8 font-mono text-xs">
          Connect your Battle.net account and analyse your first parse in under a minute.
        </p>
        <CtaButton>Sign in with Battle.net</CtaButton>
      </section>

      {/* Footer */}
      <footer className="border-border flex flex-col items-center gap-2 border-t px-8 py-5 text-center md:flex-row md:items-center md:justify-between md:text-left">
        <span className="text-border text-2xs font-mono">LogLense © 2025</span>
        <span className="text-border text-2xs font-mono">
          Not affiliated with Blizzard Entertainment or WarcraftLogs
        </span>
      </footer>
    </div>
  );
}
