import type { Encounter } from '@/types';

interface EncounterSelectorProps {
  available: Encounter[];
  selected: Encounter[];
  onChange: (encounters: Encounter[]) => void;
}

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
      <label className="text-muted mb-2 flex cursor-pointer items-center gap-2 py-1 font-mono text-xs">
        <input
          type="checkbox"
          className="accent-brass h-3.5 w-3.5 cursor-pointer"
          checked={available.length > 0 && selected.length === available.length}
          onChange={toggleAll}
        />
        All bosses
      </label>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {available.map((enc) => (
          <label
            key={enc.id}
            className="text-text flex cursor-pointer items-center gap-2 py-1 font-mono text-xs"
          >
            <input
              type="checkbox"
              className="accent-brass h-3.5 w-3.5 cursor-pointer"
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
