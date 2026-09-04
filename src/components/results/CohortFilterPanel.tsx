'use client';

import type { CohortState } from '@/hooks/useCohortState';
import type { ValueDistribution } from '@/lib/comparison/stat-distribution';
import type { BossResult } from '@/types';
import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Select } from '@/components/ui/Select';
import { EXTERNAL_STEPS, ILVL_STEPS, KILL_TIME_STEPS } from '@/hooks/useCohortState';
import { logKey } from '@/lib/comparison/cohort';
import { matchPercent } from '@/lib/wcl/comparability';
import { ILVL_TOLERANCE, KILL_TIME_TOLERANCE, TOP_N } from '@/lib/wcl/constants';
import { fmtMs } from '@/lib/wcl/parsers';
import { LEVEL_LABEL, LEVEL_TONE } from './comparability-labels';

/**
 * Régler soi-même la cohorte, sans dépenser une requête.
 *
 * Tout est calculé dans le navigateur, par `useCohortState` : `describeCohort` rejoue
 * `selectClosest` et `comparabilityLevel` sur `result.sample`, les candidats que l'analyse a
 * déjà vérifiés et rendus au client. Bouger un curseur ou cocher une ligne ne déclenche donc
 * ni requête WCL, ni écriture d'instantané — l'instantané est le rendu partagé, pas un état
 * d'interface.
 *
 * Deux gestes, et ils ne font pas la même chose : les curseurs **réduisent la liste
 * proposée**, les cases **désignent la cohorte**. C'est la cohorte cochée, et elle seule, que
 * le niveau annoncé ici décrit et que les tables de stats et de build rendent plus bas — un
 * effectif dans le panneau et un autre dans la table du dessous seraient deux vérités sur le
 * même écran.
 *
 * Trois limites tenues plutôt que masquées :
 *
 * - le panneau **ne peut que restreindre**. Le vivier est celui de l'analyse ; aucun réglage
 *   n'ira chercher un candidat de plus ;
 * - il ne gouverne que ce que `ReferenceSample` porte — effectif, niveau, distributions,
 *   distances, talents. Dégâts et rotation n'existent que pour les `TOP_N` références
 *   détaillées, et les récupérer coûte trois requêtes par candidat : les écrans de sorts
 *   restent donc sur ces trois-là, quoi qu'on coche, et le pied du panneau l'écrit ;
 * - quand une case décoche l'une de ces trois références, le panneau la **nomme** : sinon les
 *   écrans de sorts continueraient de comparer, en silence, à quelqu'un que le lecteur vient
 *   d'exclure.
 *
 * `ComparabilityBanner` ne bouge pas pour autant. Il énonce la comparabilité de la sélection
 * réellement utilisée par les écrans de sorts ; le niveau recalculé ici répond à « qu'est-ce
 * que ça change ». Deux verdicts divergents sur une même comparaison seraient exactement ce
 * que l'étape 5 avait refusé.
 */

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

const CHECKBOX =
  'accent-brass-bright focus-visible:outline-brass-bright cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2';

interface CohortFilterPanelProps {
  result: BossResult;
  /** L'état monte dans `ComparisonTab` : les cases gouvernent aussi les tables du dessous. */
  cohort: CohortState;
}

export function CohortFilterPanel({ result, cohort }: CohortFilterPanelProps) {
  const disqualifiedId = useId();
  const allId = useId();

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

  const { view, selectedView, selected, checkedKeys, neutral, killTol, ilvlWithin } = cohort;
  const maxExternalUptime = cohort.maxExternalUptime;

  // Les pièces de tier réellement observées. Proposer « 4 pièces » quand aucun candidat n'en
  // porte, c'est offrir un réglage qui ne peut que vider la cohorte.
  const tierOptions = [
    ...new Set(sample.flatMap((e) => (e.tierPieces === null ? [] : [e.tierPieces]))),
  ].sort((a, b) => a - b);

  // Les références détaillées que cette cohorte n'inclut pas — décochées ou écartées par un
  // curseur, la cause importe peu : ce qui compte est qu'elles gouvernent encore les écrans de
  // sorts. Mesuré contre le vivier complet, jamais contre `topPlayers` seul : une référence
  // absente du `sample` n'a pas été exclue ici. Muet en position neutre, où une référence
  // substituée serait signalée comme exclue par un réglage alors que c'est la sélection qui l'a
  // jugée — et `ReferenceLabels` le dit déjà juste au-dessus.
  const inSample = new Set(sample.map(logKey));
  const droppedReferences = neutral
    ? []
    : topPlayers.filter(
        (p) => inSample.has(logKey(p.provenance)) && !checkedKeys.has(logKey(p.provenance))
      );

  // Les deux axes que la table de stats plus bas ne porte pas. Les axes d'équipement ne sont
  // pas repris ici : ils y sont rendus sur exactement cette cohorte-là, et les redire au-dessus
  // ferait deux tableaux à comparer au lieu d'un à lire.
  const rows: { label: string; d: ValueDistribution | null; format: (v: number) => string }[] = [
    { label: 'DPS', d: selectedView.dps, format: fmtDps },
    { label: 'Kill time', d: selectedView.killTimeMs, format: fmtMs },
  ];

  const medianMatch =
    selectedView.medianDistance === null ? null : matchPercent(selectedView.medianDistance);

  const allChecked = view.members.length > 0 && checkedKeys.size === view.members.length;

  return (
    <Card header="Tune the cohort">
      <div className="grid gap-4 md:grid-cols-2">
        <RangeControl
          label="Kill time"
          value={killTol === null ? 'Any' : `±${Math.round(killTol * 100)}%`}
          index={cohort.killIdx}
          max={KILL_TIME_STEPS.length - 1}
          disabled={myKillTimeMs <= 0}
          hint={
            myKillTimeMs <= 0
              ? 'Your pull has no measured duration, so this axis cannot be bounded.'
              : `Around your ${fmtMs(myKillTimeMs)}. Distance scoring treats ±${Math.round(KILL_TIME_TOLERANCE * 100)}% as one unit.`
          }
          onChange={cohort.setKillIdx}
        />
        <RangeControl
          label="Item level"
          value={ilvlWithin === null ? 'Any' : `±${ilvlWithin}`}
          index={cohort.ilvlIdx}
          max={ILVL_STEPS.length - 1}
          hint={`Around your ${character.stats.avgIlvl.toFixed(1)}. Distance scoring treats ±${ILVL_TOLERANCE} as one unit.`}
          onChange={cohort.setIlvlIdx}
        />
        <RangeControl
          label="Externals received"
          value={maxExternalUptime === null ? 'Any' : `≤ ${maxExternalUptime}%`}
          index={cohort.extIdx}
          max={EXTERNAL_STEPS.length - 1}
          hint="Share of the pull spent under an offensive buff handed over by someone else."
          onChange={cohort.setExtIdx}
        />
        {tierOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Select
              label="Tier pieces"
              value={cohort.tier === 'any' ? 'any' : String(cohort.tier)}
              onChange={(e) =>
                cohort.setTier(e.target.value === 'any' ? 'any' : Number(e.target.value))
              }
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
            checked={cohort.includeDisqualified}
            onChange={(e) => cohort.setIncludeDisqualified(e.target.checked)}
            className={CHECKBOX}
          />
          <span className="text-muted font-sans text-xs">
            Include candidates the eliminatory criteria threw out
          </span>
        </label>
        <Button variant="secondary" size="xs" disabled={neutral} onClick={cohort.reset}>
          Reset to the selection
        </Button>
      </div>

      <p className="mt-4 font-sans text-xs">
        <span className="text-muted">Comparing against </span>
        <span className="font-mono">{selected.length}</span>
        <span className="text-muted"> checked · </span>
        <span className="font-mono">{view.size}</span>
        <span className="text-muted"> shown by the filter · </span>
        <span className="font-mono">{sample.length}</span>
        <span className="text-muted"> verified candidates</span>
        <span className="text-muted"> · </span>
        <span className={LEVEL_TONE[selectedView.level]}>{LEVEL_LABEL[selectedView.level]}</span>
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
        les cases — leurs données n'existent que pour les références détaillées.
      */}
      {droppedReferences.length > 0 && (
        <p className="text-danger text-2xs mt-3 font-sans">
          This cohort leaves out{' '}
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
          {selected.length === 0 ? (
            <p className="text-muted font-sans text-xs">
              Nothing checked. Tick a match below to compare against it — until then the stats and
              build sections have no field to read.
            </p>
          ) : (
            <ScrollArea label="Your pull against the checked cohort">
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
          )}

          <ScrollArea label="The cohort, closest first">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${HEADER_CELL} text-left`}>
                    <label htmlFor={allId} className="flex items-center gap-2">
                      <input
                        id={allId}
                        type="checkbox"
                        checked={allChecked}
                        onChange={(e) => cohort.setAllChecked(e.target.checked)}
                        className={CHECKBOX}
                      />
                      <span>Compare</span>
                    </label>
                  </th>
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
                  const key = logKey(m);
                  return (
                    <tr key={key}>
                      <td className={`${CELL} text-left`}>
                        <input
                          type="checkbox"
                          checked={checkedKeys.has(key)}
                          onChange={() => cohort.toggle(key)}
                          aria-label={`Compare against ${m.name}`}
                          className={CHECKBOX}
                        />
                      </td>
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
        What you check governs the two sections that read a whole field — “Where you sit in the
        field” and the build differences at the bottom. Everything spell by spell — the rotation
        cards, the damage table and the opening — stays on the{' '}
        <span className="font-mono">{TOP_N}</span> detailed references fixed when the analysis ran:
        they are the only logs whose casts and damage were fetched, and promoting a fourth costs
        three requests, which the chat announces before spending them. Nothing here fetches
        anything, and the verdict above the tabs keeps ruling on the selection those spell screens
        actually use.
      </p>
    </Card>
  );
}
