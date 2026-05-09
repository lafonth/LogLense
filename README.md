# WoW Feral Druid Damage Analyzer

Pulls data from the Warcraft Logs API and compares a character's performance against top-ranked players of the same spec on each boss.

## Setup

### 1. Get WCL API credentials
Go to https://www.warcraftlogs.com/api/clients/ and create a new client.  
Set the redirect URI to `https://localhost`. Copy the Client ID and Client Secret.

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure `config.json`
```json
{
  "client_id": "your-client-id",
  "client_secret": "your-client-secret",
  "report_code": "XXXXXXXXXXXXXX",
  "character_name": "Jumbaa",
  "server_slug": "ysondre",
  "server_region": "EU",
  "difficulty": 5,
  "encounters": [
    {"id": 3306, "name": "Chimaerus, the Undreamt God"},
    {"id": 3176, "name": "Imperator Averzian"},
    {"id": 3177, "name": "Vorasius"},
    {"id": 3179, "name": "Fallen-King Salhadaar"},
    {"id": 3178, "name": "Vaelgor & Ezzorak"}
  ]
}
```

- `difficulty`: 5 = Mythic, 4 = Heroic, 3 = Normal
- `report_code`: only needed for the older individual scripts (see below)

---

## Main Script

### `analyze_character.py` ⭐
**The master script. Run this one.**

For each encounter defined in `config.json`, it:
1. Fetches the character's **best personal parse** (highest DPS kill) from WCL rankings
2. Pulls the **damage table**, **rotation tables** (casts, buffs, debuffs), and **stats** (ilvl, agility, crit, haste, mastery, vers) for that best kill
3. Fetches **world rankings** for that encounter and filters to parses within ±20% of the character's kill time
4. Pulls the same data (rotation + stats) for the **top 3 similar-kill-time players**
5. Reports percentiles: **overall DPS**, **boss-only DPS**, and the **total number of logged parses** for context

**Output:** `character_analysis.json`

**Metrics reported per boss:**
| Metric | Description |
|---|---|
| `dps` | Total DPS (all damage including adds/cleave) |
| `boss_dps` | Damage dealt to boss only |
| `overall_pct` | Percentile among all logged Feral parses globally |
| `boss_dps_pct` | Percentile for boss-only damage |
| `today_pct` | Percentile compared to parses logged today |
| `bracket` | Item level bracket (player's ilvl at kill time) |
| `kill_time` | Fight duration |

```bash
python analyze_character.py
```

---

## Individual Scripts (older workflow — require a specific `report_code`)

These scripts were built iteratively before `analyze_character.py` consolidated everything. They still work and are useful for one-off debugging.

### `fetch_logs.py`
Fetches the **damage done table** for the configured character from a specific report.  
Pulls per-ability damage breakdown for every boss kill in the report.

**Output:** `report_data.json`

```bash
python fetch_logs.py
```

---

### `fetch_rankings.py`
For each boss in `report_data.json`, fetches the **top 10 world Feral rankings** and filters them to parses within ±20% of the character's kill time.

**Output:** `rankings_data.json`

```bash
python fetch_rankings.py
```

---

### `fetch_stats.py`
Fetches **CombatantInfo** (gear, stats, talents) for the character and the top 5 similar-kill-time players per boss.  
Compares: average ilvl, agility, crit rating, haste rating, mastery rating, versatility.

**Output:** `stats_comparison.json`

```bash
python fetch_stats.py
```

---

### `fetch_rotation.py`
Fetches **cast tables, buff uptimes, and debuff uptimes** for the character and top 3 players per boss.  
Tracks key Feral abilities: Tiger's Fury, Berserk, Feral/Frantic Frenzy, Convoke, Rip, Rake, Ferocious Bite, Primal Wrath, Shred, Swipe, Moonfire.  
Computes casts per minute and uptime % for comparison.

**Output:** `rotation_comparison.json`

```bash
python fetch_rotation.py
```

---

### `fetch_talents.py`
Extracts **talent tree IDs** from CombatantInfo for the character and top 3 players per boss.  
Identifies talents that the character has but top players don't (and vice versa), using a majority-vote approach across the top 3.

**Output:** `talent_comparison.json`

> **Note:** The WCL API does not expose human-readable talent names from spell IDs in the talent tree. The output shows raw spell IDs for differing talents. To interpret them, compare builds visually in the WCL report UI or export your talent string from the WoW client.

```bash
python fetch_talents.py
```

---

## Debug Scripts

One-off inspection scripts, not part of the main workflow.

### `debug_gear.py`
Dumps the full raw **CombatantInfo event** for the character on the first boss in `report_data.json`.  
Useful for inspecting gear slots, stat fields, talent tree structure, and auras.

### `debug_casts.py`
Compares the **full cast list** (all ability GUIDs and cast counts) between the character and a hardcoded comparison player (Catsavage on Imperator Averzian by default) side by side.  
Useful for discovering ability spell IDs that differ between builds.

### `debug_char_rankings.py`
Dumps all **fields available on a character's encounterRankings** entry for the first encounter in config.  
Useful for discovering new API fields (percentiles, bracket data, kill counts, etc.).

### `debug_talents.py`
Tests the WCL `playerDetails` query format to inspect how talent data is structured in that endpoint.

### `debug_talent_lookup.py`
Attempts to resolve talent spell IDs to human-readable names via `gameData.ability` and `gameData.talent` queries.

### `debug_brackets.py`
Tests the WCL encounter `brackets` field to discover ilvl bracket structure.  
> Note: `brackets` is not a valid field on the WCL `Encounter` type — this script confirms the limitation.

---

## Data Files

| File | Generated by | Contents |
|---|---|---|
| `report_data.json` | `fetch_logs.py` | Per-ability damage table for the character across all boss kills in a report |
| `rankings_data.json` | `fetch_rankings.py` | Top 10 world Feral parses per boss with similar kill time filter |
| `stats_comparison.json` | `fetch_stats.py` | Gear stats comparison: character vs top 5 players per boss |
| `rotation_comparison.json` | `fetch_rotation.py` | Cast counts, uptime %, casts-per-minute: character vs top 3 per boss |
| `talent_comparison.json` | `fetch_talents.py` | Differing talent IDs between character and top 3 players per boss |
| `character_analysis.json` | `analyze_character.py` | Full consolidated analysis: best parses, percentiles, rotation, stats per boss |

---

## Known Limitations

- **Talent names:** The WCL API does not resolve talent tree spell IDs to names. Differing talents are shown as raw IDs.
- **Bracket percentile:** WCL's internal bracket IDs are not exposed via the API. The `bracket` field shows the player's item level at kill time; true bracket percentile (vs all players at same ilvl) is not directly queryable.
- **World rankings page size:** The `characterRankings` endpoint returns a maximum of ~100 top parses. Bracket percentile comparisons are limited to that pool.
- **Private logs:** Reports set to private on WCL are inaccessible via the API.
