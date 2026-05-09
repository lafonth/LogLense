import json
import sys
import requests

sys.stdout.reconfigure(encoding="utf-8")

CONFIG_FILE = "config.json"
TOKEN_URL = "https://www.warcraftlogs.com/oauth/token"
API_URL = "https://www.warcraftlogs.com/api/v2/client"

# The key differing talent IDs we need to identify
TARGET_IDS = [103276, 103308, 103275, 103324, 103326, 103309, 103285]

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

# Try different gameData queries
QUERY_TALENT = """
query TalentLookup($id: Int!) {
  gameData {
    talent(id: $id) {
      id
      name
      spell { id name }
    }
  }
}
"""

QUERY_SPELL = """
query SpellLookup($id: Int!) {
  gameData {
    ability(id: $id) {
      id
      name
    }
  }
}
"""

def main():
    config = load_json(CONFIG_FILE)
    token = get_access_token(config["client_id"], config["client_secret"])

    print("=== Trying gameData.talent ===")
    for tid in TARGET_IDS:
        try:
            result = run_query(token, QUERY_TALENT, {"id": tid})
            talent = result.get("data", {}).get("gameData", {}).get("talent")
            if talent:
                spell_name = talent.get("spell", {}).get("name", "") if talent.get("spell") else ""
                print(f"  {tid}: talent.name={talent.get('name')} | spell={spell_name}")
            else:
                # Fall back to ability query
                result2 = run_query(token, QUERY_SPELL, {"id": tid})
                ability = result2.get("data", {}).get("gameData", {}).get("ability")
                print(f"  {tid}: no talent found | ability={ability.get('name') if ability else 'null'}")
        except Exception as e:
            print(f"  {tid}: error — {e}")

if __name__ == "__main__":
    main()
