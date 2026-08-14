# LogLense

Pulls character performance data from Warcraft Logs and compares it against top-ranked players on each boss. Shows stats, rotation, talent diffs, and generates an AI coaching report.

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Get WCL API credentials

Register a client at <https://www.warcraftlogs.com/api/clients/>.
Set the redirect URI to `https://localhost`. Copy the **Client ID** and **Client Secret**.

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `WCL_CLIENT_ID` | **Yes** | Warcraft Logs API client ID |
| `WCL_CLIENT_SECRET` | **Yes** | Warcraft Logs API client secret |
| `GROQ_API_KEY` | No | Server-side Groq key — users can paste their own in the UI instead |
| `GEMINI_API_KEY` | No | Server-side Gemini key — users can paste their own in the UI |
| `GEMINI_MODEL` | No | Override Gemini model (default: `gemini-3.5-flash-lite`) |
| `ANTHROPIC_API_KEY` | No | Server-side Claude key — users can paste their own in the UI |

If no server-side AI key is set for a provider, the user is prompted to paste their own key in the AI Report tab.

### 4. Start the dev server

```bash
pnpm dev
```

Open <http://localhost:3000>.

---

## Usage

1. Enter your character name, realm, region, and difficulty
2. Select the raid and bosses to analyse
3. Click **Analyse** — results load per-boss as they arrive
4. Switch between **Overview**, **Comparison**, and **AI Report** tabs
5. In AI Report, choose a provider (Groq / Gemini / Claude) and paste your API key if not set server-side

---

## Tech Stack

- **Next.js 16** — App Router, API routes
- **React 19** — client hooks, streaming UI
- **Warcraft Logs API** — GraphQL, OAuth2 client-credentials
- **Groq / Gemini / Claude** — AI coaching report via SSE streaming

---

## Development

```bash
pnpm dev        # start dev server
pnpm build      # production build
pnpm test       # run all tests
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
```

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

---

## Known Limitations

- **Talent names:** WCL does not resolve talent tree spell IDs to names. The Comparison tab shows talent diffs as node names resolved from the local `src/data/talents/spec-*.json` files.
- **Bracket percentile:** True ilvl-bracket percentile is not directly queryable from the WCL API.
- **Private logs:** Reports set to private on WCL are inaccessible via the API.
- **Comparability:** Reference logs are picked on kill time alone, and fall back to the raw world top 3 when no log falls in the window — without telling the user. See `PRODUCT_CONTEXT.md` §7.
