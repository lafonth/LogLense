import { describe, expect, it } from 'vitest';
import { ALL_DPS_SPEC_IDS, getDpsSpecsForClass, getSpecInfo, specLabel } from '../specs';

describe('getSpecInfo', () => {
  it('returns info for Feral Druid', () => {
    const info = getSpecInfo(103);
    expect(info).not.toBeNull();
    expect(info!.specName).toBe('Feral');
    expect(info!.className).toBe('Druid');
    expect(info!.primaryStat).toBe('agility');
  });

  it('returns info for an intellect spec (Shadow Priest)', () => {
    const info = getSpecInfo(258);
    expect(info).not.toBeNull();
    expect(info!.primaryStat).toBe('intellect');
  });

  it('returns info for a strength spec (Arms Warrior)', () => {
    const info = getSpecInfo(71);
    expect(info).not.toBeNull();
    expect(info!.primaryStat).toBe('strength');
  });

  it('returns null for unknown spec', () => {
    expect(getSpecInfo(9999)).toBeNull();
  });

  // La table connaît désormais les soins et les tanks : c'est ce qui permet de nommer ce
  // qu'on refuse. Le prix à payer est que `getSpecInfo` non nul ne dit plus « c'est du DPS »
  // — seul `supported` le dit, et 257 est le cas qui a produit un rapport faux.
  it('knows Holy Priest, and marks it unsupported rather than unknown', () => {
    const info = getSpecInfo(257);
    expect(info).not.toBeNull();
    expect(specLabel(info!)).toBe('Holy Priest');
    expect(info!.role).toBe('healer');
    expect(info!.supported).toBe(false);
  });
});

describe('getDpsSpecsForClass', () => {
  it('returns Feral and Balance for Druid', () => {
    const specs = getDpsSpecsForClass('Druid');
    expect(specs.map((s) => s.specName)).toContain('Feral');
    expect(specs.map((s) => s.specName)).toContain('Balance');
  });

  it('returns empty array for unknown class', () => {
    expect(getDpsSpecsForClass('Unknown')).toHaveLength(0);
  });

  // Un soin et un tank vivent maintenant dans la même table que les specs de dégâts : ce qui
  // choisit une spec à analyser doit continuer de ne voir que ces dernières.
  it('leaves the healing and tanking Druid specs out', () => {
    const names = getDpsSpecsForClass('Druid').map((s) => s.specName);
    expect(names).not.toContain('Restoration');
    expect(names).not.toContain('Guardian');
  });
});

describe('all DPS spec IDs', () => {
  // Dérivé de `supported`, non maintenu à la main : élargir la table ne doit jamais élargir
  // ce que nous acceptons d'analyser.
  it('has 25 DPS specs', () => {
    expect(ALL_DPS_SPEC_IDS).toHaveLength(25);
    expect(ALL_DPS_SPEC_IDS).not.toContain(257);
  });
});
