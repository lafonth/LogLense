'use client';

import { signIn } from 'next-auth/react';

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
};

function Divider({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        maxWidth: '680px',
        margin: '0 auto',
        padding: '0 24px',
      }}
    >
      <div style={{ flex: 1, height: '1px', background: '#3d3550' }} />
      <div
        style={{
          fontSize: '0.65rem',
          color: 'var(--gold-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
          whiteSpace: 'nowrap',
          ...inputStyle,
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, height: '1px', background: '#3d3550' }} />
    </div>
  );
}

const ctaBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--gold)',
  borderRadius: '4px',
  color: 'var(--gold)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.82rem',
  padding: '11px 32px',
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};

export function MarketingLanding() {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text)' }}>
      {/* ── Nav — overlays the global AuthHeader ── */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 201,
          background: 'rgba(9,8,12,0.92)',
          borderBottom: '1px solid var(--border)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          height: '52px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.15rem',
            color: 'var(--gold)',
            letterSpacing: '0.04em',
          }}
        >
          LogLense
        </span>
        <button
          onClick={() => void signIn('battlenet')}
          style={{
            background: 'none',
            border: '1px solid var(--gold-dim)',
            borderRadius: '4px',
            color: 'var(--gold-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            padding: '5px 14px',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Sign in with Battle.net
        </button>
      </nav>

      {/* ── Hero ── */}
      <section
        style={{
          padding: '100px 24px 80px',
          textAlign: 'center',
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(198,168,74,0.07) 0%, transparent 65%)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            color: 'var(--gold-dim)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: '18px',
          }}
        >
          WarcraftLogs · Performance Analysis
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(3rem, 8vw, 5.5rem)',
            color: 'var(--gold)',
            fontWeight: 'normal',
            lineHeight: 1,
            marginBottom: '20px',
          }}
        >
          LogLense
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'clamp(0.85rem, 2vw, 1rem)',
            color: 'var(--text-dim)',
            lineHeight: 1.7,
            maxWidth: '520px',
            margin: '0 auto 40px',
          }}
        >
          Stop reading raw logs.{' '}
          <span style={{ color: 'var(--text)' }}>Understand your performance.</span>
          <br />
          Compare your rotation, talents and stats against the players at the top of the leaderboard
          — and get AI coaching on exactly what to fix.
        </p>
        <button onClick={() => void signIn('battlenet')} style={ctaBtnStyle}>
          Sign in with Battle.net
        </button>
      </section>

      <Divider label="What you get" />

      {/* ── Feature cards ── */}
      <section
        style={{
          padding: '64px 24px',
          maxWidth: '900px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          {/* Rotation Analysis */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '24px 20px',
            }}
          >
            <span style={{ fontSize: '1.3rem', display: 'block', marginBottom: '12px' }}>⚔️</span>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: 'var(--text)',
                fontWeight: 500,
                marginBottom: '8px',
              }}
            >
              Rotation Analysis
            </div>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--text-dim)',
                lineHeight: 1.65,
              }}
            >
              See your cast timeline side-by-side with top players. Identify missed procs, clipped
              buffs, and dead GCDs instantly.
            </p>
          </div>

          {/* Talent & Stat Comparison */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '24px 20px',
            }}
          >
            <span style={{ fontSize: '1.3rem', display: 'block', marginBottom: '12px' }}>📊</span>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: 'var(--text)',
                fontWeight: 500,
                marginBottom: '8px',
              }}
            >
              Talent & Stat Comparison
            </div>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--text-dim)',
                lineHeight: 1.65,
              }}
            >
              How does your build compare to the 99th percentile on each boss? Talent choices, gear
              stats, and itemisation — all in one view.
            </p>
          </div>

          {/* WCL Log Analysis */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '24px 20px',
            }}
          >
            <span style={{ fontSize: '1.3rem', display: 'block', marginBottom: '12px' }}>📋</span>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: 'var(--text)',
                fontWeight: 500,
                marginBottom: '8px',
              }}
            >
              WCL Log Analysis
            </div>
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--text-dim)',
                lineHeight: 1.65,
              }}
            >
              Paste any WarcraftLogs report code. Analyse any player in the raid — your character or
              anyone else&apos;s kills.
            </p>
          </div>

          {/* AI Coaching Report — full width, hero card */}
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              gap: '32px',
              alignItems: 'center',
              background: 'linear-gradient(135deg, var(--surface), rgba(198,168,74,0.06))',
              border: '1px solid rgba(198,168,74,0.35)',
              borderRadius: '6px',
              padding: '32px 28px',
            }}
          >
            <div style={{ flexShrink: 0, textAlign: 'center' }}>
              <span style={{ fontSize: '2.8rem', display: 'block' }}>🤖</span>
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1rem',
                  color: 'var(--gold)',
                  fontWeight: 500,
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                AI Coaching Report
                <span
                  style={{
                    fontSize: '0.6rem',
                    color: 'var(--gold)',
                    border: '1px solid rgba(198,168,74,0.4)',
                    borderRadius: '3px',
                    padding: '2px 6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  Pro
                </span>
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  color: 'var(--text-dim)',
                  lineHeight: 1.75,
                }}
              >
                An AI reads your parse and writes a personalised coaching report. Not generic tips —{' '}
                <span style={{ color: 'var(--text)' }}>
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

      {/* ── Steps ── */}
      <section style={{ padding: '64px 24px' }}>
        <div
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            display: 'flex',
            position: 'relative',
          }}
        >
          {/* connecting line */}
          <div
            style={{
              position: 'absolute',
              top: '20px',
              left: 'calc(16.6% + 12px)',
              right: 'calc(16.6% + 12px)',
              height: '1px',
              background: 'var(--border)',
            }}
          />
          {[
            { n: '1', title: 'Sign in', desc: 'Connect your Battle.net account' },
            { n: '2', title: 'Pick a character', desc: 'Or paste a WCL report code' },
            { n: '3', title: 'Analyse', desc: 'Get your breakdown in seconds' },
          ].map((step) => (
            <div
              key={step.n}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-display)',
                  fontSize: '1rem',
                  color: 'var(--gold-dim)',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {step.n}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: 'var(--text-dim)',
                  textAlign: 'center',
                  lineHeight: 1.5,
                  maxWidth: '100px',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    color: 'var(--text)',
                    marginBottom: '2px',
                    fontWeight: 500,
                  }}
                >
                  {step.title}
                </span>
                {step.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2rem',
            color: 'var(--gold)',
            fontWeight: 'normal',
            marginBottom: '12px',
          }}
        >
          Ready to improve?
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            color: 'var(--text-dim)',
            marginBottom: '32px',
          }}
        >
          Connect your Battle.net account and analyse your first parse in under a minute.
        </p>
        <button onClick={() => void signIn('battlenet')} style={ctaBtnStyle}>
          Sign in with Battle.net
        </button>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: '1px solid var(--border)',
          padding: '20px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--border)' }}
        >
          LogLense © 2025
        </span>
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--border)' }}
        >
          Not affiliated with Blizzard Entertainment or WarcraftLogs
        </span>
      </footer>
    </div>
  );
}
