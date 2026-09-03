#!/usr/bin/env node
// Refuse les deux lectures que `CLAUDE.md` interdit déjà, et que j'enfreins quand même.
//
// Mesuré sur 95 transcrits du projet : lire des fichiers pèse 3,54 M jetons, soit 38 % de
// tout ce qui est jamais entré en contexte. Deux gisements, tous deux évitables :
//
//   - 90 % du volume `Read` est non borné — 1 833 jetons par appel contre 688 en plage ;
//   - 901 k jetons sont des relectures du même fichier dans une même session.
//
// La règle existait en prose et ne tenait pas. Ici elle tient, parce qu'elle refuse.
//
// Échappatoire : `touch .claude/state/read-guard-off` autorise **la prochaine lecture
// seulement**, et le marqueur est consommé. Une lecture entière reste possible ; elle
// devient un geste explicite au lieu d'une habitude silencieuse.
//
// Toute panne laisse passer : un garde-fou cassé ne doit jamais bloquer une session.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const MAX_OCTETS = Number(process.env.LOGLENS_READ_MAX_BYTES ?? 10000);
const PURGE_MS = 3 * 24 * 60 * 60 * 1000;
// Le garde ne juge que du texte : une image ou un PDF n'a pas de plage de lignes.
const BINAIRE = /\.(png|jpe?g|gif|webp|svg|ico|pdf|woff2?|ttf|eot|zip|gz|mp4|webm|wasm)$/i;

const laisserPasser = () => process.exit(0);

function refuser(raison) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: raison,
      },
    })
  );
  process.exit(0);
}

function lireEntree() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function fichierStat(chemin) {
  try {
    const s = statSync(chemin);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

// Le marqueur est à usage unique : il autorise cet appel et disparaît.
function marqueurConsomme(racine) {
  const m = join(racine, '.claude', 'state', 'read-guard-off');
  if (!existsSync(m)) return false;
  try {
    rmSync(m);
  } catch {
    /* le marqueur reste, la lecture passe quand même */
  }
  return true;
}

function journal(racine, session) {
  const dossier = join(racine, '.claude', 'state', 'reads');
  const fichier = join(dossier, `${String(session).replace(/[^\w-]/g, '')}.json`);
  return { dossier, fichier };
}

function chargerJournal(fichier) {
  try {
    return JSON.parse(readFileSync(fichier, 'utf8'));
  } catch {
    return {};
  }
}

function ecrireJournal(dossier, fichier, donnees) {
  try {
    mkdirSync(dossier, { recursive: true });
    writeFileSync(fichier, JSON.stringify(donnees), 'utf8');
    // Purge opportuniste : les journaux des sessions closes ne servent plus.
    const seuil = Date.now() - PURGE_MS;
    for (const nom of readdirSync(dossier)) {
      const p = join(dossier, nom);
      try {
        if (statSync(p).mtimeMs < seuil) unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* un journal non écrit dégrade la détection, il ne casse rien */
  }
}

// Une lecture entière couvre [1, ∞) ; `null` note la fin de fichier.
function plageDe(entree) {
  const debut = Number(entree.offset) > 0 ? Number(entree.offset) : 1;
  const fin = Number(entree.limit) > 0 ? debut + Number(entree.limit) - 1 : null;
  return [debut, fin];
}

const contient = ([S, E], [s, e]) => s >= S && (E === null || (e !== null && e <= E));

// Un `cat` nu d'un seul fichier — pas de tube, pas de redirection, pas de second argument.
// Tout ce qui est composé est laissé tranquille : le faux positif coûte plus que le gain.
function catNu(commande) {
  const m = /^\s*(?:cat|type)\s+("[^"]+"|'[^']+'|[^\s|>&;]+)\s*$/.exec(commande ?? '');
  return m ? m[1].replace(/^["']|["']$/g, '') : null;
}

function getContentNu(commande) {
  const c = commande ?? '';
  if (/-(TotalCount|Tail|First|Last|Head)\b/i.test(c)) return null;
  const m = /^\s*(?:Get-Content|gc)\s+(?:-Path\s+)?("[^"]+"|'[^']+'|[^\s|>;]+)\s*$/i.exec(c);
  return m ? m[1].replace(/^["']|["']$/g, '') : null;
}

try {
  const entree = lireEntree();
  if (!entree) laisserPasser();

  const outil = entree.tool_name ?? entree.toolName ?? '';
  const args = entree.tool_input ?? entree.toolInput ?? {};
  const racine = entree.cwd ?? process.cwd();

  // ---- Bash / PowerShell : le `cat` entier d'un gros fichier ----------------------
  if (outil === 'Bash' || outil === 'PowerShell') {
    const cible = outil === 'Bash' ? catNu(args.command) : getContentNu(args.command);
    if (!cible) laisserPasser();
    const chemin = resolve(racine, cible);
    if (BINAIRE.test(chemin)) laisserPasser();
    const st = fichierStat(chemin);
    if (!st || st.size <= MAX_OCTETS) laisserPasser();
    if (marqueurConsomme(racine)) laisserPasser();
    refuser(
      `${cible} fait ${Math.round(st.size / 1000)} ko, soit ~${Math.round(st.size / 4000)} k jetons ` +
        `écrits au cache à 10 $/M puis relus douze fois.\n` +
        `Lis une plage : \`sed -n '120,180p' ${cible}\`, ou \`grep -n\` d'abord pour savoir où regarder.\n` +
        `Si la lecture entière est réellement nécessaire : \`touch .claude/state/read-guard-off\` ` +
        `puis relance — le marqueur n'autorise que l'appel suivant.`
    );
  }

  if (outil !== 'Read') laisserPasser();

  const chemin = args.file_path ?? args.filePath;
  if (!chemin || BINAIRE.test(chemin)) laisserPasser();
  const absolu = resolve(racine, chemin);
  const st = fichierStat(absolu);
  if (!st) laisserPasser();

  const borne = Number(args.limit) > 0 || Number(args.offset) > 0;
  const session = entree.session_id ?? entree.sessionId ?? 'inconnue';
  const { dossier, fichier } = journal(racine, session);
  const vu = chargerJournal(fichier);
  const empreinte = `${st.mtimeMs}:${st.size}`;
  const plage = plageDe(args);

  // ---- Relecture : ces octets sont déjà en contexte -------------------------------
  const anterieures = (vu[absolu]?.empreinte === empreinte ? vu[absolu].plages : null) ?? [];
  const couvrante = anterieures.find((p) => contient(p, plage));
  if (couvrante) {
    if (!marqueurConsomme(racine)) {
      const quoi = couvrante[1] === null ? 'en entier' : `lignes ${couvrante[0]}-${couvrante[1]}`;
      refuser(
        `${chemin} a déjà été lu ${quoi} dans cette session et n'a pas changé depuis ` +
          `(mtime et taille identiques). Le contenu est déjà en contexte — le relire le fait ` +
          `réécrire au cache pour rien.\n` +
          `Remonte dans la conversation, ou \`touch .claude/state/read-guard-off\` si tu crois ` +
          `qu'il a été purgé par une compaction.`
      );
    }
    laisserPasser();
  }

  // ---- Lecture entière d'un gros fichier ------------------------------------------
  if (!borne && st.size > MAX_OCTETS && !marqueurConsomme(racine)) {
    refuser(
      `${chemin} fait ${Math.round(st.size / 1000)} ko, soit ~${Math.round(st.size / 4000)} k jetons. ` +
        `Une lecture non bornée les écrit au cache à 10 $/M puis les fait relire à chaque tour.\n` +
        `Passe \`offset\` et \`limit\`, ou \`grep -n\` d'abord pour trouver la plage utile.\n` +
        `Si le fichier entier est réellement nécessaire : \`touch .claude/state/read-guard-off\` ` +
        `puis relance — le marqueur n'autorise que l'appel suivant.`
    );
  }

  // Lecture autorisée : on la consigne pour refuser la suivante si elle est identique.
  const precedentes = vu[absolu]?.empreinte === empreinte ? vu[absolu].plages : [];
  vu[absolu] = { empreinte, plages: [...precedentes, plage].slice(-40) };
  ecrireJournal(dossier, fichier, vu);
} catch {
  // Aucune erreur de ce fichier ne doit empêcher une lecture.
}
laisserPasser();
