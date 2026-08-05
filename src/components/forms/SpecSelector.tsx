'use client';

import { Select } from '@/components/ui/Select';
import { getAllWowClasses, getDpsSpecsForClass } from '@/lib/specs';

interface SpecSelectorProps {
  specId: number | null;
  lockedClass?: string;
  onChange: (specId: number) => void;
}

const CLASS_ORDER = [
  'Death Knight',
  'Demon Hunter',
  'Druid',
  'Evoker',
  'Hunter',
  'Mage',
  'Monk',
  'Paladin',
  'Priest',
  'Rogue',
  'Shaman',
  'Warlock',
  'Warrior',
];

const ALL_CLASSES = getAllWowClasses().sort(
  (a, b) => CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b)
);

export function SpecSelector({ specId, lockedClass, onChange }: SpecSelectorProps) {
  const selectedSpec = specId
    ? getDpsSpecsForClass(lockedClass ?? ALL_CLASSES[0]).find((s) => s.specId === specId)
    : null;

  const activeClass = lockedClass ?? selectedSpec?.wowClass ?? ALL_CLASSES[0];
  const specsForClass = getDpsSpecsForClass(activeClass);

  function handleClassChange(wowClass: string) {
    const specs = getDpsSpecsForClass(wowClass);
    if (specs.length > 0) onChange(specs[0].specId);
  }

  function handleSpecChange(id: number) {
    onChange(id);
  }

  return (
    <div className={`grid gap-x-4 ${lockedClass ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {!lockedClass && (
        <Select
          label="Class"
          value={activeClass}
          onChange={(e) => handleClassChange(e.target.value)}
        >
          {ALL_CLASSES.map((cls) => (
            <option key={cls} value={cls}>
              {cls}
            </option>
          ))}
        </Select>
      )}
      <Select
        label="Spec"
        value={specId ?? ''}
        onChange={(e) => handleSpecChange(Number(e.target.value))}
      >
        {specsForClass.map((s) => (
          <option key={s.specId} value={s.specId}>
            {s.specName}
          </option>
        ))}
      </Select>
    </div>
  );
}
