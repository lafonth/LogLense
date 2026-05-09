import json
import sys
import requests

sys.stdout.reconfigure(encoding="utf-8")

CONFIG_FILE = "config.json"
REPORT_FILE = "report_data.json"
RANKINGS_FILE = "rankings_data.json"
OUTPUT_FILE = "stats_comparison.json"
TOKEN_URL = "https://www.warcraftlogs.com/oauth/token"
API_URL = "https://www.warcraftlogs.com/api/v2/client"

FERAL_SPEC_ID = 103
TOP_N_PLAYERS = 5  # how many top players to fetch stats for per boss


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_access_token(client_id, client_secret):
    response = requests.post(
        TOKEN_URL,
        data={"grant_type": "client_credentials"},
        auth=(client_id, client_secret),
    )
    response.raise_for_status()
    return response.json()["access_token"]


def run_query(token, query, variables=None):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    response = requests.post(API_URL, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()


QUERY_COMBATANT_INFO = """
query CombatantInfo($code: String!, $fightIDs: [Int]!) {
  reportData {
    report(code: $code) {
      events(
        dataType: CombatantInfo
        fightIDs: $fightIDs
      ) {
        data
      }
    }
  }
}
"""


def extract_feral_event(events):
    for event in events:
        if event.get("specID") == FERAL_SPEC_ID:
            return event
    return None


def calc_avg_ilvl(gear):
    if not gear:
        return 0
    # Exclude cosmetic slots (shirt/tabard with ilvl ~1) and empty slots
    levels = [item.get("itemLevel", 0) for item in gear if item.get("itemLevel", 0) >= 50]
    return round(sum(levels) / len(levels), 1) if levels else 0


def parse_stats(event, player_name):
    if not event:
        return None
    gear = event.get("gear", [])
    return {
        "name": player_name,
        "avg_ilvl": calc_avg_ilvl(gear),
        "agility": event.get("agility", 0),
        "crit_rating": event.get("critMelee", 0),
        "haste_rating": event.get("hasteMelee", 0),
        "mastery_rating": event.get("mastery", 0),
        "vers_rating": event.get("versatility", 0),
    }


def fetch_stats_for(token, report_code, fight_id, player_name):
    result = run_query(token, QUERY_COMBATANT_INFO, {
        "code": report_code,
        "fightIDs": [fight_id],
    })
    events = result.get("data", {}).get("reportData", {}).get("report", {}).get("events", {}).get("data", [])
    feral_event = extract_feral_event(events)
    return parse_stats(feral_event, player_name)


def format_time(ms):
    seconds = ms // 1000
    m, s = divmod(seconds, 60)
    return f"{m}:{s:02d}"


def main():
    config = load_json(CONFIG_FILE)
    report = load_json(REPORT_FILE)
    rankings = load_json(RANKINGS_FILE)

    character_name = config.get("character_name", "Jumbaa")
    report_code = report["report_code"]

    print("Authenticating with Warcraft Logs API...")
    token = get_access_token(config["client_id"], config["client_secret"])
    print("Authentication successful.\n")

    # Build a lookup: boss name -> fight data from report
    fight_by_name = {f["fight_name"]: f for f in report["fights"]}

    results = []

    for boss_ranking in rankings:
        boss_name = boss_ranking["boss_name"]
        fight = fight_by_name.get(boss_name)
        if not fight:
            continue

        fight_id = fight["fight_id"]
        kill_time_ms = fight["kill_time_ms"]

        print(f"--- {boss_name} (kill time: {format_time(kill_time_ms)}) ---")

        # Fetch Jumbaa's stats
        print(f"  Fetching stats for {character_name}...")
        jumbaa_stats = fetch_stats_for(token, report_code, fight_id, character_name)
        if jumbaa_stats:
            print(f"    ilvl={jumbaa_stats['avg_ilvl']} | agi={jumbaa_stats['agility']} | "
                  f"crit={jumbaa_stats['crit_rating']} | haste={jumbaa_stats['haste_rating']} | "
                  f"mastery={jumbaa_stats['mastery_rating']} | vers={jumbaa_stats['vers_rating']}")
        else:
            print(f"    Could not find Feral CombatantInfo for {character_name}")

        # Fetch stats for top N similar-kill-time players (fallback to overall top10)
        candidates = boss_ranking.get("similar_kill_time_parses") or boss_ranking.get("top10_overall", [])
        top_players = candidates[:TOP_N_PLAYERS]
        top_stats = []

        for player in top_players:
            pname = player.get("name", "Unknown")
            preport = player.get("report", {})
            pcode = preport.get("code")
            pfight = preport.get("fightID")
            pdps = round(player.get("amount", 0))
            pkill = format_time(player.get("duration", 0))

            if not pcode or not pfight:
                continue

            print(f"  Fetching stats for {pname} ({pdps} DPS, {pkill})...")
            stats = fetch_stats_for(token, pcode, pfight, pname)
            if stats:
                stats["dps"] = pdps
                stats["kill_time"] = pkill
                top_stats.append(stats)
                print(f"    ilvl={stats['avg_ilvl']} | agi={stats['agility']} | "
                      f"crit={stats['crit_rating']} | haste={stats['haste_rating']} | "
                      f"mastery={stats['mastery_rating']} | vers={stats['vers_rating']}")
            else:
                print(f"    No Feral CombatantInfo found for {pname}")

        results.append({
            "boss_name": boss_name,
            "kill_time": format_time(kill_time_ms),
            "jumbaa": jumbaa_stats,
            "top_players": top_stats,
        })
        print()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"Stats comparison saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
