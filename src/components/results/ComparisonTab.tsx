import type { BossState } from '@/hooks/useAnalysis';
import type { Encounter, TalentNode } from '@/types';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { isBossRefusal, isBossResult } from '@/lib/boss-outcome';
import { abilityTable } from '@/lib/comparison/ability-table';
import { usableSample } from '@/lib/comparison/stat-distribution';
import { mergeIcons } from '@/lib/wcl/icons';
import { AbilityTable } from './AbilityTable';
import { CohortFilterPanel } from './CohortFilterPanel';
import { FindingsList } from './FindingsList';
import { OpeningChain } from './OpeningChain';
import { ReferenceLabels } from './ReferenceLabels';
import { RotationCards } from './RotationCards';
import { StatsTable } from './StatsTable';
import { TalentDiff } from './TalentDiff';

interface ComparisonTabProps {
  encounter: Encounter;
  bossState: BossState;
  specName: string;
  talentNodes: TalentNode[];
  /** Une seconde chance sur ce boss seul. Absent quand le chemin n'en offre pas. */
  onRetry?: () => void;
}

export function ComparisonTab({
  encounter,
  bossState,
  specName,
  talentNodes,
  onRetry,
}: ComparisonTabProps) {
  if (bossState.status === 'idle' || bossState.status === 'loading') {
    return (
      <div role="status" className="py-8">
        <LoadingSpinner label={`Fetching ${encounter.name}…`} />
      </div>
    );
  }

  if (bossState.status === 'error') {
    return <ErrorBanner message={bossState.message} onRetry={onRetry} />;
  }

  const outcome = bossState.result;

  // Même raison que dans l'onglet Overview : proposer de changer de difficulté à qui joue
  // une spec que nous ne classons pas, c'est renvoyer le lecteur chercher une donnée qui
  // n'existera nulle part.
  if (isBossRefusal(outcome)) {
    return (
      <div className="py-6 font-mono text-xs">
        <div className="text-dim">
          {encounter.name} was not compared — the log shows{' '}
          {outcome.specLabel ?? `spec ${outcome.specId}`}, which LogLense does not rank.
        </div>
      </div>
    );
  }

  const result = isBossResult(outcome) ? outcome : null;

  if (!result) {
    return (
      <div className="py-6 font-mono text-xs">
        <div className="text-dim">
          No {specName} parses found for {encounter.name}.
        </div>
        <div className="text-dim mt-2 text-xs">
          Try switching to Heroic or Normal — Mythic requires a kill logged while playing {specName}{' '}
          spec.
        </div>
      </div>
    );
  }

  // Les trois blocs ci-dessous affichent l'union des noms : l'ouverture montre le consensus
  // des références, le diff de talents montre ce qu'elles prennent et pas moi. L'index des
  // références les couvre ; le mien passe en dernier et gagne à nom égal.
  const icons = mergeIcons(
    ...result.topPlayers.map((player) => player.rotation.icons),
    result.character.rotation.icons
  );

  return (
    <div>
      {/* La conclusion, en tête. Mesuré : derrière les deux bandeaux elle démarrait à 870 px,
          soit sous la ligne de flottaison d'un écran de 900 — pas une ligne de constat visible
          sans dérouler. Elle passe devant, et les pièces la justifient au lieu de l'annoncer.
          Rien ne se perd : le verdict au-dessus des onglets dit déjà si la comparaison tient,
          et `buildFindings` refuse de chiffrer quand elle ne tient pas.

          `ComparabilityBanner` a quitté cet onglet pour le bloc au-dessus des onglets : l'aveu
          que la comparaison ne tient pas ne peut pas dépendre du clic qui l'aurait ouvert. Il
          repasse donc au-dessus de la conclusion, mais hors de la page où celle-ci était
          poussée en bas — c'est le seul bandeau qui gagne à précéder tout le reste. */}
      <div className="mt-6">
        <FindingsList result={result} talentNodes={talentNodes} />
      </div>
      {/* Tout ce qui suit est la pièce justificative, et le `mt-8` marque seul cette
          frontière — les preuves entre elles gardent `mt-6`. */}
      <div className="mt-8">
        <ReferenceLabels result={result} />
      </div>
      {/* Le panneau suit la carte des références parce qu'il parle de la même chose : qui
          nous sert de comparaison. Il vient après elle et avant les preuves, là où la
          question « et si je resserrais ? » se pose — et il ne gouverne rien de ce qui suit,
          ce qu'il dit lui-même quand un réglage écarte une référence détaillée. */}
      <div className="mt-6">
        <CohortFilterPanel result={result} />
      </div>
      <div className="mt-6">
        <RotationCards
          character={result.character.rotation}
          topPlayers={result.topPlayers}
          characterDamage={result.character.damageTable.entries}
          foldMatching
        />
      </div>
      {/* Les cartes au-dessus comptent les casts ; celle-ci compte les dégâts. C'est la vue
          `compare` de Warcraft Logs, colonne pour colonne — et la colonne de droite est la
          médiane du champ, jamais une référence nommée : une seule serait plus lisible et
          perdrait la dispersion, qui est ce qui dit si mon écart sort de l'ordinaire. */}
      <div className="mt-6">
        <h3 className="text-muted mb-2 font-mono text-xs tracking-wider uppercase">Damage table</h3>
        <AbilityTable table={abilityTable(result.character, result.topPlayers)} icons={icons} />
      </div>
      <div className="mt-6">
        <h3 className="text-muted mb-2 font-mono text-xs tracking-wider uppercase">
          Where you sit in the field
        </h3>
        <StatsTable character={result.character.stats} sample={result.sample} />
      </div>
      <div className="mt-6">
        <OpeningChain
          mine={result.character.rotation.opening}
          references={result.topPlayers}
          icons={icons}
        />
      </div>
      <div className="mt-6">
        <TalentDiff
          nodes={talentNodes}
          myTalents={result.character.stats.talents}
          references={usableSample(result.sample).entries}
          icons={icons}
        />
      </div>
    </div>
  );
}
