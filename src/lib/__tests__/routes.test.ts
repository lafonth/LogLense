import type { CharacterRoute } from '@/lib/routes';
import { describe, expect, it } from 'vitest';
import {
  characterResultPath,
  legacyResultPath,
  parseCharacterRoute,
  parseDifficulty,
  parseRegion,
  parseReportRoute,
  parseTab,
  reportResultPath,
  withPatchedQuery,
} from '../routes';

describe('characterResultPath', () => {
  it('met la région en minuscules dans le chemin', () => {
    expect(characterResultPath({ region: 'EU', realm: 'hyjal', name: 'Kaelith' })).toBe(
      '/character/eu/hyjal/Kaelith'
    );
  });

  it('encode les caractères non ASCII du nom', () => {
    expect(characterResultPath({ region: 'EU', realm: 'hyjal', name: 'Émeraude' })).toBe(
      '/character/eu/hyjal/%C3%89meraude'
    );
  });

  it('encode une barre oblique plutôt que de créer un segment', () => {
    expect(characterResultPath({ region: 'US', realm: 'a/b', name: 'X' })).toBe(
      '/character/us/a%2Fb/X'
    );
  });

  it('rend la query dans un ordre stable, sans les clés absentes', () => {
    expect(
      characterResultPath(
        { region: 'EU', realm: 'hyjal', name: 'Kaelith' },
        { difficulty: 5, zone: 44, spec: 62, tab: 'comparison' }
      )
    ).toBe('/character/eu/hyjal/Kaelith?difficulty=5&zone=44&spec=62&tab=comparison');
  });

  it("n'écrit `shared` que lorsqu'il est vrai", () => {
    const base: CharacterRoute = { region: 'EU', realm: 'hyjal', name: 'Kaelith' };
    expect(characterResultPath(base, { shared: true })).toBe(
      '/character/eu/hyjal/Kaelith?shared=1'
    );
    expect(characterResultPath(base, { shared: false })).toBe('/character/eu/hyjal/Kaelith');
  });

  it('accepte la difficulté 0 sans la confondre avec une absence', () => {
    expect(characterResultPath({ region: 'EU', realm: 'hyjal', name: 'K' }, { boss: 0 })).toBe(
      '/character/eu/hyjal/K?boss=0'
    );
  });
});

describe('reportResultPath', () => {
  it("construit le chemin d'un rapport", () => {
    expect(reportResultPath({ code: 'aBcD1234', actorId: 17 })).toBe('/report/aBcD1234/17');
  });

  it('porte la query du résultat', () => {
    expect(reportResultPath({ code: 'aBcD1234', actorId: 17 }, { difficulty: 5, spec: 62 })).toBe(
      '/report/aBcD1234/17?difficulty=5&spec=62'
    );
  });
});

describe('withPatchedQuery', () => {
  it('conserve la query courante et applique le patch', () => {
    expect(
      withPatchedQuery('/character/eu/hyjal/K', 'difficulty=4&spec=62', { difficulty: 5 })
    ).toBe('/character/eu/hyjal/K?difficulty=5&spec=62');
  });

  it('supprime la clé passée à null', () => {
    expect(
      withPatchedQuery('/character/eu/hyjal/K', 'difficulty=4&boss=2917', { boss: null })
    ).toBe('/character/eu/hyjal/K?difficulty=4');
  });

  it('rend le chemin nu quand la query se vide', () => {
    expect(withPatchedQuery('/character/eu/hyjal/K', 'boss=2917', { boss: null })).toBe(
      '/character/eu/hyjal/K'
    );
  });

  it('accepte des URLSearchParams comme source', () => {
    const params = new URLSearchParams({ spec: '62' });
    expect(withPatchedQuery('/report/x/1', params, { tab: 'rotation' })).toBe(
      '/report/x/1?spec=62&tab=rotation'
    );
  });
});

describe('parseRegion', () => {
  it('accepte une région en minuscules', () => {
    expect(parseRegion('eu')).toBe('EU');
  });

  it("refuse ce qui n'est pas une région", () => {
    expect(parseRegion('xx')).toBeNull();
    expect(parseRegion('')).toBeNull();
    expect(parseRegion(null)).toBeNull();
  });
});

describe('parseDifficulty', () => {
  it('accepte 3, 4 et 5', () => {
    expect(parseDifficulty('3')).toBe(3);
    expect(parseDifficulty('5')).toBe(5);
  });

  it('retombe sur Héroïque pour tout le reste', () => {
    expect(parseDifficulty('7')).toBe(4);
    expect(parseDifficulty('abc')).toBe(4);
    expect(parseDifficulty(null)).toBe(4);
  });
});

describe('parseTab', () => {
  it('accepte un onglet connu', () => {
    expect(parseTab('comparison')).toBe('comparison');
  });

  it("retombe sur l'aperçu pour un onglet inventé", () => {
    expect(parseTab('nope')).toBe('overview');
    expect(parseTab(null)).toBe('overview');
  });
});

describe('parseCharacterRoute', () => {
  it('décode les segments', () => {
    expect(parseCharacterRoute({ region: 'eu', realm: 'hyjal', name: '%C3%89meraude' })).toEqual({
      region: 'EU',
      realm: 'hyjal',
      name: 'Émeraude',
    });
  });

  it('refuse une région inconnue', () => {
    expect(parseCharacterRoute({ region: 'zz', realm: 'hyjal', name: 'K' })).toBeNull();
  });

  it('refuse un segment vide', () => {
    expect(parseCharacterRoute({ region: 'eu', realm: '', name: 'K' })).toBeNull();
  });

  it('fait un aller-retour avec characterResultPath', () => {
    const route = { region: 'EU' as const, realm: 'conseil-des-ombres', name: 'Émeraude' };
    const [, , region, realm, name] = characterResultPath(route).split('/');
    expect(parseCharacterRoute({ region: region!, realm: realm!, name: name! })).toEqual(route);
  });
});

describe('parseReportRoute', () => {
  it("décode le code et l'acteur", () => {
    expect(parseReportRoute({ code: 'aBcD1234', actor: '17' })).toEqual({
      code: 'aBcD1234',
      actorId: 17,
    });
  });

  it("refuse un acteur qui n'est pas un entier positif", () => {
    expect(parseReportRoute({ code: 'aBcD1234', actor: '0' })).toBeNull();
    expect(parseReportRoute({ code: 'aBcD1234', actor: 'x' })).toBeNull();
    expect(parseReportRoute({ code: 'aBcD1234', actor: '1.5' })).toBeNull();
  });
});

describe('legacyResultPath', () => {
  it('traduit un ancien lien de personnage', () => {
    expect(
      legacyResultPath({
        char: 'Kaelith',
        server: 'hyjal',
        region: 'eu',
        difficulty: '5',
        zone: '44',
        spec: '62',
      })
    ).toBe('/character/eu/hyjal/Kaelith?difficulty=5&zone=44&spec=62');
  });

  it('traduit un ancien lien de rapport', () => {
    expect(legacyResultPath({ report: 'aBcD1234', actor: '17', spec: '62', difficulty: '4' })).toBe(
      '/report/aBcD1234/17?difficulty=4&spec=62'
    );
  });

  it('donne priorité au rapport quand les deux jeux de paramètres sont présents', () => {
    expect(
      legacyResultPath({
        report: 'aBcD1234',
        actor: '17',
        char: 'Kaelith',
        server: 'hyjal',
      })
    ).toBe('/report/aBcD1234/17');
  });

  it("retombe sur EU quand la région manque, comme le faisait l'ancien lecteur", () => {
    expect(legacyResultPath({ char: 'Kaelith', server: 'hyjal' })).toBe(
      '/character/eu/hyjal/Kaelith'
    );
  });

  it('conserve la marque `shared`', () => {
    expect(legacyResultPath({ char: 'Kaelith', server: 'hyjal', shared: '1' })).toBe(
      '/character/eu/hyjal/Kaelith?shared=1'
    );
  });

  it('rend `null` quand la query ne désigne aucune analyse', () => {
    expect(legacyResultPath({})).toBeNull();
    expect(legacyResultPath({ tab: 'comparison' })).toBeNull();
  });
});
