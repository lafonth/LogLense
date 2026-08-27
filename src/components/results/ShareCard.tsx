import type { ShareCard as ShareCardData } from '@/lib/comparison/share-card';

/** U+2212 minus, comme dans `VerdictBanner` : il s'aligne sur les chiffres en chasse fixe. */
function signed(value: number): string {
  const abs = Math.abs(value).toLocaleString('en-US');
  return value < 0 ? `−${abs}` : `+${abs}`;
}

function Figure({ children }: { children: number | string }) {
  return <span className="font-mono">{children}</span>;
}

function Column({
  title,
  note,
  gapDps,
  ilvl,
  count,
  tone,
}: {
  title: string;
  note: string;
  gapDps: number;
  ilvl: number;
  count: number;
  tone: string;
}) {
  return (
    <div>
      <p className="text-dim tracking-caps font-display text-2xs uppercase">{title}</p>
      <p className={`${tone} mt-2 font-mono text-3xl font-semibold`}>{signed(gapDps)}</p>
      <p className="text-muted font-sans text-xs">dps</p>
      <p className="text-dim mt-3 font-sans text-xs">
        {note} at <Figure>{ilvl}</Figure> ilvl, <Figure>{count}</Figure>{' '}
        {count === 1 ? 'log' : 'logs'}
      </p>
    </div>
  );
}

/**
 * La carte que les gens repartagent — l'objet, pas l'application.
 *
 * Elle montre une seule chose, et c'est notre position produit entière : le même joueur
 * mesuré deux fois. À gauche le vivier tel qu'il est, c'est-à-dire ce que rend n'importe
 * quel classement ; à droite les seuls logs dont l'équipement et le kill time tiennent la
 * comparaison. L'ilvl est écrit sous chaque colonne parce que c'est lui qui explique le
 * déplacement — sans ce chiffre la carte affirmerait un résultat sans le démontrer.
 *
 * Aucun rouge : ni l'un ni l'autre écart n'est une erreur. La colonne de gauche est en
 * `text-muted` — la mesure qu'on récuse, lisible mais pas mise en avant ; celle de droite
 * en `text-deviation`, comme partout où le produit chiffre une position dans une
 * distribution.
 *
 * La phrase du bas se déduit des deux nombres et ne prétend rien qu'ils ne montrent : elle
 * n'annonce un rétrécissement que lorsque l'écart comparable est effectivement le plus
 * petit des deux. Un vivier moins bien équipé que le joueur existe, et là le filtrage
 * y creuse l'écart — c'est un résultat, pas un raté, et la carte doit pouvoir le dire.
 *
 * Aucun prix, aucune mention d'offre : la carte circule hors de son contexte, elle porte
 * la démonstration, jamais un appel à payer.
 */
export function ShareCard({ card }: { card: ShareCardData }) {
  const subtitle = [card.player, card.spec, card.difficulty, card.encounter].filter(Boolean);
  const shrinks = Math.abs(card.referenceGapDps) < Math.abs(card.poolGapDps);
  const removed = Math.abs(card.poolGapDps) - Math.abs(card.referenceGapDps);

  return (
    <div className="border-border-strong bg-surface-raised rounded-md border p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-text tracking-display text-lg">LogLense</p>
        <p className="text-dim font-sans text-xs">
          <Figure>{card.myDps.toLocaleString('en-US')}</Figure> dps at{' '}
          <Figure>{card.myIlvl}</Figure> ilvl
        </p>
      </div>
      <p className="text-muted mt-1 font-sans text-xs">{subtitle.join(' · ')}</p>

      <div className="border-border mt-5 grid grid-cols-2 gap-4 border-t pt-5">
        <Column
          title="Against the field"
          note="Everyone ranked"
          gapDps={card.poolGapDps}
          ilvl={card.poolIlvl}
          count={card.poolCount}
          tone="text-muted"
        />
        <Column
          title="Against comparable logs"
          note="Gear and kill time matched"
          gapDps={card.referenceGapDps}
          ilvl={card.referenceIlvl}
          count={card.referenceCount}
          tone="text-deviation"
        />
      </div>

      <p className="text-text border-border mt-5 border-t pt-4 font-sans text-sm">
        {shrinks ? (
          <>
            <Figure>{removed.toLocaleString('en-US')}</Figure> dps of the gap you are shown comes
            from the reference gear, not from your play. LogLense tells the two apart.
          </>
        ) : (
          <>
            Matching gear and kill time does not shrink this gap — it holds at{' '}
            <Figure>{Math.abs(card.referenceGapDps).toLocaleString('en-US')}</Figure> dps against
            logs comparable to yours. That much is yours to play for.
          </>
        )}
      </p>
    </div>
  );
}
