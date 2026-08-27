'use client';

import { useRouter } from 'next/navigation';
import { ModeSelector } from '@/components/ui/ModeSelector';
import {
  CHARACTER_FORM_PATH,
  PULL_FORM_PATH,
  RAID_FORM_PATH,
  REPORT_FORM_PATH,
} from '@/lib/routes';

const PATHS = {
  character: CHARACTER_FORM_PATH,
  report: REPORT_FORM_PATH,
  raid: RAID_FORM_PATH,
  pull: PULL_FORM_PATH,
} as const;

/**
 * Le choix du mode, comme une navigation plutôt qu'un `useState` local — un mode a une URL,
 * donc un bouton « précédent » qui fait ce qu'on attend et un formulaire qu'on peut mettre
 * en favori.
 */
export function HomeScreen() {
  const router = useRouter();
  return <ModeSelector onSelect={(mode) => router.push(PATHS[mode])} />;
}
