import json
import sys
import requests

sys.stdout.reconfigure(encoding="utf-8")

CONFIG_FILE = "config.json"
REPORT_FILE = "report_data.json"
TOKEN_URL = "https://www.warcraftlogs.com/oauth/token"
API_URL = "https://www.warcraftlogs.com/api/v2/client"
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
    response = requests.post(API_URL, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()

QUERY = """
query CombatantInfo($code: String!, $fightIDs: [Int]!) {
  reportData {
    report(code: $code) {
      events(dataType: CombatantInfo, fightIDs: $fightIDs) {
        data
      }
    }
  }
}
"""

def main():
    config = load_json(CONFIG_FILE)
    report = load_json(REPORT_FILE)

    token = get_access_token(config["client_id"], config["client_secret"])

    # Use first fight
    fight = report["fights"][0]
    fight_id = fight["fight_id"]
    print(f"Inspecting CombatantInfo for fight: {fight['fight_name']} (ID: {fight_id})\n")

    result = run_query(token, QUERY, {"code": report["report_code"], "fightIDs": [fight_id]})
    events = result["data"]["reportData"]["report"]["events"]["data"]

    # Find Jumbaa's event
    jumbaa_event = None
    for event in events:
        if event.get("specID") == FERAL_SPEC_ID:
            jumbaa_event = event
            break

    if not jumbaa_event:
        print("No Feral event found. All events:")
        for e in events:
            print(f"  sourceID={e.get('sourceID')} specID={e.get('specID')}")
        return

    print("=== Raw CombatantInfo event (top-level fields) ===")
    for k, v in jumbaa_event.items():
        if k != "gear":
            print(f"  {k}: {v}")

    print(f"\n=== Gear ({len(jumbaa_event.get('gear', []))} items) ===")
    for i, item in enumerate(jumbaa_event.get("gear", [])):
        print(f"  slot {i:2d}: {item}")

if __name__ == "__main__":
    main()
