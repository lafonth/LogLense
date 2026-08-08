import { describe, expect, it } from 'vitest';
import { parseFightContext } from '../fight-context';

const ARGS = { code: 'abc', fightId: 17, encounterId: 3177, difficulty: 5, actorId: 63 };

function response(deaths: unknown, fights: unknown) {
  return { reportData: { report: { deaths, fights } } } as Parameters<typeof parseFightContext>[0];
}

const FIGHTS = [
  { id: 11, kill: false, startTime: 1000, difficulty: 5 },
  { id: 12, kill: false, startTime: 2000, difficulty: 5 },
  // Un wipe en héroïque : autre palier, autre combat — il ne compte pas.
  { id: 13, kill: false, startTime: 3000, difficulty: 4 },
  { id: 17, kill: true, startTime: 4000, difficulty: 5 },
  // Postérieur au kill analysé : il ne le précède pas, donc il ne l'explique pas.
  { id: 18, kill: false, startTime: 5000, difficulty: 5 },
];

describe('parseFightContext', () => {
  // `table` est un scalaire JSON : sa forme n'est garantie par aucun schéma. Se tromper
  // d'enveloppe perdrait toutes les morts en silence.
  it.each([
    ['bare array', [{ id: 63, deathTime: 4500 }, { id: 64 }]],
    ['data array', { data: [{ id: 63, deathTime: 4500 }, { id: 64 }] }],
    ['data.entries array', { data: { entries: [{ id: 63, deathTime: 4500 }, { id: 64 }] } }],
  ])('reads the death table wrapped as %s', (_label, deaths) => {
    const ctx = parseFightContext(response(deaths, FIGHTS), ARGS);

    expect(ctx.deaths).toBe(2);
    expect(ctx.subjectDied).toBe(true);
  });

  // Mourir soi-même tronque son propre DPS ; voir mourir les autres allonge le combat. Les
  // deux effets sont opposés, donc les deux comptes doivent rester distincts.
  it('separates raid deaths from the subject dying', () => {
    const ctx = parseFightContext(response([{ id: 64 }, { id: 65 }], FIGHTS), ARGS);

    expect(ctx.deaths).toBe(2);
    expect(ctx.subjectDied).toBe(false);
    expect(ctx.subjectDeathMs).toBeNull();
  });

  it('rebases an absolute death timestamp on the fight start', () => {
    const ctx = parseFightContext(response([{ id: 63, timestamp: 4500 }], FIGHTS), ARGS);

    expect(ctx.subjectDeathMs).toBe(500);
  });

  // Une valeur déjà relative est plus petite que le départ du combat : la soustraire
  // donnerait un négatif qu'on ne saurait plus distinguer d'une absence.
  it('keeps an already-relative death offset as is', () => {
    const ctx = parseFightContext(response([{ id: 63, deathTime: 500 }], FIGHTS), ARGS);

    expect(ctx.subjectDeathMs).toBe(500);
  });

  it('counts only the earlier wipes at the same difficulty', () => {
    const ctx = parseFightContext(response([], FIGHTS), ARGS);

    expect(ctx.wipesBefore).toBe(2);
  });

  // `0` affirmerait « tué à la première pull ». On ne le sait pas : c'est `null`.
  it('reports an unreadable fight list as unknown, not as zero wipes', () => {
    expect(parseFightContext(response([], null), ARGS).wipesBefore).toBeNull();
    expect(parseFightContext(response([], []), ARGS).wipesBefore).toBeNull();
  });

  it('survives a report the query could not resolve', () => {
    const ctx = parseFightContext({ reportData: null }, ARGS);

    expect(ctx).toEqual({
      deaths: 0,
      subjectDied: false,
      subjectDeathMs: null,
      wipesBefore: null,
    });
  });

  it('ignores a death table shaped like nothing it knows', () => {
    const ctx = parseFightContext(response({ total: 3 }, FIGHTS), ARGS);

    expect(ctx.deaths).toBe(0);
    expect(ctx.subjectDied).toBe(false);
  });
});
