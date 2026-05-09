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
    r = requests.post(API_URL, json={"query":query,**({"variables":variables} if variables else {})},
                      headers={"Authorization":f"Bearer {token}"})
    r.raise_for_status(); return r.json()["data"]

Q = """
query($name:String!,$slug:String!,$region:String!,$eid:Int!,$diff:Int!){
  characterData{character(name:$name,serverSlug:$slug,serverRegion:$region){
    encounterRankings(encounterID:$eid,difficulty:$diff,metric:dps,specName:"Feral")
  }}
}
"""

def main():
    config = load_json(CONFIG_FILE)
    token  = get_token(config["client_id"], config["client_secret"])
    enc    = config["encounters"][0]

    data = gql(token, Q, {"name":config["character_name"],"slug":config["server_slug"],
                          "region":config["server_region"],"eid":enc["id"],"diff":config["difficulty"]})
    blob  = data["characterData"]["character"]["encounterRankings"]
    ranks = blob.get("ranks", [])

    if not ranks:
        print("No ranks found"); return

    print("=== Fields available on first rank entry ===")
    first = ranks[0]
    for k,v in first.items():
        print(f"  {k}: {v}")

    print(f"\n=== Top-level fields in encounterRankings blob ===")
    for k,v in blob.items():
        if k != "ranks":
            print(f"  {k}: {v}")

if __name__ == "__main__":
    main()
