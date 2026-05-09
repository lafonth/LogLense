import json
import sys
import requests

sys.stdout.reconfigure(encoding="utf-8")

CONFIG_FILE = "config.json"
REPORT_FILE = "report_data.json"
TOKEN_URL = "https://www.warcraftlogs.com/oauth/token"
API_URL = "https://www.warcraftlogs.com/api/v2/client"

FIGHT_NAME = "Imperator Averzian"
COMPARE_CODE = "6WqmNQkDhBcnGA8R"
COMPARE_FIGHT_ID = 4
COMPARE_NAME = "Catsavage"
FERAL_SPEC_ID = 103

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

QUERY_CASTS = """
query CastsTable($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
  reportData {
    report(code: $code) {
      table(dataType: Casts, fightIDs: $fightIDs, sourceID: $sourceID)
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
    for e in result["data"]["reportData"]["report"]["events"]["data"]:
        if e.get("specID") == FERAL_SPEC_ID:
            return e["sourceID"]
    return None

def fetch_casts(token, code, fight_id, source_id):
    result = run_query(token, QUERY_CASTS, {"code": code, "fightIDs": [fight_id], "sourceID": source_id})
    entries = result["data"]["reportData"]["report"]["table"]["data"]["entries"]
    return {e["name"]: e.get("total", 0) for e in entries}

def main():
    config = load_json(CONFIG_FILE)
    report = load_json(REPORT_FILE)
    token = get_access_token(config["client_id"], config["client_secret"])

    fight = next(f for f in report["fights"] if f["fight_name"] == FIGHT_NAME)
    jumbaa_casts = fetch_casts(token, report["report_code"], fight["fight_id"], report["player"]["id"])

    print(f"Finding {COMPARE_NAME}'s actor ID...")
    compare_source = get_feral_source_id(token, COMPARE_CODE, COMPARE_FIGHT_ID)
    compare_casts = fetch_casts(token, COMPARE_CODE, COMPARE_FIGHT_ID, compare_source)

    # Merge all ability names
    all_abilities = sorted(set(list(jumbaa_casts.keys()) + list(compare_casts.keys())))

    print(f"\n{'Ability':<40} {'Jumbaa':>8}  {COMPARE_NAME:>12}  {'Diff':>8}")
    print("-" * 75)
    for name in all_abilities:
        j = jumbaa_casts.get(name, 0)
        c = compare_casts.get(name, 0)
        diff = j - c
        marker = " <--" if abs(diff) >= 5 else ""
        print(f"{name:<40} {j:>8}  {c:>12}  {diff:>+8}{marker}")

if __name__ == "__main__":
    main()
