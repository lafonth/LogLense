import type { BossResult, Comparability, ReferenceSample } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerdictBanner } from '../VerdictBanner';

function sample(dps: number): ReferenceSample {
  return { dps, qualified: true } as ReferenceSample;
}

const casts = (perMin: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(perMin).map(([name, v]) => [
      name,
      { guid: 0, casts: Math.round(v * 4), perMin: v },
    ])
  );

function result(over: {
  dps?: number;
  sample?: ReferenceSample[];
  comparability?: Partial<Comparability>;
  /** Les lancers par minute du sujet, et ceux de chaque référence — voir `leadingGap`. */
  mine?: Record<string, number>;
  references?: Record<string, number>[];
}): BossResult {
  return {
    character: {
      dps: over.dps ?? 100000,
      // Quatre minutes, comme le `× 4` du helper ci-dessus : `leadingGap` convertit une
      // cadence en nombre de lancers avant de décider qu'il y a quelque chose à dire.
      rotation: { casts: casts(over.mine ?? {}), fightDurationMs: 240_000 },
      damageTable: { entries: [] },
    },
    sample: over.sample ?? [sample(120000)],
    topPlayers: (over.references ?? []).map((perMin) => ({
      rotation: { casts: casts(perMin) },
      damageTable: { entries: [] },
    })),
    comparability: {
      level: 'close',
      referenceIlvl: 285,
      myIlvl: 284,
      referenceKillTimeMs: 305000,
      myKillTimeMs: 300000,
      candidatesConsidered: 942,
      pagesFetched: 10,
      disqualified: 0,
      unverifiable: 0,
      substituted: 0,
      ...over.comparability,
    },
    // Le composant ne lit que ces branches : le reste du `BossResult` n'a pas à être
    // fabriqué pour que le verdict soit lisible.
  } as unknown as BossResult;
}

describe('verdictBanner', () => {
  it('dit la marge en une phrase, sans rouge sur un écart', () => {
    const { container } = render(<VerdictBanner result={result({ dps: 100000 })} />);

    expect(screen.getByText(/that is your margin on this pull/)).toBeInTheDocument();
    expect(screen.getByText('20,000')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('text-danger');
  });

  it('enveloppe le nombre, pas la phrase', () => {
    render(<VerdictBanner result={result({})} />);

    expect(screen.getByText('120,000')).toHaveClass('font-mono');
  });

  it('ne présente pas une avance comme un retard', () => {
    render(<VerdictBanner result={result({ dps: 130000 })} />);

    expect(screen.getByText(/is not in raw damage/)).toBeInTheDocument();
    expect(screen.getByText('10,000')).toBeInTheDocument();
  });

  it('porte sa réserve quand la comparabilité est approximative', () => {
    render(<VerdictBanner result={result({ comparability: { level: 'approximate' } })} />);

    expect(screen.getByText(/order of magnitude/)).toBeInTheDocument();
  });

  it('ne chiffre aucun écart quand la comparaison ne le porte pas', () => {
    render(
      <VerdictBanner
        result={result({ comparability: { level: 'poor', referenceIlvl: 292, myIlvl: 284 } })}
      />
    );

    expect(screen.getByText(/No log close enough to yours qualified/)).toBeInTheDocument();
    expect(screen.getByText('+8')).toBeInTheDocument();
    expect(screen.queryByText('20,000')).not.toBeInTheDocument();
  });

  // Le retard était déjà calculé, mais rangé dans l'onglet Comparison — que le lecteur
  // n'ouvre pas. La valeur ajoutée est la hiérarchisation, pas le calcul.
  it('dit où l’écart se lit, sans qu’un onglet soit ouvert', () => {
    render(
      <VerdictBanner result={result({ mine: { Rip: 2 }, references: [{ Rip: 4 }, { Rip: 4 }] })} />
    );

    expect(screen.getByText(/Your rotation diverges most on/)).toBeInTheDocument();
    expect(screen.getByText('Rip')).toBeInTheDocument();
    expect(screen.getByText('4')).toHaveClass('font-mono');
    expect(screen.getByText(/across/)).toHaveTextContent('across 2 references.');
  });

  // Le sort de tête est celui dont l'écart coûte le plus, et son signe est libre : on peut
  // être derrière au DPS sur un sort qu'on lance *plus*. Une amorce qui affirmerait un manque
  // ferait alors lire l'inverse de la donnée.
  it('n’affirme pas un manque sur un sort lancé plus que les références', () => {
    render(
      <VerdictBanner result={result({ mine: { Rip: 6 }, references: [{ Rip: 4 }, { Rip: 4 }] })} />
    );

    expect(screen.getByText(/Your rotation diverges most on/)).toBeInTheDocument();
    expect(screen.getByText('6')).toHaveClass('font-mono');
  });

  // Un effectif de un se lit « 1 reference », et une cadence arrondie tombe sur l'unité.
  it('accorde le singulier sur une cadence d’un lancer', () => {
    render(
      <VerdictBanner result={result({ mine: { Rip: 1 }, references: [{ Rip: 4 }, { Rip: 4 }] })} />
    );

    expect(screen.getByText(/diverges most on/)).toHaveTextContent('1 cast a minute');
  });

  // Même règle que le delta de DPS : un panel illégitime ne chiffre rien, et nommer un sort
  // responsable dirait par la bande ce que la phrase du dessus refuse de dire.
  it('ne nomme aucun sort quand le verdict ne chiffre pas l’écart', () => {
    render(
      <VerdictBanner
        result={result({
          mine: { Rip: 2 },
          references: [{ Rip: 4 }, { Rip: 4 }],
          comparability: { level: 'poor' },
        })}
      />
    );

    expect(screen.queryByText(/diverges most on/)).not.toBeInTheDocument();
  });

  // Le point du lot : la bannière ne parlait de comparabilité que lorsqu'elle était mauvaise.
  // Le seul cas où le produit fait exactement ce qu'il vend était le seul où l'écran se taisait.
  it('dit sur quoi le chiffre se fonde quand le panel est légitime', () => {
    render(
      <VerdictBanner
        result={result({ sample: [sample(115000), sample(120000), sample(130000)] })}
      />
    );

    expect(screen.getByText(/Read from/)).toHaveTextContent(
      'Read from 3 reference logs, +1 item level from your 284, their kills running +1.7% against yours — all cleared the set bonus and externals checks.'
    );
  });

  it('le dit aussi en repli, sans répéter l’ilvl que la phrase du dessus porte', () => {
    render(<VerdictBanner result={result({ comparability: { level: 'poor' } })} />);

    const basis = screen.getByText(/Read from/);
    expect(basis).toHaveTextContent('Read from 1 reference log');
    expect(basis).not.toHaveTextContent('item level');
  });

  it('ne certifie pas les critères éliminatoires quand le panel a été complété', () => {
    render(<VerdictBanner result={result({ comparability: { substituted: 1 } })} />);

    expect(screen.getByText(/Read from/)).not.toHaveTextContent('all cleared');
  });

  it('le dit au lieu de comparer à rien', () => {
    render(
      <VerdictBanner
        result={result({ sample: [], comparability: { level: 'none', referenceIlvl: null } })}
      />
    );

    expect(screen.getByText(/No comparable log was found/)).toBeInTheDocument();
  });
});
