import { describe, expect, it } from 'vitest';
import { ALL_DPS_SPEC_IDS, getDpsSpecsForClass, getSpecInfo } from '../specs';

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
});

describe('all DPS spec IDs', () => {
  it('has 25 DPS specs', () => {
    expect(ALL_DPS_SPEC_IDS).toHaveLength(25);
  });
});
