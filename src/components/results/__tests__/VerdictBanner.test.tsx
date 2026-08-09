import type { BossResult, Comparability, ReferenceSample } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerdictBanner } from '../VerdictBanner';

function sample(dps: number): ReferenceSample {
  return { dps, qualified: true } as ReferenceSample;
}

function result(over: {
  dps?: number;
  sample?: ReferenceSample[];
  comparability?: Partial<Comparability>;
}): BossResult {
  return {
    character: { dps: over.dps ?? 100000 },
    sample: over.sample ?? [sample(120000)],
    topPlayers: [],
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
    // Le composant ne lit que ces trois branches : le reste du `BossResult` n'a pas à être
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

  it('le dit au lieu de comparer à rien', () => {
    render(
      <VerdictBanner
        result={result({ sample: [], comparability: { level: 'none', referenceIlvl: null } })}
      />
    );

    expect(screen.getByText(/No comparable log was found/)).toBeInTheDocument();
  });
});
