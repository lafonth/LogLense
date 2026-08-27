'use client';

import type { ReportActor } from '@/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ReportForm } from '@/components/forms/ReportForm';
import { HOME_PATH, reportResultPath } from '@/lib/routes';

/**
 * Le formulaire d'analyse par rapport. Comme celui par personnage, il ne fait que naviguer.
 *
 * Les combats, les acteurs et le titre que remonte `ReportForm` ne sont pas transmis : ils ne
 * tiendraient pas dans une URL, et n'ont pas à y tenir. La méta que le formulaire vient de
 * récupérer est déjà dans `report-meta-cache`, donc la route de résultat la retrouve sans
 * redemander à Warcraft Logs.
 */
export function ReportFormClient() {
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);

  function handleSubmit(code: string, actor: ReportActor, specId: number, difficulty: number) {
    setNavigating(true);
    router.push(reportResultPath({ code, actorId: actor.id }, { difficulty, spec: specId }));
  }

  return (
    <ReportForm
      onSubmit={handleSubmit}
      loading={navigating}
      onBack={() => router.push(HOME_PATH)}
    />
  );
}
