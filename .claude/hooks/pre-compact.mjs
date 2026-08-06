#!/usr/bin/env node
// Writes the repository state to disk immediately before the context is compacted.
//
// Compaction is safe exactly when nothing load-bearing lives only in the context.
// `subagent-driven-development` keeps a ledger during a plan; outside one, nothing does.
// This file is the fallback: after a compaction that lost the thread, read it and
// `git log` rather than trusting recollection.
//
// PreCompact cannot inject context, so this writes a file instead of printing.

import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

try {
  const root = git('rev-parse --show-toplevel');
  if (!root) process.exit(0);

  const out = join(root, '.claude', 'state', 'pre-compact.md');
  mkdirSync(dirname(out), { recursive: true });

  const entry = [
    `## Compaction — ${new Date().toISOString()}`,
    '',
    `Branche : ${git('rev-parse --abbrev-ref HEAD')}`,
    `HEAD : ${git('rev-parse --short HEAD')}`,
    '',
    'Statut :',
    '```',
    git('status --short') || '(propre)',
    '```',
    '',
    'Dix derniers commits :',
    '```',
    git('log --oneline -10'),
    '```',
    '',
    '---',
    '',
  ].join('\n');

  appendFileSync(out, entry, 'utf8');
} catch {
  // A failed snapshot must never block compaction.
}
