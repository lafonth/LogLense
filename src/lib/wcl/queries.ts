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
          metric: dps
        )
        boss: encounterRankings(
          encounterID: $encounterID, difficulty: $difficulty,
          metric: bossdps
        )
      }
    }
  }
`;

export const Q_CHARACTER_RANKINGS_SPEC = `
  query CharacterRankingsSpec(
    $name: String!, $slug: String!, $region: String!,
    $encounterID: Int!, $difficulty: Int!, $specName: String!, $className: String!
  ) {
    characterData {
      character(name: $name, serverSlug: $slug, serverRegion: $region) {
        name
        server { slug region { slug } }
        dps: encounterRankings(
          encounterID: $encounterID, difficulty: $difficulty,
          metric: dps, specName: $specName, className: $className
        )
        boss: encounterRankings(
          encounterID: $encounterID, difficulty: $difficulty,
          metric: bossdps, specName: $specName, className: $className
        )
      }
    }
  }
`;

export const Q_COMBATANT_WITH_ACTORS = `
  query CombatantWithActors($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        events(dataType: CombatantInfo, fightIDs: $fightIDs) { data }
        masterData {
          actors { id name type }
        }
      }
    }
  }
`;

export const Q_WORLD_RANKINGS = `
  query WorldRankings(
    $encounterID: Int!, $difficulty: Int!,
    $specName: String!, $className: String!, $page: Int!
  ) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(
          specName: $specName, className: $className,
          metric: dps, difficulty: $difficulty, leaderboard: LogsOnly,
          page: $page
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

export const Q_REPORT_RANKINGS_DPS = `
  query ReportRankingsDPS($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        rankings(fightIDs: $fightIDs, playerMetric: dps)
      }
    }
  }
`;

export const Q_REPORT_RANKINGS_BOSSDPS = `
  query ReportRankingsBossDPS($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        rankings(fightIDs: $fightIDs, playerMetric: bossdps)
      }
    }
  }
`;

export const Q_REPORT_META = `
  query ReportMeta($code: String!) {
    reportData {
      report(code: $code) {
        title
        fights {
          id
          name
          encounterID
          kill
          startTime
          endTime
          difficulty
        }
        masterData {
          actors {
            id
            name
            type
            subType
            server
          }
        }
      }
    }
  }
`;
