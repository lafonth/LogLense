import json
import sys
import requests

sys.stdout.reconfigure(encoding="utf-8")

CONFIG_FILE = "config.json"
REPORT_FILE = "report_data.json"
RANKINGS_FILE = "rankings_data.json"
OUTPUT_FILE = "talent_comparison.json"
TOKEN_URL = "https://www.warcraftlogs.com/oauth/token"
API_URL = "https://www.warcraftlogs.com/api/v2/client"
FERAL_SPEC_ID = 103
TOP_N = 3


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


QUERY_COMBATANT = """
query CombatantInfo($code: String!, $fightIDs: [Int]!) {
  reportData {
    report(code: $code) {
      events(dataType: CombatantInfo, fightIDs: $fightIDs) { data }
    }
  }
}
"""

QUERY_ABILITY_NAME = """
query AbilityName($id: Int!) {
  gameData {
    ability(id: $id) {
      name
    }
  }
}
"""


def get_feral_event(token, code, fight_id):
    result = run_query(token, QUERY_COMBATANT, {"code": code, "fightIDs": [fight_id]})
    for e in result["data"]["reportData"]["report"]["events"]["data"]:
        if e.get("specID") == FERAL_SPEC_ID:
            return e
    return None


def get_talent_ids(event):
    return {t["id"]: t.get("rank", 1) for t in event.get("talentTree", [])}


def resolve_names(token, ids, cache):
    for spell_id in ids:
        if spell_id not in cache:
            try:
                result = run_query(token, QUERY_ABILITY_NAME, {"id": spell_id})
                name = result["data"]["gameData"]["ability"]["name"]
                cache[spell_id] = name if name else f"spell:{spell_id}"
            except Exception:
                cache[spell_id] = f"spell:{spell_id}"
    return cache


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

    name_cache = {}
    results = []

    for boss_ranking in rankings:
        boss_name = boss_ranking["boss_name"]
        fight = fight_by_name.get(boss_name)
        if not fight:
            continue

        print(f"=== {boss_name} ===")

        # Jumbaa
        jumbaa_event = get_feral_event(token, report_code, fight["fight_id"])
        jumbaa_talents = get_talent_ids(jumbaa_event) if jumbaa_event else {}

        # Top players
        candidates = boss_ranking.get("similar_kill_time_parses") or boss_ranking.get("top10_overall", [])
        top_builds = []

        for player in candidates[:TOP_N]:
            pname = player.get("name", "?")
            pcode = player.get("report", {}).get("code")
            pfight = player.get("report", {}).get("fightID")
            if not pcode or not pfight:
                continue
            print(f"  Fetching talents for {pname}...")
            event = get_feral_event(token, pcode, pfight)
            if event:
                top_builds.append({"name": pname, "dps": round(player.get("amount", 0)), "talents": get_talent_ids(event)})

        if not top_builds:
            continue

        # Find differences: talents Jumbaa has but top players don't (and vice versa)
        # Use majority vote: a talent "top players use" if >= 2 out of 3 have it
        top_talent_counts = {}
        for build in top_builds:
            for tid, rank in build["talents"].items():
                if tid not in top_talent_counts:
                    top_talent_counts[tid] = {"count": 0, "rank": rank}
                top_talent_counts[tid]["count"] += 1

        majority = {tid for tid, v in top_talent_counts.items() if v["count"] >= 2}
        jumbaa_set = set(jumbaa_talents.keys())

        only_jumbaa = jumbaa_set - majority      # Jumbaa has, top players don't
        only_top    = majority - jumbaa_set      # Top players have, Jumbaa doesn't

        # Resolve names for differing talents only
        diff_ids = only_jumbaa | only_top
        print(f"  Resolving {len(diff_ids)} differing talent names...")
        name_cache = resolve_names(token, diff_ids, name_cache)

        boss_result = {
            "boss": boss_name,
            "jumbaa_unique": [{"id": tid, "name": name_cache.get(tid, str(tid)), "rank": jumbaa_talents[tid]} for tid in sorted(only_jumbaa)],
            "top_players_unique": [{"id": tid, "name": name_cache.get(tid, str(tid)), "rank": top_talent_counts[tid]["rank"]} for tid in sorted(only_top)],
            "top_players": [b["name"] for b in top_builds],
        }
        results.append(boss_result)

        print(f"  Jumbaa-only talents: {len(only_jumbaa)} | Top-only talents: {len(only_top)}")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nSaved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
