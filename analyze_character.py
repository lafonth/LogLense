"""
Master analysis script.
Pulls a character's best parse per boss, compares against top 3 similar kill-time players.
Configure everything in config.json before running.
"""
import json
import sys
import requests

sys.stdout.reconfigure(encoding="utf-8")

CONFIG_FILE  = "config.json"
OUTPUT_FILE  = "character_analysis.json"
TOKEN_URL    = "https://www.warcraftlogs.com/oauth/token"
API_URL      = "https://www.warcraftlogs.com/api/v2/client"

FERAL_SPEC_ID       = 103
KILL_TIME_TOLERANCE = 0.20   # ±20%
TOP_N               = 3


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def get_access_token(client_id, client_secret):
    r = requests.post(TOKEN_URL, data={"grant_type": "client_credentials"},
                      auth=(client_id, client_secret))
    r.raise_for_status()
    return r.json()["access_token"]


def gql(token, query, variables=None):
    r = requests.post(API_URL,
                      json={"query": query, **({"variables": variables} if variables else {})},
                      headers={"Authorization": f"Bearer {token}"})
    r.raise_for_status()
    data = r.json()
    if "errors" in data:
        raise RuntimeError(data["errors"])
    return data["data"]


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

Q_CHARACTER_RANKINGS = """
query CharacterRankings($name:String!, $slug:String!, $region:String!,
                         $encounterID:Int!, $difficulty:Int!) {
  characterData {
    character(name:$name, serverSlug:$slug, serverRegion:$region) {
      name
      server { slug region { slug } }
      dps:  encounterRankings(encounterID:$encounterID, difficulty:$difficulty, metric:dps,          specName:"Feral")
      boss: encounterRankings(encounterID:$encounterID, difficulty:$difficulty, metric:bossdps,      specName:"Feral")
    }
  }
}
"""

Q_WORLD_RANKINGS = """
query WorldRankings($encounterID:Int!, $difficulty:Int!) {
  worldData {
    encounter(id:$encounterID) {
      characterRankings(specName:"Feral", className:"Druid",
                        metric:dps, difficulty:$difficulty, leaderboard:LogsOnly)
    }
  }
}
"""


Q_COMBATANT = """
query Combatant($code:String!, $fightIDs:[Int]!) {
  reportData { report(code:$code) {
    events(dataType:CombatantInfo, fightIDs:$fightIDs) { data }
  }}
}
"""

Q_DAMAGE = """
query Damage($code:String!, $fightIDs:[Int]!, $sourceID:Int!) {
  reportData { report(code:$code) {
    table(dataType:DamageDone, fightIDs:$fightIDs, sourceID:$sourceID, wipeCutoff:0)
  }}
}
"""

Q_ROTATION = """
query Rotation($code:String!, $fightIDs:[Int]!, $sourceID:Int!) {
  reportData { report(code:$code) {
    casts:   table(dataType:Casts,   fightIDs:$fightIDs, sourceID:$sourceID)
    buffs:   table(dataType:Buffs,   fightIDs:$fightIDs, sourceID:$sourceID)
    debuffs: table(dataType:Debuffs, fightIDs:$fightIDs, sourceID:$sourceID)
  }}
}
"""

# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

TRACKED_ABILITIES = {
    "Tiger's Fury": 5217, "Berserk": 106951, "Incarnation": 102543,
    "Feral Frenzy": 274837, "Frantic Frenzy": 1243807,
    "Convoke the Spirits": 391528,
    "Rip": 1079, "Rake": 1822, "Ferocious Bite": 22568,
    "Primal Wrath": 285381, "Shred": 5221, "Swipe": 106785,
    "Thrash": 106832, "Moonfire": 8921, "Moonfire (LI)": 155625,
    "Brutal Slash": 202028,
}
GUID_TO_NAME = {v: k for k, v in TRACKED_ABILITIES.items()}


def get_feral_event(token, code, fight_id):
    data = gql(token, Q_COMBATANT, {"code": code, "fightIDs": [fight_id]})
    for e in data["reportData"]["report"]["events"]["data"]:
        if e.get("specID") == FERAL_SPEC_ID:
            return e
    return None


def parse_stats(event, name):
    if not event:
        return None
    gear = [g for g in event.get("gear", []) if g.get("itemLevel", 0) >= 50]
    avg_ilvl = round(sum(g["itemLevel"] for g in gear) / len(gear), 1) if gear else 0
    return {
        "name": name,
        "avg_ilvl": avg_ilvl,
        "agility": event.get("agility", 0),
        "crit":    event.get("critMelee", 0),
        "haste":   event.get("hasteMelee", 0),
        "mastery": event.get("mastery", 0),
        "vers":    event.get("versatilityDamageDone", 0),
        "talents": {t["id"]: t.get("rank", 1) for t in event.get("talentTree", [])},
    }


def parse_casts(table, fight_ms):
    dur_m = fight_ms / 60000
    result = {}
    for e in table.get("data", {}).get("entries", []):
        guid  = e.get("guid")
        name  = GUID_TO_NAME.get(guid, e.get("name", f"guid:{guid}"))
        count = e.get("total", 0)
        result[name] = {"casts": count, "per_min": round(count / dur_m, 2)}
    return result


def parse_uptime(table, fight_ms, wanted):
    result = {}
    for e in table.get("data", {}).get("auras", []):
        guid = e.get("guid")
        name = GUID_TO_NAME.get(guid, e.get("name", ""))
        if name not in wanted:
            continue
        uptime = round(e.get("totalUptime", 0) / fight_ms * 100, 1) if fight_ms else 0
        result[name] = {"uptime_pct": uptime, "applications": e.get("totalUses", 0)}
    return result


def summarize_rotation(name, casts, buff_up, debuff_up, fight_ms, dps=None):
    def c(a):  return casts.get(a, {}).get("casts", 0)
    def pm(a): return casts.get(a, {}).get("per_min", 0)
    def up(a, src): return src.get(a, {}).get("uptime_pct", "?")

    frenzy = c("Feral Frenzy") + c("Frantic Frenzy")
    berserk = c("Berserk") + c("Incarnation")
    moonfire = c("Moonfire") + c("Moonfire (LI)")

    return {
        "name": name, "dps": dps, "fight_duration_ms": fight_ms,
        "cooldowns": {
            "Tigers Fury":    {"casts": c("Tiger's Fury"),     "per_min": pm("Tiger's Fury")},
            "Frenzy":         {"casts": frenzy,                "per_min": round(frenzy / (fight_ms/60000), 2)},
            "Berserk":        {"casts": berserk,               "per_min": round(berserk / (fight_ms/60000), 2)},
            "Convoke":        {"casts": c("Convoke the Spirits"), "per_min": pm("Convoke the Spirits")},
        },
        "generators": {
            "Shred":    {"casts": c("Shred"),    "per_min": pm("Shred")},
            "Swipe":    {"casts": c("Swipe"),    "per_min": pm("Swipe")},
            "Moonfire": {"casts": moonfire,      "per_min": round(moonfire / (fight_ms/60000), 2)},
        },
        "finishers": {
            "Rip":            {"casts": c("Rip"),            "per_min": pm("Rip")},
            "Ferocious Bite": {"casts": c("Ferocious Bite"), "per_min": pm("Ferocious Bite")},
            "Primal Wrath":   {"casts": c("Primal Wrath"),   "per_min": pm("Primal Wrath")},
        },
        "uptime": {
            "Tigers Fury %": up("Tiger's Fury", buff_up),
            "Rip %":         up("Rip",          debuff_up),
            "Rake %":        up("Rake",         debuff_up),
        },
    }


def fmt(ms):
    s = ms // 1000
    return f"{s//60}:{s%60:02d}"


# ---------------------------------------------------------------------------
# Per-boss analysis
# ---------------------------------------------------------------------------

def analyze_boss(token, config, encounter_id, encounter_name):
    name   = config["character_name"]
    slug   = config["server_slug"]
    region = config["server_region"]
    diff   = config.get("difficulty", 5)

    print(f"\n{'='*60}")
    print(f"  {encounter_name}")
    print(f"{'='*60}")

    # 1. Character's best parses for this encounter
    print(f"  Fetching {name}'s rankings...")
    char_data = gql(token, Q_CHARACTER_RANKINGS,
                    {"name": name, "slug": slug, "region": region,
                     "encounterID": encounter_id, "difficulty": diff})
    char = char_data["characterData"]["character"]
    if not char:
        print(f"  Character not found: {name} on {slug}-{region}")
        return None

    dps_parses  = char.get("dps",  {}).get("ranks", [])
    boss_parses = char.get("boss", {}).get("ranks", [])

    if not dps_parses:
        print(f"  No Feral parses found for {name} on this boss.")
        return None

    # Pick best overall DPS parse (anchor for report code)
    best          = max(dps_parses,  key=lambda x: x.get("amount", 0))
    best_dps      = round(best["amount"])
    best_kill_ms  = best["duration"]
    best_pct      = round(best.get("rankPercent", 0), 1)
    best_today_pct= round(best.get("todayPercent", 0), 1)
    best_bracket  = best.get("bracketData", 0)
    best_total    = best.get("rankTotalParses", "?")
    best_code     = best["report"]["code"]
    best_fight_id = best["report"]["fightID"]

    # Match boss-DPS parse to same report/fight
    boss_match    = next((p for p in boss_parses if p["report"]["code"] == best_code
                          and p["report"]["fightID"] == best_fight_id), None)
    best_boss_dps = round(boss_match["amount"]) if boss_match else None
    best_boss_pct = round(boss_match.get("rankPercent", 0), 1) if boss_match else None
    best_boss_total = boss_match.get("rankTotalParses", "?") if boss_match else "?"

    print(f"  Best parse : {best_dps} DPS | overall {best_pct}th of {best_total} parses | today {best_today_pct}th")
    print(f"  Boss-only  : {best_boss_dps} DPS | {best_boss_pct}th of {best_boss_total} parses")
    print(f"  Kill time  : {fmt(best_kill_ms)} | ilvl bracket: {best_bracket}")
    print(f"  Report     : {best_code} fight {best_fight_id}")

    bracket_pct = None  # computed below from world rankings

    # 2. Character's own data
    print(f"  Fetching {name}'s damage / rotation / stats...")
    char_event = get_feral_event(token, best_code, best_fight_id)
    if not char_event:
        print(f"  Could not find Feral CombatantInfo for {name}")
        return None
    char_source_id = char_event["sourceID"]

    dmg_data    = gql(token, Q_DAMAGE,    {"code": best_code, "fightIDs": [best_fight_id], "sourceID": char_source_id})
    rot_data    = gql(token, Q_ROTATION,  {"code": best_code, "fightIDs": [best_fight_id], "sourceID": char_source_id})

    char_stats   = parse_stats(char_event, name)
    char_casts   = parse_casts(rot_data["reportData"]["report"]["casts"],   best_kill_ms)
    char_buffs   = parse_uptime(rot_data["reportData"]["report"]["buffs"],  best_kill_ms, {"Tiger's Fury"})
    char_debuffs = parse_uptime(rot_data["reportData"]["report"]["debuffs"],best_kill_ms, {"Rip", "Rake"})
    char_rotation = summarize_rotation(name, char_casts, char_buffs, char_debuffs, best_kill_ms, best_dps)
    char_damage   = dmg_data["reportData"]["report"]["table"]

    # 3. World rankings for similar kill time
    print(f"  Fetching world rankings...")
    world_data = gql(token, Q_WORLD_RANKINGS, {"encounterID": encounter_id, "difficulty": diff})
    all_world  = world_data["worldData"]["encounter"]["characterRankings"].get("rankings", [])

    lo, hi = best_kill_ms * (1 - KILL_TIME_TOLERANCE), best_kill_ms * (1 + KILL_TIME_TOLERANCE)
    similar = [r for r in all_world if lo <= r.get("duration", 0) <= hi]
    top_pool = similar[:TOP_N] if similar else all_world[:TOP_N]

    print(f"  {len(similar)} world parses within ±20% kill time → using top {len(top_pool)}")

    # 4. Top players data
    top_results = []
    for player in top_pool:
        pname  = player.get("name", "?")
        pdps   = round(player.get("amount", 0))
        pkill  = player.get("duration", 0)
        pcode  = player.get("report", {}).get("code")
        pfight = player.get("report", {}).get("fightID")
        if not pcode or not pfight:
            continue

        print(f"  [{pname}] {pdps} DPS {fmt(pkill)} — fetching...")
        event = get_feral_event(token, pcode, pfight)
        if not event:
            print(f"    No Feral CombatantInfo found, skipping.")
            continue
        psource = event["sourceID"]

        prot  = gql(token, Q_ROTATION, {"code": pcode, "fightIDs": [pfight], "sourceID": psource})
        pstats    = parse_stats(event, pname)
        pcasts    = parse_casts(prot["reportData"]["report"]["casts"],    pkill)
        pbuffs    = parse_uptime(prot["reportData"]["report"]["buffs"],   pkill, {"Tiger's Fury"})
        pdebuffs  = parse_uptime(prot["reportData"]["report"]["debuffs"], pkill, {"Rip", "Rake"})
        protation = summarize_rotation(pname, pcasts, pbuffs, pdebuffs, pkill, pdps)
        pstats["dps"]       = pdps
        pstats["kill_time"] = fmt(pkill)

        top_results.append({"stats": pstats, "rotation": protation})

    return {
        "encounter": encounter_name,
        "encounter_id": encounter_id,
        "character": {
            "stats":             char_stats,
            "rotation":          char_rotation,
            "damage_table":      char_damage,
            "dps":               best_dps,
            "boss_dps":          best_boss_dps,
            "kill_time":         fmt(best_kill_ms),
            "overall_pct":       best_pct,
            "overall_pct_of":    best_total,
            "today_pct":         best_today_pct,
            "boss_dps_pct":      best_boss_pct,
            "boss_dps_pct_of":   best_boss_total,
            "bracket":           best_bracket,
        },
        "top_players": top_results,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    with open(CONFIG_FILE, "r") as f:
        config = json.load(f)

    required = ["client_id", "client_secret", "character_name", "server_slug", "server_region"]
    missing  = [k for k in required if not config.get(k) or config[k].startswith("YOUR_")]
    if missing:
        print(f"ERROR: Missing config fields: {missing}")
        print("Edit config.json and fill in all required fields.")
        return

    encounters = config.get("encounters", [])
    if not encounters:
        print("ERROR: No encounters defined in config.json")
        return

    print(f"Authenticating...")
    token = get_access_token(config["client_id"], config["client_secret"])
    print(f"OK — analyzing {config['character_name']} on {config['server_slug']}-{config['server_region']}\n")

    results = []
    for enc in encounters:
        result = analyze_boss(token, config, enc["id"], enc["name"])
        if result:
            results.append(result)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nDone. Full analysis saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
