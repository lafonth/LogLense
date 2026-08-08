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

/**
 * Le percentile historique d'un joueur sur une rencontre, sans les rankings bossdps.
 *
 * `report.rankings` ne rend que le percentile du jour ; le nombre que le raider connaît est
 * le percentile verrouillé (`lockedIn`). Il faut passer par le personnage pour l'obtenir,
 * même quand on part d'un rapport.
 */
export const Q_CHARACTER_PARSE_DPS = `
  query CharacterParseDps(
    $name: String!, $slug: String!, $region: String!,
    $encounterID: Int!, $difficulty: Int!, $specName: String!, $className: String!
  ) {
    characterData {
      character(name: $name, serverSlug: $slug, serverRegion: $region) {
        dps: encounterRankings(
          encounterID: $encounterID, difficulty: $difficulty,
          metric: dps, specName: $specName, className: $className
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

/**
 * `debuffs` n'est pas une faute de frappe : sur une table d'auras d'hostilité `Enemies`, WCL
 * inverse les axes. `sourceID` y désigne l'acteur qui *porte* l'aura — donc un ennemi, et
 * filtrer dessus avec l'id du joueur rend zéro aura, silencieusement. C'est `targetID` qui
 * sélectionne celui qui l'applique. Vérifié sur huit raiders d'un même combat : le résultat
 * est à chaque fois identique à un `filterExpression: "source.name='…'"`.
 *
 * Sans cet alias, toute spec dont les dégâts passent par des DoT voyait son uptime amputé de
 * l'essentiel — la table `Buffs` ne rend que ce que le joueur porte lui-même.
 */
export const Q_ROTATION = `
  query Rotation($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        casts: table(dataType: Casts, fightIDs: $fightIDs, sourceID: $sourceID)
        buffs: table(dataType: Buffs, fightIDs: $fightIDs, sourceID: $sourceID)
        debuffs: table(
          dataType: Debuffs
          fightIDs: $fightIDs
          hostilityType: Enemies
          targetID: $sourceID
        )
      }
    }
  }
`;

/**
 * The opening chain, which the `Casts` *table* cannot give: it aggregates, so the order is
 * lost at the source. `events` keeps it. `limit` is what makes this cheap — the API returns
 * the fight's events from its start, so the first page *is* the opening; no pagination.
 */
export const Q_CAST_EVENTS = `
  query CastEvents($code: String!, $fightIDs: [Int]!, $sourceID: Int!, $limit: Int!) {
    reportData {
      report(code: $code) {
        events(dataType: Casts, fightIDs: $fightIDs, sourceID: $sourceID, limit: $limit) { data }
      }
    }
  }
`;

/**
 * Buffs alone. The verification stage judges a candidate before deciding to keep it, so
 * it must not pay for the casts and damage of the ones it is about to eliminate.
 */
export const Q_BUFFS = `
  query Buffs($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        buffs: table(dataType: Buffs, fightIDs: $fightIDs, sourceID: $sourceID)
      }
    }
  }
`;

/**
 * Le contexte de la pull : qui est mort, et combien de fois le raid a échoué avant.
 *
 * Les deux tiennent dans une seule requête parce qu'elles portent sur le même rapport. La
 * liste des pulls sert deux fois : elle compte les wipes, et elle donne l'instant de départ
 * du combat, sans lequel un instant de mort absolu ne dit rien.
 */
export const Q_FIGHT_CONTEXT = `
  query FightContext($code: String!, $fightIDs: [Int]!, $encounterID: Int!) {
    reportData {
      report(code: $code) {
        deaths: table(dataType: Deaths, fightIDs: $fightIDs)
        fights(encounterID: $encounterID) {
          id
          kill
          startTime
          difficulty
        }
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

// Le classement du raid tient en une requête (spec « mode raid » §5) : les rankings donnent le
// percentile, la table de dégâts sert à la fois de contrôle de couverture et de repli DPS, et
// `masterData` fait le pont entre le nom rendu par les rankings et l'`actorId` du rapport —
// `rankings[].id` est un identifiant global de personnage, pas un acteur de ce rapport.
export const Q_RAID_RANKING = `
  query RaidRanking($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        rankings(fightIDs: $fightIDs, playerMetric: dps)
        table(dataType: DamageDone, fightIDs: $fightIDs)
        events(dataType: CombatantInfo, fightIDs: $fightIDs) { data }
        fights(fightIDs: $fightIDs) {
          id
          name
          encounterID
          kill
          difficulty
          startTime
          endTime
        }
        masterData {
          actors(type: "Player") {
            id
            name
            subType
          }
        }
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
