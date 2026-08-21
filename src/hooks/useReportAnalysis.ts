'use client';

import type { AnalysisResult, ReportActor, ReportFight } from '@/types';
import { useCallback, useRef, useState } from 'react';
import { readApiError } from '@/lib/api/response-error';
import { groupKillsByEncounter, lastKillOf } from '@/lib/report-kills';

interface ReportAnalysisParams {
  code: string;
  actor: ReportActor;
  specId: number;
  difficulty: number;
  fights: ReportFight[];
  /**
   * L'URL portait la marque de partage : le serveur peut servir l'instantané du rendu partagé
   * au lieu de rejouer le pipeline. Champ de ce type-ci, local au hook, et non d'un type du
   * domaine — une préférence de cache n'a rien à faire dans ce qui part au prompt.
   *
   * Ne concerne que `start`. `switchPull` est une demande neuve du lecteur : il a cliqué sur
   * une autre pull, il attend son calcul.
   */
  preferSnapshot?: boolean;
}

/** État d'une ré-analyse de rencontre : elle ne concerne qu'un boss, pas tout l'écran. */
export type PullStatus = { status: 'loading' } | { status: 'error'; message: string };

async function postAnalysis(body: unknown): Promise<AnalysisResult> {
  const res = await fetch('/api/report/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return (await res.json()) as AnalysisResult;
}

export function useReportAnalysis() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Pull retenue par rencontre. Absente = celle par défaut, le dernier kill. */
  const [pullSelection, setPullSelection] = useState<Record<number, number>>({});
  const [pullStatus, setPullStatus] = useState<Record<number, PullStatus>>({});

  // Ce que la dernière analyse a demandé : une ré-analyse de pull doit repartir du même
  // rapport, du même acteur et de la même difficulté sans que l'appelant les repasse.
  const paramsRef = useRef<ReportAnalysisParams | null>(null);
  // Le résultat courant, lisible avant un `await`. `setResult` seul ne le rendrait qu'au
  // rendu suivant, et le remplacement d'une rencontre a besoin des autres, intactes.
  const resultRef = useRef<AnalysisResult | null>(null);

  const commit = useCallback((next: AnalysisResult | null) => {
    resultRef.current = next;
    setResult(next);
  }, []);

  const start = useCallback(
    async (params: ReportAnalysisParams) => {
      const { code, actor, specId, difficulty, fights, preferSnapshot } = params;
      setLoading(true);
      setError(null);
      commit(null);
      setPullSelection({});
      setPullStatus({});
      paramsRef.current = params;

      const encounters = groupKillsByEncounter(fights, difficulty).map((group) => {
        const kill = lastKillOf(group);
        return { id: group.id, name: group.name, fightId: kill.fightId, fightMs: kill.fightMs };
      });

      if (encounters.length === 0) {
        setError('No kills found for the selected difficulty in this report.');
        setLoading(false);
        return;
      }

      try {
        commit(
          await postAnalysis({
            code,
            actorId: actor.id,
            actorName: actor.name,
            actorClass: actor.subType,
            specId,
            difficulty,
            encounters,
            preferSnapshot: preferSnapshot ?? false,
          })
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [commit]
  );

  /**
   * Ré-analyse une seule rencontre sur une autre pull.
   *
   * Le serveur acceptait déjà un `fightId` par rencontre : il ne manquait que le moyen de
   * le choisir. Le dernier kill de la soirée est souvent le farm de fin, pas la pull qui
   * mérite d'être lue.
   */
  const switchPull = useCallback(
    async (encounterId: number, fightId: number) => {
      const params = paramsRef.current;
      const current = resultRef.current;
      if (!params || !current) return;

      const groups = groupKillsByEncounter(params.fights, params.difficulty);
      const idx = groups.findIndex((g) => g.id === encounterId);
      const group = groups[idx];
      const kill = group?.kills.find((k) => k.fightId === fightId);
      if (!group || !kill) return;

      setPullSelection((prev) => ({ ...prev, [encounterId]: fightId }));
      setPullStatus((prev) => ({ ...prev, [encounterId]: { status: 'loading' } }));

      try {
        const data = await postAnalysis({
          code: params.code,
          actorId: params.actor.id,
          actorName: params.actor.name,
          actorClass: params.actor.subType,
          // La spec résolue par le serveur, pas celle demandée : la première analyse a pu
          // partir d'un 0 que le serveur a tranché sur la classe.
          specId: current.input.specId || params.specId,
          difficulty: params.difficulty,
          encounters: [
            { id: group.id, name: group.name, fightId: kill.fightId, fightMs: kill.fightMs },
          ],
        });

        // Une nouvelle analyse a pu démarrer pendant la requête : y recoller une rencontre
        // du rapport précédent afficherait un résultat qui n'appartient plus à l'écran.
        if (paramsRef.current !== params || resultRef.current === null) return;

        // Remise en place par index, pas par `encounterId` : `bosses[i]` peut être `null`
        // quand l'analyse de ce boss a échoué, et un `null` ne porte pas d'identité.
        const bosses = resultRef.current.bosses.map((b, i) =>
          i === idx ? (data.bosses[0] ?? null) : b
        );
        commit({ ...resultRef.current, bosses });
        setPullStatus((prev) => {
          const next = { ...prev };
          delete next[encounterId];
          return next;
        });
      } catch (e) {
        setPullStatus((prev) => ({
          ...prev,
          [encounterId]: {
            status: 'error',
            message: e instanceof Error ? e.message : 'Unknown error',
          },
        }));
      }
    },
    [commit]
  );

  const reset = useCallback(() => {
    paramsRef.current = null;
    commit(null);
    setError(null);
    setPullSelection({});
    setPullStatus({});
  }, [commit]);

  return { result, loading, error, pullSelection, pullStatus, start, switchPull, reset };
}
