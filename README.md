# LogLense

Pulls character performance data from Warcraft Logs and compares it against players who
killed the same boss in comparable conditions. Shows stats, rotation, talent diffs, and
generates an AI coaching report.

The app is behind a Battle.net login and a closed-beta allowlist: **a deployment with an
empty allowlist lets nobody in, including you.** See [Beta allowlist](#5-beta-allowlist).

## Setup

### Prerequisites

- **Node 22** — the version CI runs on (`.github/workflows/ci.yml`).
- **pnpm** — `corepack enable` is enough.

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create the four external accounts

Nothing below is optional: the app refuses to start in production without all of them
(`src/lib/startup-check.ts`), and fails at first use in development.

| Service | Where | What you get |
|---|---|---|
| Warcraft Logs API client | <https://www.warcraftlogs.com/api/clients/> — redirect URI `https://localhost` | `WCL_CLIENT_ID`, `WCL_CLIENT_SECRET` |
| Battle.net OAuth client | <https://develop.battle.net/> — redirect URI `http://localhost:3000/api/auth/callback/battlenet` | `BLIZZARD_CLIENT_ID_DEV`, `BLIZZARD_CLIENT_SECRET_DEV` |
| Upstash Redis | <https://console.upstash.com/> — free tier is enough | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Two local secrets | `openssl rand -base64 32` and `openssl rand -hex 32` | `NEXTAUTH_SECRET`, `LABEL_SALT` |

A **production** deployment needs a *second* Battle.net client, whose redirect URI points
at the deployed domain — hence the `_DEV` / `_PROD` pairs below. See
[docs/06-deploiement.md](docs/06-deploiement.md).

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

| Variable | Local dev | Production | Description |
|---|---|---|---|
| `WCL_CLIENT_ID` | **Yes** | **Yes** | Warcraft Logs API client ID |
| `WCL_CLIENT_SECRET` | **Yes** | **Yes** | Warcraft Logs API client secret |
| `NEXTAUTH_SECRET` | **Yes** | **Yes** | Signs the session cookie — `openssl rand -base64 32` |
| `BLIZZARD_CLIENT_ID_DEV` | **Yes** | — | Battle.net client for `localhost` |
| `BLIZZARD_CLIENT_SECRET_DEV` | **Yes** | — | idem |
| `BLIZZARD_CLIENT_ID_PROD` | — | **Yes** | Battle.net client for the deployed domain |
| `BLIZZARD_CLIENT_SECRET_PROD` | — | **Yes** | idem |
| `UPSTASH_REDIS_REST_URL` | **Yes** | **Yes** | Favourites, recents, quotas, label corpus |
| `UPSTASH_REDIS_REST_TOKEN` | **Yes** | **Yes** | idem |
| `LABEL_SALT` | **Yes** | **Yes** | Salts the anonymous corpus identifier — `openssl rand -hex 32`. Missing: the label routes answer `503` and write nothing rather than store an unsalted identity |
| `BETA_ALLOWLIST` | **Yes** | **Yes** | Comma-separated battletags. Empty or absent = **nobody can log in** |
| `NEXTAUTH_URL_DEV` | **Yes** | — | `http://localhost:3000` |
| `NEXTAUTH_URL_PROD` | — | **Yes** | Deployed origin. Read at **build** time by `next.config.ts` |
| `GROQ_API_KEY` | No | No | Server-side Groq key — users can paste their own in the UI instead |
| `GEMINI_API_KEY` | No | No | Server-side Gemini key — users can paste their own in the UI |
| `GEMINI_MODEL` | No | No | Override the Gemini model (default: `gemini-3.5-flash-lite`) |
| `ANTHROPIC_API_KEY` | No | No | Server-side Claude key — users can paste their own in the UI |
| `ENABLE_DEV_SESSION` | No | **Never** | Dev-only fake session for browser tests. The production guard throws if it is set |

The eight variables the production guard checks are `WCL_CLIENT_ID`, `WCL_CLIENT_SECRET`,
`NEXTAUTH_SECRET`, `BLIZZARD_CLIENT_ID_PROD`, `BLIZZARD_CLIENT_SECRET_PROD`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `LABEL_SALT` — the list lives in
`src/lib/startup-check.ts` and runs from `src/instrumentation.ts` when
`VERCEL_ENV === 'production'`. `BETA_ALLOWLIST` is **not** in that list but is required in
practice: the guard lets the deployment boot, and every login is then refused.

If no server-side AI key is set for a provider, the user is prompted to paste their own key
in the AI Report tab.

### 4. Start the dev server

```bash
pnpm dev
```

Open <http://localhost:3000>.

### 5. Beta allowlist

`BETA_ALLOWLIST` holds the battletags admitted to the closed beta, comma-separated:

```
BETA_ALLOWLIST=Jumbaa#1234,Autre#4321
```

The check is case-insensitive and **fails closed** (`src/lib/auth.ts`): an empty list admits
nobody rather than everybody. Put your own battletag in it before the first login, or the
Battle.net round-trip will send you back to the sign-in page with no explanation.

---

## Usage

1. Sign in with Battle.net — the account must be on the allowlist
2. Pick one of the four entry points:
   - **Analyse a Character** — name, realm, region, difficulty, then the raid and bosses
   - **Analyse a Report** — a WCL report code, then the player to analyse in it
   - **Sort a Raid** — a report code, ranked by who is furthest from their references
   - **Compare Two Pulls** — two pulls of the same boss, side by side
3. Results load per-boss as they arrive
4. Switch between **Overview**, **Comparison** and **AI Report** tabs
5. In AI Report, choose a provider (Groq / Gemini / Claude) and paste your API key if none is
   set server-side

---

## Tech Stack

- **Next.js 16** — App Router, API routes
- **React 19** — client hooks, streaming UI
- **NextAuth v4** — Battle.net provider, closed-beta allowlist
- **Upstash Redis** — the only persistence: favourites, recents, quotas, label corpus
- **Warcraft Logs API** — GraphQL, OAuth2 client-credentials
- **Groq / Gemini / Claude** — AI coaching report via SSE streaming

---

## Development

```bash
pnpm dev           # start dev server
pnpm build         # production build
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm lint          # ESLint
pnpm format:check  # Prettier, check only
pnpm format        # Prettier, write
```

The last four are the gates: the pre-commit hook runs them, and so does CI on every push.
A commit that fails one of them does not land.

Deployment — secrets, Vercel setup, how a beta tester is admitted — is documented in
[docs/06-deploiement.md](docs/06-deploiement.md).

### Agent skills

The agent skills used on this project are pinned in `skills-lock.json`, but the skill
files themselves live in `.agents/` and `.claude/`, both gitignored. On a fresh clone,
restore them in two steps:

```bash
npx skills experimental_install       # restores .agents/skills at the pinned versions
mkdir -p .claude/skills && cp -r .agents/skills/. .claude/skills/
```

The second step is required: `experimental_install` only populates `.agents/skills`,
and Claude Code reads `.claude/skills`. Verified on a fresh clone — 15 skills restored.

Project context for agents lives in `CLAUDE.md` (domain vocabulary, code map,
verification commands) and `PRODUCT_CONTEXT.md` (product framing and priorities).
How the code works today is in [docs/](docs/README.md).

---

## Known Limitations

- **Talent names:** WCL does not resolve talent tree spell IDs to names. The Comparison tab shows talent diffs as node names resolved from the local `src/data/talents/spec-*.json` files.
- **Bracket percentile:** True ilvl-bracket percentile is not directly queryable from the WCL API.
- **Private logs:** Reports set to private on WCL are inaccessible via the API.
- **Comparability:** references are ranked by ilvl and kill-time distance, then verified — a candidate helped more than you (higher set bonus, more external buffs) is disqualified. If fewer than three qualify, the panel is completed with disqualified candidates, the comparability level drops to *poor* whatever the distances say, and the screen shows how many were substituted. See [docs/03-comparabilite.md](docs/03-comparabilite.md).
- **No admin UI:** admitting a beta tester means editing `BETA_ALLOWLIST` and redeploying.
