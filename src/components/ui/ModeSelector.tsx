'use client';

const CARD_CLASS =
  'bg-surface border-border hover:border-brass focus-visible:outline-brass-bright focus-visible:outline-2 focus-visible:outline-offset-2 flex min-w-56 flex-1 cursor-pointer flex-col gap-3 rounded-sm border p-8 text-left transition-colors';

const TITLE_CLASS = 'text-text font-mono text-sm tracking-wider uppercase';

const DESC_CLASS = 'text-dim font-mono text-xs leading-relaxed';

interface ModeSelectorProps {
  onSelect: (mode: 'character' | 'report' | 'raid' | 'pull') => void;
}

export function ModeSelector({ onSelect }: ModeSelectorProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-12 px-6 py-12">
      <div className="text-muted tracking-caps font-mono text-xs uppercase">
        LogLense — Choose Analysis Mode
      </div>
      <div className="flex flex-col flex-wrap justify-center gap-6 sm:flex-row">
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
        <button onClick={() => onSelect('raid')} className={CARD_CLASS}>
          <div className={TITLE_CLASS}>Sort a Raid</div>
          <div className={DESC_CLASS}>
            Paste a report code and pick a pull. Ranks the raid by how much room each player has
            left, and opens any of them into a full analysis.
          </div>
        </button>
        <button onClick={() => onSelect('pull')} className={CARD_CLASS}>
          <div className={TITLE_CLASS}>Compare Two Pulls</div>
          <div className={DESC_CLASS}>
            Pick two of your own pulls on the same boss. Splits the DPS difference between gear,
            kill time, and everything else.
          </div>
        </button>
      </div>
    </div>
  );
}
