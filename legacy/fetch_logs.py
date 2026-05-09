import json
import os
import requests

CONFIG_FILE = "config.json"
OUTPUT_FILE = "report_data.json"
TOKEN_URL = "https://www.warcraftlogs.com/oauth/token"
API_URL = "https://www.warcraftlogs.com/api/v2/client"


def load_config():
    with open(CONFIG_FILE, "r") as f:
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


# Step 1: fetch report metadata and fight list
QUERY_REPORT_META = """
query ReportMeta($code: String!) {
  reportData {
    report(code: $code) {
      title
      startTime
      endTime
      region { slug }
      guild { name }
      fights(killType: Kills) {
        id
        name
        encounterID
        startTime
        endTime
        kill
        difficulty
        friendlyPlayers
      }
      masterData {
        actors(type: "Player") {
          id
          name
          type
          subType
        }
      }
    }
  }
}
"""

# Step 2: fetch damage-done ability breakdown for a specific fight and source
QUERY_DAMAGE_TABLE = """
query DamageTable($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
  reportData {
    report(code: $code) {
      table(
        dataType: DamageDone
        fightIDs: $fightIDs
        sourceID: $sourceID
        wipeCutoff: 0
      )
    }
  }
}
"""


def find_player(actors, name):
    for actor in actors:
        if actor.get("type") == "Player" and actor.get("name", "").lower() == name.lower():
            return actor
    return None


def fetch_report(config, token):
    code = config["report_code"]

    print(f"Fetching report metadata for: {code}")
    meta_result = run_query(token, QUERY_REPORT_META, {"code": code})

    report = meta_result["data"]["reportData"]["report"]
    actors = report["masterData"]["actors"]
    fights = report["fights"]


    character_name = config.get("character_name", "")
    player = find_player(actors, character_name)
    if not player:
        print(f"Player '{character_name}' not found. Available players:")
        for actor in actors:
            if actor.get("type") == "Player":
                print(f"  {actor['name']} ({actor.get('subType')})")
        return None

    print(f"Found player: {player['name']} ({player.get('subType')}) — actor ID: {player['id']}")
    print(f"Found {len(fights)} boss kills.")

    damage_by_fight = []
    for fight in fights:
        print(f"  Fetching damage table for: {fight['name']} (fight ID: {fight['id']})")
        dmg_result = run_query(
            token,
            QUERY_DAMAGE_TABLE,
            {
                "code": code,
                "fightIDs": [fight["id"]],
                "sourceID": player["id"],
            },
        )
        table = dmg_result["data"]["reportData"]["report"]["table"]
        kill_time_ms = fight["endTime"] - fight["startTime"]
        damage_by_fight.append(
            {
                "fight_id": fight["id"],
                "fight_name": fight["name"],
                "encounter_id": fight.get("encounterID"),
                "difficulty": fight.get("difficulty"),
                "kill": fight.get("kill"),
                "kill_time_ms": kill_time_ms,
                "damage_table": table,
            }
        )

    output = {
        "report_code": code,
        "report_title": report.get("title"),
        "region": report.get("region", {}).get("slug"),
        "guild": report.get("guild", {}).get("name"),
        "player": player,
        "fights": damage_by_fight,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nDone. Data saved to: {OUTPUT_FILE}")
    return output


def main():
    config = load_config()

    if config["client_id"] == "YOUR_CLIENT_ID_HERE":
        print("ERROR: Please fill in your client_id and client_secret in config.json")
        print("Get your credentials at: https://www.warcraftlogs.com/api/clients/")
        return

    print("Authenticating with Warcraft Logs API...")
    token = get_access_token(config["client_id"], config["client_secret"])
    print("Authentication successful.")

    fetch_report(config, token)


if __name__ == "__main__":
    main()
