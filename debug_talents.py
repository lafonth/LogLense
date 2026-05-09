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
    r = requests.post(TOKEN_URL, data={"grant_type": "client_credentials"}, auth=(client_id, client_secret))
    r.raise_for_status()
    return r.json()["access_token"]

def run_query(token, query, variables=None):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    r = requests.post(API_URL, json=payload, headers=headers)
    r.raise_for_status()
    return r.json()

# playerDetails gives us talents with human-readable names
QUERY_PLAYER_DETAILS = """
query PlayerDetails($code: String!, $fightIDs: [Int]!) {
  reportData {
    report(code: $code) {
      playerDetails(fightIDs: $fightIDs)
    }
  }
}
"""

def extract_feral_talents(player_details_blob):
    try:
        data = player_details_blob if isinstance(player_details_blob, dict) else json.loads(player_details_blob)
        for category in ["dps", "healers", "tanks"]:
            for player in data.get("playerDetails", {}).get(category, []):
                if player.get("specs") and any(s.get("spec") == "Feral" for s in player["specs"]):
                    talents = player.get("talents", [])
                    combatant_info = player.get("combatantInfo", {})
                    talent_tree = combatant_info.get("talentTree", [])
                    return player["name"], talents, talent_tree
    except Exception as e:
        print(f"  Parse error: {e}")
    return None, [], []

def main():
    config = load_json(CONFIG_FILE)
    report = load_json(REPORT_FILE)
    token = get_access_token(config["client_id"], config["client_secret"])

    # Use first fight
    fight = report["fights"][0]
    print(f"Fetching playerDetails for: {fight['fight_name']}\n")

    result = run_query(token, QUERY_PLAYER_DETAILS, {
        "code": report["report_code"],
        "fightIDs": [fight["fight_id"]]
    })

    blob = result["data"]["reportData"]["report"]["playerDetails"]
    name, talents, talent_tree = extract_feral_talents(blob)

    if name:
        print(f"Player: {name}")
        print(f"\n=== talents array ({len(talents)} entries) ===")
        for t in talents[:10]:
            print(f"  {t}")
        print(f"\n=== talentTree array (first 10 of {len(talent_tree)}) ===")
        for t in talent_tree[:10]:
            print(f"  {t}")
    else:
        print("Could not find Feral player. Raw blob structure:")
        if isinstance(blob, str):
            parsed = json.loads(blob)
        else:
            parsed = blob
        print(json.dumps(parsed, indent=2)[:3000])

if __name__ == "__main__":
    main()
