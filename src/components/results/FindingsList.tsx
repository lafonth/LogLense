import type { Finding } from '@/lib/comparison/findings';
import type { BossResult, TalentNode } from '@/types';
import { Card } from '@/components/ui/Card';
import { buildFindings } from '@/lib/comparison/findings';

interface FindingsListProps {
  result: BossResult;
  /** L'arbre de la spec, pour que l'écart de build se lise en noms et non en identifiants. */
  talentNodes: TalentNode[];
}

type DamageFinding = Extract<Finding, { kind: 'damage' }>;

/** U+2212 minus, not a hyphen — it aligns with digits in a monospace face. */
function signedDps(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '+';
  return `${sign}${Math.abs(rounded).toLocaleString('en-US')}`;
}

/**
 * La ligne de cause, ou son absence assumée.
 *
 * Quand `cause` est `null`, la ligne ne se tait pas : elle dit qu'aucune différence de
 * rotation n'était assez nette pour être nommée. C'est la distinction que tient tout
 * l'écran — l'écart de dégâts est mesuré, la cause est une hypothèse, et une ligne sans
 * cause reste un constat, pas un trou.
 */
function CauseLine({ cause }: { cause: DamageFinding['cause'] }) {
  if (cause === null) {
    return (
      <p className="text-2xs text-dim mt-0.5 font-sans">
        — no rotation difference large enough to name
      </p>
    );
  }

  const unit = cause.kind === 'cast' ? '/min' : '%';
  const verb = cause.kind === 'cast' ? 'you cast it' : 'you hold it';
  const digits = cause.kind === 'cast' ? 1 : 0;

  return (
    <p className="text-2xs text-dim mt-0.5 font-sans">
      {verb} <span className="text-text font-mono">{cause.mine.toFixed(digits)}</span>
      {unit} against{' '}
      <span className="font-mono">
        {cause.referenceMin.toFixed(digits)} – {cause.referenceMax.toFixed(digits)}
      </span>
      {unit}
    </p>
  );
}

/** Un constat chiffré : la barre porte l'ordre, le chiffre porte la grandeur. */
function GapRow({ finding, scale }: { finding: DamageFinding; scale: number }) {
  const share = scale > 0 ? Math.abs(finding.gapDps) / scale : 0;

  return (
    <li className="flex gap-3">
      <span
        className="bg-border mt-1.5 h-1 w-16 shrink-0 overflow-hidden rounded-xs"
        aria-hidden="true"
      >
        {/* Géométrie calculée à l'exécution — l'exception `style` admise par CLAUDE.md,
            comme dans DamageBreakdown et TalentDiff. */}
        <span className="bg-deviation block h-full" style={{ width: `${share * 100}%` }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-text font-sans text-xs">{finding.ability}</span>
          {/* L'écart va en `text-deviation` et jamais en `text-danger` : une position dans une
              distribution n'est pas une faute, et le rouge doit rester lisible comme alerte. */}
          <span className="text-deviation shrink-0 font-mono text-xs">
            {signedDps(finding.gapDps)} dps
          </span>
        </div>
        <p className="text-2xs text-dim mt-1 font-sans">
          you <span className="font-mono">{finding.minePct.toFixed(1)} %</span> of damage · field{' '}
          <span className="font-mono">{finding.fieldPct.toFixed(1)} %</span>
        </p>
        <CauseLine cause={finding.cause} />
      </div>
    </li>
  );
}

/** L'identité d'une divergence, et non son rang : la liste est reclassée à chaque rendu, et
 *  un index ferait remonter l'état d'une ligne sur une autre. Il y a au plus une ouverture,
 *  et un nœud de build ne figure que d'un seul côté du diff. */
function diagnosticKey(finding: Finding): string {
  return finding.kind === 'talent' ? `talent-${finding.direction}-${finding.label}` : finding.kind;
}

/** Une divergence qu'aucune arithmétique ne convertit en dps : elle se lit sans chiffre. */
function DiagnosticLine({ finding }: { finding: Finding }) {
  if (finding.kind === 'opening') {
    return (
      <li className="text-2xs text-muted font-sans">
        Opening leaves the majority at cast{' '}
        <span className="font-mono">{finding.divergesAtRank}</span> — you{' '}
        <span className="text-text">{finding.mine ?? 'stop there'}</span>,{' '}
        <span className="font-mono">
          {finding.consensusCount} / {finding.referenceTotal}
        </span>{' '}
        <span className="text-text">{finding.consensus}</span>
      </li>
    );
  }

  if (finding.kind === 'talent') {
    return (
      <li className="text-2xs text-muted font-sans">
        <span className="text-text">{finding.label}</span>
        {finding.direction === 'missed' ? ' not taken' : ' taken'} —{' '}
        <span className="font-mono">
          {finding.referenceCount} of {finding.referenceTotal}
        </span>{' '}
        references take it
      </li>
    );
  }

  return null;
}

/**
 * La conclusion de l'onglet : où l'écart de dégâts se situe, classé, en dps.
 *
 * Aucune ligne n'est calculée ici — `buildFindings` décide seul de ce qui a le droit d'être
 * dit, et le composant se borne à le rendre. C'est ce qui permet aux quatre garde-fous
 * (verdict qui chiffre, effectif, plancher de bruit, droit de nommer une cause) d'être
 * testés sans rendu.
 *
 * **Aucun total n'est affiché**, et c'est délibéré : les lignes ne somment pas au delta du
 * verdict, parce qu'une médiane par sort n'est pas additive. Le pied de bloc dit ce que la
 * colonne mesure — un écart de dégâts produits — et refuse le contrefactuel « ce que tu
 * gagnerais », que la donnée ne porte pas.
 */
export function FindingsList({ result, talentNodes }: FindingsListProps) {
  const { opportunities, diagnostics, matching } = buildFindings(result, talentNodes);

  if (opportunities.length === 0 && diagnostics.length === 0) return null;

  const damage = opportunities.filter((f): f is DamageFinding => f.kind === 'damage');
  const scale = Math.max(...damage.map((f) => Math.abs(f.gapDps)), 0);

  return (
    <Card header="Where the damage difference sits">
      {damage.length > 0 ? (
        <>
          <ul className="flex flex-col gap-3">
            {damage.map((finding) => (
              <GapRow key={finding.ability} finding={finding} scale={scale} />
            ))}
          </ul>
          <p className="border-border text-2xs text-dim mt-4 border-t pt-3 font-sans">
            Difference in damage produced on each ability, not what changing it would gain you.
          </p>
        </>
      ) : (
        <p className="text-muted font-sans text-xs">
          The panel does not carry a damage difference worth breaking down — what follows is what
          diverges anyway.
        </p>
      )}

      {diagnostics.length > 0 && (
        <div className={damage.length > 0 ? 'mt-4' : 'mt-3'}>
          <h3 className="text-2xs tracking-caps text-muted mb-2 font-sans uppercase">
            Also diverging
          </h3>
          <ul className="flex flex-col gap-1">
            {diagnostics.map((finding) => (
              <DiagnosticLine key={diagnosticKey(finding)} finding={finding} />
            ))}
          </ul>
        </div>
      )}

      {matching > 0 && (
        <p className="text-2xs text-dim mt-3 font-sans">
          ▸ <span className="font-mono">{matching}</span> abilit
          {matching === 1 ? 'y matches' : 'ies match'} the references
        </p>
      )}
    </Card>
  );
}
