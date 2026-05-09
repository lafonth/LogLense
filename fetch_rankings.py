import json
import requests

CONFIG_FILE = "config.json"
REPORT_FILE = "report_data.json"
OUTPUT_FILE = "rankings_data.json"
TOKEN_URL = "https://www.warcraftlogs.com/oauth/token"
API_URL = "https://www.warcraftlogs.com/api/v2/client"

KILL_TIME_TOLERANCE = 0.20  # ±20% of Jumbaa's kill time


def load_config():
    with open(CONFIG_FILE, "r") as f:
        return json.load(f)


def load_report():
    with open(REPORT_FILE, "r", encoding="utf-8") as f:
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


QUERY_RANKINGS = """
query EncounterRankings($encounterID: Int!, $difficulty: Int!) {
  worldData {
    encounter(id: $encounterID) {
      name
      characterRankings(
        specName: "Feral"
        className: "Druid"
        metric: dps
        difficulty: $difficulty
        leaderboard: LogsOnly
      )
    }
  }
}
"""


def format_time(ms):
    seconds = ms // 1000
    m, s = divmod(seconds, 60)
    return f"{m}:{s:02d}"


def fetch_rankings(config, token, report):
    character_name = config.get("character_name", "Jumbaa")
    results = []

    for fight in report["fights"]:
        encounter_id = fight.get("encounter_id")
        difficulty = fight.get("difficulty")
        kill_time_ms = fight.get("kill_time_ms", 0)
        boss_name = fight["fight_name"]

        if not encounter_id:
            print(f"  Skipping {boss_name} — no encounter ID (re-run fetch_logs.py first)")
            continue

        print(f"Fetching top Feral rankings for: {boss_name} (encounterID={encounter_id}, difficulty={difficulty})")

        result = run_query(token, QUERY_RANKINGS, {
            "encounterID": encounter_id,
            "difficulty": difficulty,
        })

        encounter_data = result.get("data", {}).get("worldData", {}).get("encounter", {})
        rankings_blob = encounter_data.get("characterRankings", {})
        all_rankings = rankings_blob.get("rankings", [])

        if not all_rankings:
            print(f"  No rankings returned for {boss_name}")
            continue

        # Filter to similar kill times (±20% of Jumbaa's kill)
        low = kill_time_ms * (1 - KILL_TIME_TOLERANCE)
        high = kill_time_ms * (1 + KILL_TIME_TOLERANCE)
        similar = [r for r in all_rankings if low <= r.get("duration", 0) <= high]

        # Top 10 overall + Jumbaa's entry if present
        top10 = all_rankings[:10]
        jumbaa_entry = next((r for r in all_rankings if r.get("name", "").lower() == character_name.lower()), None)

        print(f"  Jumbaa kill time: {format_time(kill_time_ms)} | Similar kill time window: {format_time(int(low))} – {format_time(int(high))}")
        print(f"  Top 10 overall | {len(similar)} parses in similar kill time window")

        results.append({
            "boss_name": boss_name,
            "encounter_id": encounter_id,
            "difficulty": difficulty,
            "jumbaa_kill_time_ms": kill_time_ms,
            "kill_time_window_ms": {"low": int(low), "high": int(high)},
            "top10_overall": top10,
            "similar_kill_time_parses": similar[:10],
            "jumbaa_global_rank": jumbaa_entry,
        })

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nDone. Rankings saved to: {OUTPUT_FILE}")
    return results


def main():
    config = load_config()
    report = load_report()

    # Check encounter IDs are present
    missing = [f["fight_name"] for f in report["fights"] if not f.get("encounter_id")]
    if missing:
        print("Missing encounter IDs for:", missing)
        print("Please re-run fetch_logs.py first to update report_data.json")
        return

    print("Authenticating with Warcraft Logs API...")
    token = get_access_token(config["client_id"], config["client_secret"])
    print("Authentication successful.\n")

    fetch_rankings(config, token, report)


if __name__ == "__main__":
    main()
