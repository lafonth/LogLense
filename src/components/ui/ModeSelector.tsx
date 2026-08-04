'use client';

const CARD_CLASS =
  'bg-surface border-border hover:border-brass flex min-w-56 flex-1 cursor-pointer flex-col gap-3 rounded-md border p-8 text-left transition-colors';

const TITLE_CLASS = 'text-text font-mono text-sm tracking-[0.08em] uppercase';

const DESC_CLASS = 'text-dim font-mono text-xs leading-relaxed';

interface ModeSelectorProps {
  onSelect: (mode: 'character' | 'report') => void;
}

export function ModeSelector({ onSelect }: ModeSelectorProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-12 px-6 py-12">
      <div className="text-muted font-mono text-xs tracking-[0.12em] uppercase">
        LogLense — Choose Analysis Mode
      </div>
      <div className="flex flex-wrap justify-center gap-6">
        <button onClick={() => onSelect('character')} className={CARD_CLASS}>
          <div className={TITLE_CLASS}>Analyse a Character</div>
          <div className={DESC_CLASS}>
            Enter a character name, server, and region. Pulls their best parses from WarcraftLogs
            rankings.
          </div>
        </button>
        <button onClick={() => onSelect('report')} className={CARD_CLASS}>
          <div className={TITLE_CLASS}>Analyse a Report</div>
          <div className={DESC_CLASS}>
            Paste a WarcraftLogs report code. Pick any character from the raid and analyse their
            kills.
          </div>
        </button>
      </div>
    </div>
  );
}
