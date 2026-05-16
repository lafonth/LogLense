'use client';

import { getAllWowClasses, getDpsSpecsForClass } from '@/lib/specs';
import { fieldStyle, inputStyle, labelStyle } from './formStyles';

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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: lockedClass ? '1fr' : '1fr 1fr',
        gap: '0 16px',
      }}
    >
      {!lockedClass && (
        <div style={fieldStyle}>
          <label htmlFor="ss-class" style={labelStyle}>
            Class
          </label>
          <select
            id="ss-class"
            style={inputStyle}
            value={activeClass}
            onChange={(e) => handleClassChange(e.target.value)}
          >
            {ALL_CLASSES.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
        </div>
      )}
      <div style={fieldStyle}>
        <label htmlFor="ss-spec" style={labelStyle}>
          Spec
        </label>
        <select
          id="ss-spec"
          style={inputStyle}
          value={specId ?? ''}
          onChange={(e) => handleSpecChange(Number(e.target.value))}
        >
          {specsForClass.map((s) => (
            <option key={s.specId} value={s.specId}>
              {s.specName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
