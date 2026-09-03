import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// `.claude/**` est exclu de vitest, donc le hook n'est pas importable : on l'exécute pour de
// vrai, par son contrat réel — JSON sur stdin, décision sur stdout. C'est aussi la seule
// façon de vérifier ce qui compte ici : qu'une panne laisse toujours passer la lecture.

const HOOK = resolve(process.cwd(), '.claude/hooks/pre-tool-read.mjs');

type Decision = { decision: 'allow' } | { decision: 'deny'; raison: string };

let racine: string;

function executer(payload: Record<string, unknown>): Decision {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd: racine, session_id: 'test-session', ...payload }),
    encoding: 'utf8',
  });
  expect(r.status).toBe(0);
  if (!r.stdout.trim()) return { decision: 'allow' };
  const sortie = JSON.parse(r.stdout).hookSpecificOutput;
  expect(sortie.hookEventName).toBe('PreToolUse');
  return { decision: sortie.permissionDecision, raison: sortie.permissionDecisionReason };
}

const lire = (file_path: string, extra: Record<string, number> = {}) =>
  executer({ tool_name: 'Read', tool_input: { file_path, ...extra } });

/** Le seuil du hook est de 10 000 octets ; on écrit de part et d'autre sans l'effleurer. */
function ecrire(nom: string, octets: number) {
  const chemin = join(racine, nom);
  writeFileSync(chemin, 'x'.repeat(octets), 'utf8');
  return chemin;
}

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'loglens-read-guard-'));
});

afterEach(() => {
  rmSync(racine, { recursive: true, force: true });
});

describe('garde-fou de lecture (PreToolUse)', () => {
  it('laisse passer un petit fichier lu en entier', () => {
    expect(lire(ecrire('petit.ts', 2000)).decision).toBe('allow');
  });

  it('refuse un gros fichier lu sans plage, et le dit en jetons', () => {
    const d = lire(ecrire('gros.ts', 40000));
    expect(d.decision).toBe('deny');
    if (d.decision !== 'deny') return;
    expect(d.raison).toContain('offset');
    expect(d.raison).toMatch(/~10 k jetons/);
  });

  it('laisse passer le même gros fichier dès qu une plage est donnée', () => {
    expect(lire(ecrire('gros.ts', 40000), { offset: 100, limit: 60 }).decision).toBe('allow');
  });

  it('refuse la relecture à l identique d un fichier inchangé', () => {
    const chemin = ecrire('stable.ts', 2000);
    expect(lire(chemin).decision).toBe('allow');
    const d = lire(chemin);
    expect(d.decision).toBe('deny');
    if (d.decision !== 'deny') return;
    expect(d.raison).toContain('déjà été lu');
  });

  it('refuse une plage déjà couverte par une lecture antérieure plus large', () => {
    const chemin = ecrire('large.ts', 40000);
    expect(lire(chemin, { offset: 1, limit: 200 }).decision).toBe('allow');
    expect(lire(chemin, { offset: 50, limit: 20 }).decision).toBe('deny');
    // Hors de la plage déjà lue, rien à refuser.
    expect(lire(chemin, { offset: 400, limit: 20 }).decision).toBe('allow');
  });

  it('rouvre la lecture dès que le fichier a changé', () => {
    const chemin = ecrire('mouvant.ts', 2000);
    expect(lire(chemin).decision).toBe('allow');
    expect(lire(chemin).decision).toBe('deny');
    ecrire('mouvant.ts', 2500);
    expect(lire(chemin).decision).toBe('allow');
  });

  it('refuse un `cat` nu d un gros fichier, mais pas un `cat` dans un tube', () => {
    ecrire('gros.md', 40000);
    const nu = executer({ tool_name: 'Bash', tool_input: { command: 'cat gros.md' } });
    expect(nu.decision).toBe('deny');
    const tube = executer({
      tool_name: 'Bash',
      tool_input: { command: 'cat gros.md | grep -n export' },
    });
    expect(tube.decision).toBe('allow');
    const plage = executer({
      tool_name: 'Bash',
      tool_input: { command: "sed -n '1,40p' gros.md" },
    });
    expect(plage.decision).toBe('allow');
  });

  it('le marqueur autorise un seul appel puis disparaît', () => {
    const chemin = ecrire('gros.ts', 40000);
    mkdirSync(join(racine, '.claude', 'state'), { recursive: true });
    writeFileSync(join(racine, '.claude', 'state', 'read-guard-off'), '', 'utf8');
    expect(lire(chemin).decision).toBe('allow');
    expect(lire(chemin).decision).toBe('deny');
  });

  it('laisse passer plutôt que de bloquer quand il ne comprend pas', () => {
    const r = spawnSync(process.execPath, [HOOK], { input: 'pas du json', encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
    // Un fichier absent, une image, un autre outil : rien de tout cela ne se juge.
    expect(lire(join(racine, 'inexistant.ts')).decision).toBe('allow');
    expect(lire(ecrire('capture.png', 40000)).decision).toBe('allow');
    expect(executer({ tool_name: 'Grep', tool_input: { pattern: 'x' } }).decision).toBe('allow');
  });
});
