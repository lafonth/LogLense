/**
 * Fabrique la fixture de `/demo` : une analyse réelle, gelée dans le dépôt, anonymisée.
 *
 * La page publique ne peut pas appeler Warcraft Logs ni relire un instantané — les routes de
 * résultat restent derrière la session, et une analyse nominative publiée ferait de LogLense
 * une publication concurrente d'Archon avant la signature RPGLogs. Elle montre donc un
 * `BossResult` figé, produit une fois par ce script puis dépouillé de tout ce qui identifie
 * quelqu'un : noms de joueurs, codes de rapport, identifiants d'acteur.
 *
 * Les chiffres, eux, ne sont pas retouchés. C'est ce qui distingue un exemple d'une maquette.
 *
 * Usage: npx tsx scripts/build-demo-fixture.ts <nom> <serveur> <region> <encounterId> <difficulté> <specId>
 * Exemple: npx tsx scripts/build-demo-fixture.ts Jumbaa ysondre EU 3306 5 103
 */
import type { AnalysisInput, BossResult } from '../src/types';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

async function main() {
  process.loadEnvFile(resolve(process.cwd(), '.env.local'));

  const { getWCLToken } = await import('../src/lib/wcl/auth');
  const { gql } = await import('../src/lib/wcl/client');
  const { analyzeBoss } = await import('../src/lib/wcl/pipeline');

  const OUT = resolve(process.cwd(), 'src/lib/demo/boss-result.ts');
  const REDACTED_CODE = 'demo';
  const SUBJECT_NAME = 'Toi';

  const [name, slug, region, encounterId, difficulty, specId] = process.argv.slice(2);
  if (!specId) throw new Error('Usage: <nom> <serveur> <region> <encounterId> <difficulté> <specId>');

  const token = await getWCLToken(process.env.WCL_CLIENT_ID!, process.env.WCL_CLIENT_SECRET!);

  const encounterName = (
    await gql<{ worldData: { encounter: { name: string } | null } }>(
      token,
      `query($id: Int!) { worldData { encounter(id: $id) { name } } }`,
      { id: Number(encounterId) }
    )
  ).worldData.encounter?.name;
  if (!encounterName) throw new Error(`Rencontre ${encounterId} inconnue`);

  const input: AnalysisInput = {
    characterName: name,
    serverSlug: slug,
    region: region as AnalysisInput['region'],
    difficulty: Number(difficulty) as 3 | 4 | 5,
    encounters: [{ id: Number(encounterId), name: encounterName }],
    specId: Number(specId),
  };

  const result = await analyzeBoss(token, input, Number(encounterId), encounterName, Number(specId));
  if (!result) throw new Error("L'analyse n'a rien rendu — pas de kill classé sur cette rencontre");

  /**
   * Un pseudonyme stable par joueur : `topPlayers` et `sample` désignent les mêmes personnes,
   * et une resélection dans la démo doit continuer à les recouper.
   */
  const aliases = new Map<string, string>([[result.character.stats.name, SUBJECT_NAME]]);
  function alias(real: string): string {
    const known = aliases.get(real);
    if (known) return known;
    const next = `Référence ${aliases.size}`;
    aliases.set(real, next);
    return next;
  }
  // L'ordre compte : les références nommées les premières sont celles que l'écran montre.
  for (const p of result.topPlayers) alias(p.stats.name);
  for (const s of result.sample) alias(s.name);

  const demo: BossResult = {
    ...result,
    renderId: 'demo',
    // Sans instantané, le chat sait qu'il n'a rien à relire — et la démo ne l'ouvre pas.
    snapshot: undefined,
    character: {
      ...result.character,
      stats: { ...result.character.stats, name: SUBJECT_NAME },
      // `rotation` reporte le nom du joueur : le manquer laisserait le sujet identifiable.
      rotation: { ...result.character.rotation, name: SUBJECT_NAME },
      source: { ...result.character.source, code: REDACTED_CODE, actorId: 0 },
      trajectory: result.character.trajectory.map((p) => ({ ...p, code: REDACTED_CODE })),
    },
    topPlayers: result.topPlayers.map((p) => ({
      ...p,
      stats: { ...p.stats, name: alias(p.stats.name) },
      rotation: { ...p.rotation, name: alias(p.stats.name) },
      provenance: {
        ...p.provenance,
        name: alias(p.provenance.name),
        code: REDACTED_CODE,
        actorId: 0,
      },
    })),
    sample: result.sample.map((s) => ({
      ...s,
      name: alias(s.name),
      stats: { ...s.stats, name: alias(s.name) },
      code: REDACTED_CODE,
      actorId: 0,
    })),
  };

  const header = `// Généré par \`scripts/build-demo-fixture.ts\` le ${new Date().toISOString().slice(0, 10)}.
  // Analyse réelle, joueurs et rapports anonymisés, chiffres intacts. Ne pas éditer à la main :
  // la régénérer coûte trois requêtes, la retoucher coûte la seule chose qu'elle démontre.
  import type { BossResult } from '@/types';

  export const DEMO_CAPTURED_AT = '${new Date().toISOString().slice(0, 10)}';

  export const DEMO_BOSS_RESULT: BossResult = ${JSON.stringify(demo, null, 2)};
  `;

  writeFileSync(OUT, header, 'utf8');
  execFileSync('npx', ['prettier', '--write', OUT], { stdio: 'inherit', shell: true });
  console.log(`Écrit : ${OUT}`);
  console.log(`  ${demo.encounter} — ${demo.topPlayers.length} références, ${demo.sample.length} candidats`);
  console.log(`  moi ${Math.round(demo.character.dps)} dps à ${demo.comparability.myIlvl} d'ilvl`);
  console.log(`  vivier ${demo.comparability.poolDps} à ${demo.comparability.poolIlvl}, références ${demo.comparability.referenceIlvl}`);

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
