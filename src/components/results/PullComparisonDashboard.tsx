import type { PullComparisonResult } from '@/lib/wcl/pull-pipeline';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { fightUrl } from '@/lib/wcl/fight-url';
import { mergeIcons } from '@/lib/wcl/icons';
import { DamageBreakdown } from './DamageBreakdown';
import { PullContextCard } from './PullContextCard';
import { PullVerdictBanner } from './PullVerdictBanner';
import { RotationComparisonCards } from './RotationCards';
import { TalentDiffCard } from './TalentDiff';

/**
 * L'identifiant d'une pull, cliquable quand il l'est.
 *
 * `ExternalLink` s'efface sur une adresse refusée, et c'est ce qu'on veut pour un lien
 * dont le libellé n'existe que pour lui. Ici l'inverse : l'identifiant nomme la pull, il
 * était à l'écran avant d'être un lien et doit y rester sans.
 */
function PullRef({ pull }: { pull: { code: string; fightId: number; actorId: number } }) {
  const label = `${pull.code}#${pull.fightId}`;
  const href = fightUrl(pull.code, pull.fightId, pull.actorId);

  return href ? (
    <ExternalLink href={href}>{label}</ExternalLink>
  ) : (
    <span className="font-mono">{label}</span>
  );
}

interface PullComparisonDashboardProps {
  result: PullComparisonResult;
  onBack: () => void;
}

/**
 * L'écran de spec 04 : verdict décomposé en tête, puis contexte, dégâts, rotation et
 * talents. Chaque section reçoit une comparaison déjà calculée par `comparePulls` — aucune
 * n'appelle `compareCasts`/`diffTalents`/etc. elle-même (spec 04 §3, §6).
 */
export function PullComparisonDashboard({ result, onBack }: PullComparisonDashboardProps) {
  const { before, after, comparison } = result;

  // `comparePulls` unionne les deux pulls : un sort lancé seulement avant a quand même sa
  // ligne. L'index de la pull d'après seul le laisserait sans art, et le repli ne frapperait
  // qu'un côté du tableau. À nom égal, l'après gagne : c'est la pull qu'on lit.
  const icons = mergeIcons(before.rotation.icons, after.rotation.icons);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-10">
      <div className="mx-auto w-full max-w-[1100px]">
        <BackLink onClick={onBack} />

        {/* Cet écran n'a pas d'autre titre : commencer à `h2` ouvrait la hiérarchie sur un
            niveau manquant. `font-sans` l'emporte sur la règle d'élément, le rendu ne bouge pas. */}
        {/* Les deux identifiants étaient déjà à l'écran, inertes : chacun désigne une pull
            qu'on peut vouloir rouvrir sur WCL. Les rendre cliquables ne coûte rien de plus. */}
        <h1 className="text-text m-0 mb-6 flex flex-wrap items-center gap-2 font-sans text-sm">
          <span className="font-mono">{before.name}</span>
          <span>—</span>
          <PullRef pull={before} />
          <span>vs</span>
          <PullRef pull={after} />
        </h1>

        <div className="flex flex-col gap-4">
          <PullVerdictBanner comparison={comparison} before={before} after={after} />

          <PullContextCard
            before={{ label: 'Before', context: before.context, fightMs: before.fightMs }}
            after={{ label: 'After', context: after.context, fightMs: after.fightMs }}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card header="Damage · before">
              <DamageBreakdown entries={before.damageEntries} icons={before.rotation.icons} />
            </Card>
            <Card header="Damage · after">
              <DamageBreakdown entries={after.damageEntries} icons={after.rotation.icons} />
            </Card>
          </div>

          <RotationComparisonCards
            casts={comparison.rotation}
            uptimes={comparison.uptimes}
            icons={icons}
          />

          <TalentDiffCard {...comparison.talents} icons={icons} />
        </div>
      </div>
    </div>
  );
}
