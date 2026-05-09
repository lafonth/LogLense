import json
import sys
import requests

sys.stdout.reconfigure(encoding="utf-8")

CONFIG_FILE = "config.json"
REPORT_FILE = "report_data.json"
RANKINGS_FILE = "rankings_data.json"
OUTPUT_FILE = "rotation_comparison.json"
TOKEN_URL = "https://www.warcraftlogs.com/oauth/token"
API_URL = "https://www.warcraftlogs.com/api/v2/client"

FERAL_SPEC_ID = 103
TOP_N = 3  # compare against top N players per boss

# Key Feral Druid ability GUIDs
ABILITIES = {
    "Tiger's Fury":    5217,
    "Berserk":         106951,
    "Incarnation":     102543,
    "Feral Frenzy":    274837,
    "Rip":             1079,
    "Rake":            1822,
    "Ferocious Bite":  22568,
    "Shred":           5221,
    "Primal Wrath":    285381,
    "Swipe":           106785,
    "Thrash":          106832,
    "Moonfire":        155625,
    "Brutal Slash":    202028,
}
ABILITY_GUID_TO_NAME = {v: k for k, v in ABILITIES.items()}


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_access_token(client_id, client_secret):
    response = requests.post(TOKEN_URL, data={"grant_type": "client_credentials"}, auth=(client_id, client_secret))
    response.raise_for_status()
    return response.json()["access_token"]


def run_query(token, query, variables=None):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    r = requests.post(API_URL, json=payload, headers=headers)
    r.raise_for_status()
    return r.json()


QUERY_TABLES = """
query RotationTables($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
  reportData {
    report(code: $code) {
      casts:  table(dataType: Casts,   fightIDs: $fightIDs, sourceID: $sourceID)
      buffs:  table(dataType: Buffs,   fightIDs: $fightIDs, sourceID: $sourceID)
      debuffs: table(dataType: Debuffs, fightIDs: $fightIDs, sourceID: $sourceID)
    }
  }
}
"""

QUERY_COMBATANT = """
query CombatantInfo($code: String!, $fightIDs: [Int]!) {
  reportData {
    report(code: $code) {
      events(dataType: CombatantInfo, fightIDs: $fightIDs) { data }
    }
  }
}
"""


def get_feral_source_id(token, code, fight_id):
    result = run_query(token, QUERY_COMBATANT, {"code": code, "fightIDs": [fight_id]})
    events = result["data"]["reportData"]["report"]["events"]["data"]
    for e in events:
        if e.get("specID") == FERAL_SPEC_ID:
            return e.get("sourceID")
    return None


def fetch_rotation_tables(token, code, fight_id, source_id):
    result = run_query(token, QUERY_TABLES, {"code": code, "fightIDs": [fight_id], "sourceID": source_id})
    report = result["data"]["reportData"]["report"]
    return report["casts"], report["buffs"], report["debuffs"]


def parse_casts(casts_table, fight_duration_ms):
    entries = casts_table.get("data", {}).get("entries", [])
    duration_s = fight_duration_ms / 1000
    result = {}
    for entry in entries:
        guid = entry.get("guid")
        name = ABILITY_GUID_TO_NAME.get(guid, entry.get("name", f"guid:{guid}"))
        count = entry.get("total", 0)
        result[name] = {
            "casts": count,
            "per_minute": round(count / (duration_s / 60), 2) if duration_s > 0 else 0,
        }
    return result


def parse_uptime(table, fight_duration_ms, ability_names):
    entries = table.get("data", {}).get("auras", [])
    duration_s = fight_duration_ms / 1000
    result = {}
    for entry in entries:
        guid = entry.get("guid")
        name = ABILITY_GUID_TO_NAME.get(guid, entry.get("name", ""))
        if name not in ability_names:
            continue
        total_uptime = entry.get("totalUptime", 0)
        uptime_pct = round((total_uptime / fight_duration_ms) * 100, 1) if fight_duration_ms > 0 else 0
        result[name] = {
            "uptime_pct": uptime_pct,
            "applications": entry.get("totalUses", 0),
        }
    return result


def format_time(ms):
    s = ms // 1000
    return f"{s // 60}:{s % 60:02d}"


def summarize_player(name, casts, buff_uptime, debuff_uptime, fight_ms, dps=None):
    duration_m = fight_ms / 60000

    def c(ability):
        return casts.get(ability, {}).get("casts", 0)

    def ppm(ability):
        return casts.get(ability, {}).get("per_minute", 0)

    def uptime(ability, source):
        return source.get(ability, {}).get("uptime_pct", "?")

    berserk = c("Berserk") + c("Incarnation")

    return {
        "name": name,
        "dps": dps,
        "fight_duration": format_time(fight_ms),
        "cooldowns": {
            "Tigers Fury":   {"casts": c("Tiger's Fury"),  "per_min": ppm("Tiger's Fury")},
            "Berserk_Incarn":{"casts": berserk,            "per_min": round(berserk / duration_m, 2)},
            "Feral Frenzy":  {"casts": c("Feral Frenzy"),  "per_min": ppm("Feral Frenzy")},
        },
        "generators": {
            "Shred":   {"casts": c("Shred"),   "per_min": ppm("Shred")},
            "Swipe":   {"casts": c("Swipe"),   "per_min": ppm("Swipe")},
            "Thrash":  {"casts": c("Thrash"),  "per_min": ppm("Thrash")},
            "Moonfire":{"casts": c("Moonfire"),"per_min": ppm("Moonfire")},
        },
        "finishers": {
            "Rip":            {"casts": c("Rip"),            "per_min": ppm("Rip")},
            "Ferocious Bite": {"casts": c("Ferocious Bite"), "per_min": ppm("Ferocious Bite")},
            "Primal Wrath":   {"casts": c("Primal Wrath"),   "per_min": ppm("Primal Wrath")},
        },
        "uptime": {
            "Tigers Fury uptime %": uptime("Tiger's Fury", buff_uptime),
            "Rip uptime %":         uptime("Rip",          debuff_uptime),
            "Rake uptime %":        uptime("Rake",          debuff_uptime),
        },
    }


def main():
    config = load_json(CONFIG_FILE)
    report = load_json(REPORT_FILE)
    rankings = load_json(RANKINGS_FILE)

    character_name = config.get("character_name", "Jumbaa")
    report_code = report["report_code"]
    fight_by_name = {f["fight_name"]: f for f in report["fights"]}

    print("Authenticating...")
    token = get_access_token(config["client_id"], config["client_secret"])
    print("OK\n")

    all_results = []

    for boss_ranking in rankings:
        boss_name = boss_ranking["boss_name"]
        fight = fight_by_name.get(boss_name)
        if not fight:
            continue

        fight_id = fight["fight_id"]
        kill_ms = fight["kill_time_ms"]
        jumbaa_source = fight_by_name[boss_name]["fight_id"]  # already known

        print(f"=== {boss_name} ({format_time(kill_ms)}) ===")

        # --- Jumbaa ---
        print(f"  [{character_name}] fetching rotation tables...")
        jumbaa_casts, jumbaa_buffs, jumbaa_debuffs = fetch_rotation_tables(
            token, report_code, fight_id, report["player"]["id"]
        )
        jumbaa_summary = summarize_player(
            character_name,
            parse_casts(jumbaa_casts, kill_ms),
            parse_uptime(jumbaa_buffs, kill_ms, {"Tiger's Fury"}),
            parse_uptime(jumbaa_debuffs, kill_ms, {"Rip", "Rake"}),
            kill_ms,
        )

        # --- Top players ---
        candidates = boss_ranking.get("similar_kill_time_parses") or boss_ranking.get("top10_overall", [])
        top_summaries = []

        for player in candidates[:TOP_N]:
            pname = player.get("name", "?")
            pdps  = round(player.get("amount", 0))
            pkill = player.get("duration", 0)
            pcode = player.get("report", {}).get("code")
            pfight = player.get("report", {}).get("fightID")

            if not pcode or not pfight:
                continue

            print(f"  [{pname}] finding actor ID...")
            psource = get_feral_source_id(token, pcode, pfight)
            if not psource:
                print(f"    Could not find Feral actor in {pname}'s report, skipping.")
                continue

            print(f"  [{pname}] fetching rotation tables...")
            pcasts, pbuffs, pdebuffs = fetch_rotation_tables(token, pcode, pfight, psource)
            summary = summarize_player(
                pname,
                parse_casts(pcasts, pkill),
                parse_uptime(pbuffs, pkill, {"Tiger's Fury"}),
                parse_uptime(pdebuffs, pkill, {"Rip", "Rake"}),
                pkill,
                dps=pdps,
            )
            top_summaries.append(summary)

        all_results.append({
            "boss": boss_name,
            "jumbaa": jumbaa_summary,
            "top_players": top_summaries,
        })
        print()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)

    print(f"Saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
