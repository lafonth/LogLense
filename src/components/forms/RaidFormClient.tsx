'use client';

import type { ReportActor } from '@/types';
import { useRouter } from 'next/navigation';
import { RaidForm } from '@/components/forms/RaidForm';
import { HOME_PATH, reportResultPath } from '@/lib/routes';

/**
 * Le mode raid. Ouvrir un joueur depuis le classement emprunte exactement l'URL d'analyse
 * par rapport : c'est une autre façon de choisir qui analyser, pas un autre écran de
 * résultat.
 */
export function RaidFormClient() {
  const router = useRouter();

  function handleOpenPlayer(code: string, actor: ReportActor, specId: number, difficulty: number) {
    router.push(reportResultPath({ code, actorId: actor.id }, { difficulty, spec: specId }));
  }

  return <RaidForm onOpenPlayer={handleOpenPlayer} onBack={() => router.push(HOME_PATH)} />;
}
