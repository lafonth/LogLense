import json, sys, requests
sys.stdout.reconfigure(encoding="utf-8")

CONFIG_FILE = "config.json"
TOKEN_URL   = "https://www.warcraftlogs.com/oauth/token"
API_URL     = "https://www.warcraftlogs.com/api/v2/client"

def load_json(p):
    with open(p) as f: return json.load(f)

def get_token(cid, cs):
    r = requests.post(TOKEN_URL, data={"grant_type":"client_credentials"}, auth=(cid,cs))
    r.raise_for_status(); return r.json()["access_token"]

def gql(token, query, variables=None):
    r = requests.post(API_URL,
                      json={"query":query, **({"variables":variables} if variables else {})},
                      headers={"Authorization":f"Bearer {token}"})
    r.raise_for_status()
    result = r.json()
    if "errors" in result: print("GQL errors:", result["errors"])
    return result.get("data", {})

Q = """
query($eid:Int!){
  worldData{ encounter(id:$eid){
    brackets { min max bucket type }
  }}
}
"""

def main():
    config = load_json(CONFIG_FILE)
    token  = get_token(config["client_id"], config["client_secret"])
    for enc in config["encounters"]:
        data = gql(token, Q, {"eid": enc["id"]})
        brackets = data["worldData"]["encounter"]["brackets"]
        print(f"\n{enc['name']}:")
        print(f"  type={brackets.get('type')} bucket={brackets.get('bucket')}")
        print(f"  min={brackets.get('min')} max={brackets.get('max')}")

if __name__ == "__main__":
    main()
