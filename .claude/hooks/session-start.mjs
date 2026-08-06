#!/usr/bin/env node
// Injects the repository's current state at session start.
//
// This is what makes `/clear` cheap: without it, every cleared session spends its first
// turns running git commands to work out where it is. With it, clearing is preferable to
// compacting whenever the subject changes.
//
// Failures are silent by design — a broken hook must never block a session.

import { execSync } from 'node:child_process';

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

try {
  const branch = git('rev-parse --abbrev-ref HEAD');
  if (!branch) process.exit(0);

  const status = git('status --short');
  const log = git('log --oneline -5');
  const upstream = git('status -sb').split('\n')[0] ?? '';

  const lines = [
    '## État du dépôt à l\'ouverture de la session',
    '',
    `Branche : ${branch}`,
    upstream.includes('[') ? `Suivi : ${upstream.slice(upstream.indexOf('['))}` : 'Suivi : à jour avec origin',
    '',
    status ? `Modifications non commitées :\n\`\`\`\n${status}\n\`\`\`` : 'Arbre de travail propre.',
    '',
    'Cinq derniers commits :',
    '```',
    log,
    '```',
    '',
    'Ne relance pas ces commandes pour te réorienter — cet état vient d\'être mesuré.',
  ];

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: lines.join('\n').slice(0, 9000),
      },
    })
  );
} catch {
  // Never break the session over a status banner.
}
