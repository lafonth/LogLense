export const Q_ZONES = `
  query Zones {
    worldData {
      zones {
        id
        name
        difficulties { id }
        encounters {
          id
          name
        }
      }
    }
  }
`;

export const Q_CHARACTER_RANKINGS = `
  query CharacterRankings(
    $name: String!, $slug: String!, $region: String!,
    $encounterID: Int!, $difficulty: Int!
  ) {
    characterData {
      character(name: $name, serverSlug: $slug, serverRegion: $region) {
        name
        server { slug region { slug } }
        dps: encounterRankings(
          encounterID: $encounterID, difficulty: $difficulty,
          metric: dps, specName: "Feral"
        )
        boss: encounterRankings(
          encounterID: $encounterID, difficulty: $difficulty,
          metric: bossdps, specName: "Feral"
        )
      }
    }
  }
`;

export const Q_WORLD_RANKINGS = `
  query WorldRankings($encounterID: Int!, $difficulty: Int!) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(
          specName: "Feral", className: "Druid",
          metric: dps, difficulty: $difficulty, leaderboard: LogsOnly
        )
      }
    }
  }
`;

export const Q_COMBATANT = `
  query Combatant($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        events(dataType: CombatantInfo, fightIDs: $fightIDs) { data }
      }
    }
  }
`;

export const Q_DAMAGE = `
  query Damage($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        table(dataType: DamageDone, fightIDs: $fightIDs, sourceID: $sourceID, wipeCutoff: 0)
      }
    }
  }
`;

export const Q_ROTATION = `
  query Rotation($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        casts: table(dataType: Casts, fightIDs: $fightIDs, sourceID: $sourceID)
        buffs: table(dataType: Buffs, fightIDs: $fightIDs, sourceID: $sourceID)
      }
    }
  }
`;
