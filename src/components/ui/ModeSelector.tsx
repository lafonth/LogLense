'use client';

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '32px 28px',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  transition: 'border-color 0.15s',
  minWidth: '220px',
  flex: 1,
  textAlign: 'left',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.95rem',
  color: 'var(--text)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const descStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.78rem',
  color: 'var(--text-dim)',
  lineHeight: 1.5,
};

interface ModeSelectorProps {
  onSelect: (mode: 'character' | 'report') => void;
}

export function ModeSelector({ onSelect }: ModeSelectorProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '48px',
        padding: '40px 24px',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: 'var(--gold-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
        }}
      >
        LogLense — Choose Analysis Mode
      </div>
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => onSelect('character')}
          style={cardStyle}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          }}
        >
          <div style={titleStyle}>Analyse a Character</div>
          <div style={descStyle}>
            Enter a character name, server, and region. Pulls their best parses from WarcraftLogs
            rankings.
          </div>
        </button>
        <button
          onClick={() => onSelect('report')}
          style={cardStyle}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          }}
        >
          <div style={titleStyle}>Analyse a Report</div>
          <div style={descStyle}>
            Paste a WarcraftLogs report code. Pick any character from the raid and analyse their
            kills.
          </div>
        </button>
      </div>
    </div>
  );
}
