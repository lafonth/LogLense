import type { Encounter } from '@/types';

interface EncounterSelectorProps {
  available: Encounter[];
  selected: Encounter[];
  onChange: (encounters: Encounter[]) => void;
}

const checkboxStyle: React.CSSProperties = {
  accentColor: 'var(--gold)',
  width: '14px',
  height: '14px',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.85rem',
  color: 'var(--text)',
  cursor: 'pointer',
  padding: '4px 0',
};

export function EncounterSelector({ available, selected, onChange }: EncounterSelectorProps) {
  const selectedIds = new Set(selected.map((e) => e.id));

  function toggle(enc: Encounter) {
    if (selectedIds.has(enc.id)) {
      onChange(selected.filter((e) => e.id !== enc.id));
    } else {
      onChange([...selected, enc]);
    }
  }

  function toggleAll() {
    if (selected.length === available.length) {
      onChange([]);
    } else {
      onChange([...available]);
    }
  }

  return (
    <div>
      <label style={{ ...labelStyle, marginBottom: '8px', color: 'var(--gold-dim)' }}>
        <input
          type="checkbox"
          style={checkboxStyle}
          checked={available.length > 0 && selected.length === available.length}
          onChange={toggleAll}
        />
        All bosses
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
        {available.map((enc) => (
          <label key={enc.id} style={labelStyle}>
            <input
              type="checkbox"
              style={checkboxStyle}
              checked={selectedIds.has(enc.id)}
              onChange={() => toggle(enc)}
            />
            {enc.name}
          </label>
        ))}
      </div>
    </div>
  );
}
