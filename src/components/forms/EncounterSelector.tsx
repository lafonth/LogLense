import type { Encounter } from '@/types';

const TWW_S2_BOSSES: Encounter[] = [
  { id: 2902, name: 'Ulgrax the Devourer' },
  { id: 2917, name: 'The Bloodbound Horror' },
  { id: 2898, name: 'Sikran, Captain of the Sureki' },
  { id: 2918, name: "Rasha'nan" },
  { id: 2919, name: "Eggtender Ovi'nax" },
  { id: 2920, name: "Nexus-Princess Ky'veza" },
  { id: 2921, name: 'The Silken Court' },
  { id: 2922, name: 'Queen Ansurek' },
];

interface EncounterSelectorProps {
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

export function EncounterSelector({ selected, onChange }: EncounterSelectorProps) {
  const selectedIds = new Set(selected.map((e) => e.id));

  function toggle(enc: Encounter) {
    if (selectedIds.has(enc.id)) {
      onChange(selected.filter((e) => e.id !== enc.id));
    } else {
      onChange([...selected, enc]);
    }
  }

  function toggleAll() {
    if (selected.length === TWW_S2_BOSSES.length) {
      onChange([]);
    } else {
      onChange([...TWW_S2_BOSSES]);
    }
  }

  return (
    <div>
      <label style={{ ...labelStyle, marginBottom: '8px', color: 'var(--gold-dim)' }}>
        <input
          type="checkbox"
          style={checkboxStyle}
          checked={selected.length === TWW_S2_BOSSES.length}
          onChange={toggleAll}
        />
        All bosses
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
        {TWW_S2_BOSSES.map((enc) => (
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
