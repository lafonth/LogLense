'use client';

import type { CohortFilter } from '@/lib/comparison/cohort';
import type { ValueDistribution } from '@/lib/comparison/stat-distribution';
import type { BossResult } from '@/types';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Select } from '@/components/ui/Select';
import { applyCohortFilter, describeCohort } from '@/lib/comparison/cohort';
import { matchPercent } from '@/lib/wcl/comparability';
import { ILVL_TOLERANCE, KILL_TIME_TOLERANCE, TOP_N } from '@/lib/wcl/constants';
import { fmtMs } from '@/lib/wcl/parsers';
import { LEVEL_LABEL, LEVEL_TONE } from './comparability-labels';
import { STAT_FORMATTERS } from './stat-format';

/**
 * Régler soi-même les seuils de comparabilité, sans dépenser une requête.
 *
 * Tout est calculé ici, dans le navigateur : `describeCohort` rejoue `selectClosest` et
 * `comparabilityLevel` sur `result.sample`, les candidats que l'analyse a déjà vérifiés et
 * rendus au client. Bouger un réglage ne déclenche donc ni requête WCL, ni écriture
 * d'instantané — l'instantané est le rendu partagé, pas un état d'interface.
 *
 * Deux limites tenues plutôt que masquées :
 *
 * - le panneau **ne peut que restreindre**. Le vivier est celui de l'analyse ; aucun réglage
 *   n'ira chercher un candidat de plus ;
 * - il ne gouverne que ce que `ReferenceSample` porte — effectif, niveau, distributions,
 *   distances. Dégâts et rotation n'existent que pour les `TOP_N` références détaillées, et
 *   les récupérer coûte trois requêtes par candidat. Quand un filtre écarte l'une d'elles,
 *   le panneau le dit : sinon les écrans de sorts continueraient de comparer, en silence, à
 *   quelqu'un que le lecteur vient d'exclure.
 *
 * `ComparabilityBanner` ne bouge pas pour autant. Il énonce la comparabilité de la sélection
 * réellement utilisée par le reste de l'écran ; le niveau recalculé ici répond à « qu'est-ce
 * que ça change ». Deux verdicts divergents sur un même écran seraient exactement ce que
 * l'étape 5 avait refusé.
 */

/** `null` ferme l'axe : la dernière position de chaque curseur ne filtre rien. */
const KILL_TIME_STEPS: (number | null)[] = [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, null];
const ILVL_STEPS: (number | null)[] = [1, 2, 3, 4, 6, 8, 12, null];
const EXTERNAL_STEPS: (number | null)[] = [0, 5, 10, 20, 40, null];

const CELL = 'border-border font-mono text-xs border-b px-3 py-2 text-right';
const HEADER_CELL = `${CELL} text-muted text-2xs tracking-wider uppercase`;

const fmtDps = (v: number) => Math.round(v).toLocaleString('en-US');

interface RangeControlProps {
  label: string;
  /** Ce que vaut la position courante, déjà mis en mots. */
  value: string;
  index: number;
  max: number;
  hint: string;
  disabled?: boolean;
  onChange: (index: number) => void;
}

function RangeControl({
  label,
  value,
  index,
  max,
  hint,
  disabled = false,
  onChange,
}: RangeControlProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-baseline justify-between gap-2">
        <span className="text-2xs text-muted font-sans tracking-widest uppercase">{label}</span>
        <span className="text-text font-mono text-xs">{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={index}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-brass-bright focus-visible:outline-brass-bright w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <p className="text-dim text-2xs font-sans">{hint}</p>
    </div>
  );
}

/** Le pointeur qui identifie un log des deux côtés : `sample` et `topPlayers` le portent. */
function logKey(ref: { code: string; fightID: number; actorId: number }): string {
  return `${ref.code}:${ref.fightID}:${ref.actorId}`;
}

interface CohortFilterPanelProps {
  result: BossResult;
}

export function CohortFilterPanel({ result }: CohortFilterPanelProps) {
  const [tier, setTier] = useState<'any' | number>('any');
  const [killIdx, setKillIdx] = useState(KILL_TIME_STEPS.length - 1);
  const [ilvlIdx, setIlvlIdx] = useState(ILVL_STEPS.length - 1);
  const [extIdx, setExtIdx] = useState(EXTERNAL_STEPS.length - 1);
  const [includeDisqualified, setIncludeDisqualified] = useState(false);
  const disqualifiedId = useId();

  const { sample, comparability, character, topPlayers } = result;
  const myKillTimeMs = comparability.myKillTimeMs;

  if (sample.length === 0) {
    return (
      <Card header="Tune the cohort">
        <p className="text-muted font-sans text-xs">
          Nothing to tune: the search verified no candidate on this pull, so there is no field to
          narrow. The basis above says how the search ended.
        </p>
      </Card>
    );
  }

  const killTol = KILL_TIME_STEPS[killIdx];
  const ilvlWithin = ILVL_STEPS[ilvlIdx];
  const maxExternalUptime = EXTERNAL_STEPS[extIdx];

  const filter: CohortFilter = {};
  if (tier !== 'any') filter.tierPieces = tier;
  // Un kill time de zéro rendrait deux bornes nulles, donc une cohorte vide sans que le
  // lecteur ait rien demandé : l'axe se ferme plutôt que de mentir.
  if (killTol !== null && myKillTimeMs > 0) {
    filter.minKillTimeMs = myKillTimeMs * (1 - killTol);
    filter.maxKillTimeMs = myKillTimeMs * (1 + killTol);
  }
  if (ilvlWithin !== null) filter.ilvlWithin = ilvlWithin;
  if (maxExternalUptime !== null) filter.maxExternalUptime = maxExternalUptime;
  if (includeDisqualified) filter.includeDisqualified = true;

  const neutral = Object.keys(filter).length === 0;
  const view = describeCohort(
    { stats: character.stats, dps: character.dps, killTimeMs: myKillTimeMs },
    sample,
    filter
  );

  // Les pièces de tier réellement observées. Proposer « 4 pièces » quand aucun candidat n'en
  // porte, c'est offrir un réglage qui ne peut que vider la cohorte.
  const tierOptions = [
    ...new Set(sample.flatMap((e) => (e.tierPieces === null ? [] : [e.tierPieces]))),
  ].sort((a, b) => a - b);

  // Les références détaillées que ce filtre écarte. Mesuré contre le vivier complet, jamais
  // contre `topPlayers` seul : une référence absente du `sample` n'a pas été exclue ici.
  const inSample = new Set(sample.map(logKey));
  const kept = new Set(applyCohortFilter(sample, filter, character.stats.avgIlvl).map(logKey));
  const droppedReferences = neutral
    ? []
    : topPlayers.filter(
        (p) => inSample.has(logKey(p.provenance)) && !kept.has(logKey(p.provenance))
      );

  const rows: { label: string; d: ValueDistribution | null; format: (v: number) => string }[] = [
    { label: 'DPS', d: view.dps, format: fmtDps },
    { label: 'Kill time', d: view.killTimeMs, format: fmtMs },
    ...view.stats.map((s) => ({ label: s.label, d: s, format: STAT_FORMATTERS[s.key] })),
  ];

  const medianMatch = view.medianDistance === null ? null : matchPercent(view.medianDistance);

  function reset() {
    setTier('any');
    setKillIdx(KILL_TIME_STEPS.length - 1);
    setIlvlIdx(ILVL_STEPS.length - 1);
    setExtIdx(EXTERNAL_STEPS.length - 1);
    setIncludeDisqualified(false);
  }

  return (
    <Card header="Tune the cohort">
      <div className="grid gap-4 md:grid-cols-2">
        <RangeControl
          label="Kill time"
          value={killTol === null ? 'Any' : `±${Math.round(killTol * 100)}%`}
          index={killIdx}
          max={KILL_TIME_STEPS.length - 1}
          disabled={myKillTimeMs <= 0}
          hint={
            myKillTimeMs <= 0
              ? 'Your pull has no measured duration, so this axis cannot be bounded.'
              : `Around your ${fmtMs(myKillTimeMs)}. Distance scoring treats ±${Math.round(KILL_TIME_TOLERANCE * 100)}% as one unit.`
          }
          onChange={setKillIdx}
        />
        <RangeControl
          label="Item level"
          value={ilvlWithin === null ? 'Any' : `±${ilvlWithin}`}
          index={ilvlIdx}
          max={ILVL_STEPS.length - 1}
          hint={`Around your ${character.stats.avgIlvl.toFixed(1)}. Distance scoring treats ±${ILVL_TOLERANCE} as one unit.`}
          onChange={setIlvlIdx}
        />
        <RangeControl
          label="Externals received"
          value={maxExternalUptime === null ? 'Any' : `≤ ${maxExternalUptime}%`}
          index={extIdx}
          max={EXTERNAL_STEPS.length - 1}
          hint="Share of the pull spent under an offensive buff handed over by someone else."
          onChange={setExtIdx}
        />
        {tierOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Select
              label="Tier pieces"
              value={tier === 'any' ? 'any' : String(tier)}
              onChange={(e) => setTier(e.target.value === 'any' ? 'any' : Number(e.target.value))}
            >
              <option value="any">Any</option>
              {tierOptions.map((n) => (
                <option key={n} value={n}>
                  {n} pieces
                </option>
              ))}
            </Select>
            <p className="text-dim text-2xs font-sans">
              Candidates whose gear could not be read are dropped by this filter rather than counted
              as zero.
            </p>
          </div>
        )}
      </div>

      <div className="border-border mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
        <label htmlFor={disqualifiedId} className="flex items-center gap-2">
          <input
            id={disqualifiedId}
            type="checkbox"
            checked={includeDisqualified}
            onChange={(e) => setIncludeDisqualified(e.target.checked)}
            className="accent-brass-bright focus-visible:outline-brass-bright cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <span className="text-muted font-sans text-xs">
            Include candidates the eliminatory criteria threw out
          </span>
        </label>
        <Button variant="secondary" size="xs" disabled={neutral} onClick={reset}>
          Reset to the selection
        </Button>
      </div>

      <p className="mt-4 font-sans text-xs">
        <span className="text-muted">Cohort: </span>
        <span className="font-mono">{view.size}</span>
        <span className="text-muted"> of </span>
        <span className="font-mono">{sample.length}</span>
        <span className="text-muted"> verified candidates</span>
        {view.excluded > 0 && (
          <span className="text-muted">
            {' '}
            — <span className="font-mono">{view.excluded}</span> filtered out
          </span>
        )}
        <span className="text-muted"> · </span>
        <span className={LEVEL_TONE[view.level]}>{LEVEL_LABEL[view.level]}</span>
        {medianMatch !== null && (
          <span className="text-muted">
            {' '}
            · median match <span className="text-text font-mono">{medianMatch}%</span>
          </span>
        )}
      </p>

      {/*
        Rouge, comme une substitution : ce n'est pas une position dans une distribution, c'est
        une comparaison que l'écran continue de faire contre la volonté qu'on vient
        d'exprimer. Les cartes de rotation, la table de dégâts et l'ouverture ne suivent pas
        le filtre — leurs données n'existent que pour les références détaillées.
      */}
      {droppedReferences.length > 0 && (
        <p className="text-danger text-2xs mt-3 font-sans">
          This cohort excludes{' '}
          <span className="font-mono">
            {droppedReferences.map((p) => p.provenance.name).join(', ')}
          </span>
          , which the rotation cards, the damage table and the opening below still compare you
          against — those need damage and cast data, fetched only for the detailed references.
        </p>
      )}

      {view.size === 0 ? (
        <p className="text-muted mt-3 font-sans text-xs">
          No verified candidate matches these settings. That is an answer too: nobody in the field
          played this pull under the conditions you asked for.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          <ScrollArea label="Where you sit in the filtered cohort">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${HEADER_CELL} text-left`}>Axis</th>
                  <th className={HEADER_CELL}>You</th>
                  <th className={HEADER_CELL}>Cohort min</th>
                  <th className={HEADER_CELL}>Cohort median</th>
                  <th className={HEADER_CELL}>Cohort max</th>
                  <th className={HEADER_CELL}>Your position</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ label, d, format }) =>
                  d === null ? null : (
                    <tr key={label}>
                      <td className={`${CELL} text-muted text-left`}>{label}</td>
                      <td className={`${CELL} text-text`}>{format(d.mine)}</td>
                      <td className={`${CELL} text-muted`}>{format(d.min)}</td>
                      <td className={`${CELL} text-text`}>{format(d.median)}</td>
                      <td className={`${CELL} text-muted`}>{format(d.max)}</td>
                      <td className={`${CELL} text-text`}>p{d.percentile}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </ScrollArea>

          <ScrollArea label="The cohort, closest first">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${HEADER_CELL} text-left`}>Log</th>
                  <th className={HEADER_CELL}>Match</th>
                  <th className={HEADER_CELL}>DPS</th>
                  <th className={HEADER_CELL}>Kill time</th>
                  <th className={HEADER_CELL}>Ilvl</th>
                  <th className={HEADER_CELL}>Tier</th>
                  <th className={HEADER_CELL}>Externals</th>
                </tr>
              </thead>
              <tbody>
                {view.members.map((m) => {
                  const match = matchPercent(m.distance);
                  return (
                    <tr key={`${m.name}:${m.killTimeMs}:${m.dps}`}>
                      <td className={`${CELL} text-text text-left`}>
                        {m.name}
                        {!m.qualified && (
                          <span className="text-danger text-2xs ml-2 font-sans">not qualified</span>
                        )}
                      </td>
                      <td className={`${CELL} text-text`}>
                        {match === null ? (
                          <span className="text-dim">not scored</span>
                        ) : (
                          `${match}%`
                        )}
                      </td>
                      <td className={`${CELL} text-muted`}>{fmtDps(m.dps)}</td>
                      <td className={`${CELL} text-muted`}>{fmtMs(m.killTimeMs)}</td>
                      <td className={`${CELL} text-muted`}>{m.avgIlvl.toFixed(1)}</td>
                      <td className={`${CELL} text-muted`}>{m.tierPieces ?? '—'}</td>
                      <td className={`${CELL} text-muted`}>{m.externalUptime}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </div>
      )}

      <p className="text-dim text-2xs mt-4 font-sans">
        These settings narrow the candidates the analysis already fetched — they never fetch more,
        and the verdict above the tabs keeps ruling on the selection the rest of this screen
        actually uses. The <span className="font-mono">{TOP_N}</span> detailed references were fixed
        when the analysis ran: promoting a fourth costs three requests, and the chat says so before
        spending them.
      </p>
    </Card>
  );
}
