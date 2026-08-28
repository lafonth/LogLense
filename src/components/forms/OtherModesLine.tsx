import Link from 'next/link';
import { PULL_FORM_PATH, RAID_FORM_PATH, REPORT_FORM_PATH } from '@/lib/routes';

const MODES = [
  { href: REPORT_FORM_PATH, label: 'Analyse a report' },
  { href: RAID_FORM_PATH, label: 'Rank a raid' },
  { href: PULL_FORM_PATH, label: 'Compare two pulls' },
] as const;

/**
 * Les trois autres modes, atteignables sans être proposés.
 *
 * La grille de quatre cartes demandait au nouveau venu de choisir avant de savoir ce que
 * l'outil fait — et trois de ces cartes supposent un code de rapport qu'il n'a pas. Une
 * ligne sous le formulaire garde les modes accessibles pour qui les connaît, sans faire de
 * leur existence la première question posée.
 */
export function OtherModesLine() {
  return (
    <div className="text-dim mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-xs">
      {MODES.map((mode) => (
        <Link
          key={mode.href}
          href={mode.href}
          className="hover:text-brass focus-visible:outline-brass-bright underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {mode.label}
        </Link>
      ))}
    </div>
  );
}
