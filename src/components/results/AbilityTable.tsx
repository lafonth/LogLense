import type {
  AbilityMetrics,
  AbilityRow,
  AbilityTable as Table,
} from '@/lib/comparison/ability-table';
import type { IconIndex } from '@/lib/wcl/icons';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { SpellIcon } from '@/components/ui/SpellIcon';

interface AbilityTableProps {
  table: Table;
  /** L'index du combat. Absent, chaque ligne rend sa pastille neutre. */
  icons?: IconIndex;
}

const CELL = 'border-border font-mono text-xs border-b px-3 py-2 text-right whitespace-nowrap';
const HEADER_CELL = `${CELL} text-muted text-2xs tracking-wider uppercase`;

/** Les montants d'un combat se comptent en millions : les rendre en entier noierait la table. */
function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  return Math.round(value).toLocaleString('en-US');
}

const count = (value: number) => Math.round(value).toLocaleString('en-US');

/**
 * Une cellule à deux étages : ma valeur, la médiane du champ en dessous.
 *
 * Un tiret n'est pas un zéro — il dit que la colonne n'a pas de dénominateur sur cette ligne
 * (un proc que WCL ne rattache à aucun cast), ou que rien ne l'a mesurée.
 */
function Cell({
  mine,
  field,
  format,
  showField,
}: {
  mine: number | null;
  field: number | null;
  format: (v: number) => string;
  showField: boolean;
}) {
  return (
    <td className={CELL}>
      <div className="text-text">{mine === null ? '—' : format(mine)}</div>
      {showField && (
        <div className="text-muted text-2xs">{field === null ? '—' : format(field)}</div>
      )}
    </td>
  );
}

/** L'écart de dps sur ce sort. Bleu : une position dans une distribution n'est pas une faute. */
function DeviationBadge({ pct }: { pct: number }) {
  const pos = pct >= 0;
  return (
    <span className={`text-2xs ml-2 font-mono opacity-80 ${pos ? 'text-muted' : 'text-deviation'}`}>
      {pos ? '+' : '−'}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/**
 * Ma part de dégâts en laiton, la fourchette des références en gris derrière.
 *
 * Le gris qui dépasse du laiton est la seule information portée : jusqu'où le champ monte sur
 * ce sort quand je m'arrête là. Les deux géométries sont calculées à l'exécution — c'est
 * l'exception à la règle des styles en ligne, au même titre que la bande de `RotationCards`.
 */
function ShareBar({ row }: { row: AbilityRow }) {
  const min = row.fieldPctMin;
  const max = row.fieldPctMax;
  return (
    <div className="bg-border relative mt-1 h-1 rounded-xs" aria-hidden="true">
      {min !== null && max !== null && (
        <div
          className="bg-border-strong absolute inset-y-0 rounded-xs"
          style={{ left: `${min}%`, width: `${Math.max(max - min, 0.5)}%` }}
        />
      )}
      <div
        className="bg-brass absolute inset-y-0 left-0 rounded-xs"
        style={{ width: `${row.minePct}%` }}
      />
    </div>
  );
}

/**
 * La table de dégâts côte à côte, dans les colonnes de Warcraft Logs.
 *
 * La valeur du dessous de chaque cellule est la **médiane des références**, pas une référence
 * nommée : une seule serait plus lisible et perdrait la dispersion, qui est ce qui dit si mon
 * écart sort de l'ordinaire. Conséquence assumée : les colonnes ne se recomposent pas entre
 * elles, et les lignes ne somment pas au total — une médiane n'est pas additive.
 *
 * Les colonnes de comptes disparaissent quand la donnée n'existe pas — un instantané écrit
 * avant que le parse ne garde `uses` et `hitCount`. Une colonne sans données s'abandonne, elle
 * ne s'invente pas.
 */
export function AbilityTable({ table, icons }: AbilityTableProps) {
  const showField = table.referenceTotal > 0;
  const { hasCasts, hasHits } = table;

  return (
    <div className="flex flex-col gap-2">
      <ScrollArea label="Damage table against the references">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${HEADER_CELL} text-left`}>Ability</th>
              <th className={HEADER_CELL}>Amount</th>
              {hasCasts && <th className={HEADER_CELL}>Casts</th>}
              {hasCasts && <th className={HEADER_CELL}>Avg cast</th>}
              {hasHits && <th className={HEADER_CELL}>Hits</th>}
              {hasHits && <th className={HEADER_CELL}>Avg hit</th>}
              <th className={HEADER_CELL}>DPS</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.guid || row.name}>
                <td className={`${CELL} text-left`}>
                  <span className="text-muted flex min-w-0 items-center gap-1.5">
                    <SpellIcon name={row.name} icon={icons?.[row.name]} />
                    <span className="truncate">{row.name}</span>
                  </span>
                  <ShareBar row={row} />
                </td>
                <Cell
                  mine={row.mine.amount}
                  field={row.field?.amount ?? null}
                  format={compact}
                  showField={showField}
                />
                {hasCasts && (
                  <Cell
                    mine={row.mine.casts}
                    field={row.field?.casts ?? null}
                    format={count}
                    showField={showField}
                  />
                )}
                {hasCasts && (
                  <Cell
                    mine={row.mine.avgCast}
                    field={row.field?.avgCast ?? null}
                    format={compact}
                    showField={showField}
                  />
                )}
                {hasHits && (
                  <Cell
                    mine={row.mine.hits}
                    field={row.field?.hits ?? null}
                    format={count}
                    showField={showField}
                  />
                )}
                {hasHits && (
                  <Cell
                    mine={row.mine.avgHit}
                    field={row.field?.avgHit ?? null}
                    format={compact}
                    showField={showField}
                  />
                )}
                <td className={CELL}>
                  <div className="text-text">
                    {compact(row.mine.dps)}
                    {row.deviationPct !== null && <DeviationBadge pct={row.deviationPct} />}
                  </div>
                  {showField && (
                    <div className="text-muted text-2xs">
                      {row.field === null ? '—' : compact(row.field.dps)}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <TotalRow
              total={table.total}
              hasCasts={hasCasts}
              hasHits={hasHits}
              showField={showField}
            />
          </tfoot>
        </table>
      </ScrollArea>
      <p className="text-2xs text-muted px-3">
        {showField ? (
          <>
            Your figures on top, the median of{' '}
            <span className="font-mono">{table.referenceTotal}</span> comparable logs beneath. The
            bar is your share of damage; the grey behind it, where the references range on that
            ability.
          </>
        ) : (
          <>No comparable log carries a readable damage table, so only your own side is shown.</>
        )}
      </p>
    </div>
  );
}

/**
 * Le total du combat, pas la somme des lignes affichées : l'union n'en garde qu'une vingtaine,
 * et une médiane par sort ne s'additionne pas.
 */
function TotalRow({
  total,
  hasCasts,
  hasHits,
  showField,
}: {
  total: Table['total'];
  hasCasts: boolean;
  hasHits: boolean;
  showField: boolean;
}) {
  const field = (of: (m: AbilityMetrics) => number | null) =>
    total.field === null ? null : of(total.field);

  return (
    <tr>
      <td className={`${CELL} text-muted border-border-strong text-left uppercase`}>Total</td>
      <Cell
        mine={total.mine.amount}
        field={field((m) => m.amount)}
        format={compact}
        showField={showField}
      />
      {hasCasts && (
        <Cell
          mine={total.mine.casts}
          field={field((m) => m.casts)}
          format={count}
          showField={showField}
        />
      )}
      {hasCasts && (
        <Cell
          mine={total.mine.avgCast}
          field={field((m) => m.avgCast)}
          format={compact}
          showField={showField}
        />
      )}
      {hasHits && (
        <Cell
          mine={total.mine.hits}
          field={field((m) => m.hits)}
          format={count}
          showField={showField}
        />
      )}
      {hasHits && (
        <Cell
          mine={total.mine.avgHit}
          field={field((m) => m.avgHit)}
          format={compact}
          showField={showField}
        />
      )}
      <td className={CELL}>
        <div className="text-text">
          {compact(total.mine.dps)}
          {total.deviationPct !== null && <DeviationBadge pct={total.deviationPct} />}
        </div>
        {showField && (
          <div className="text-muted text-2xs">
            {total.field === null ? '—' : compact(total.field.dps)}
          </div>
        )}
      </td>
    </tr>
  );
}
