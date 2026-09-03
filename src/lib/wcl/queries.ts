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

/**
 * Le classement mondial, filtré à la source.
 *
 * `bracket` et `externalBuffs` sont **non nullables** et ont chacun leur valeur neutre —
 * `0` et `Any` — mesurées au spike de l'étape 3. C'est ce qui évite la paire de constantes
 * qu'a demandée `$partition` : là-bas, omettre l'argument et lui passer `null` ne sont pas
 * la même chose côté GraphQL et WCL ne documente pas la différence ; ici, « ne pas filtrer »
 * est une valeur du domaine, pas une absence.
 *
 * Les deux filtres **réduisent** la réponse, ils ne l'enrichissent pas : zéro octet de
 * surcoût, à la différence d'`includeCombatantInfo` (facteur 17, refusé par le spike).
 */
export const Q_WORLD_RANKINGS = `
  query WorldRankings(
    $encounterID: Int!, $difficulty: Int!,
    $specName: String!, $className: String!, $page: Int!,
    $bracket: Int!, $externalBuffs: ExternalBuffRankFilter!
  ) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(
          specName: $specName, className: $className,
          metric: dps, difficulty: $difficulty, leaderboard: LogsOnly,
          page: $page, bracket: $bracket, externalBuffs: $externalBuffs
        )
      }
    }
  }
`;

/**
 * Les partitions du palier auquel appartient une rencontre, et les rencontres de ce palier.
 *
 * Passe par `encounter.zone` plutôt que par la liste complète des zones : la réponse tient
 * en un objet au lieu d'un catalogue entier, pour la seule information utile.
 *
 * `encounters { id }` est ce qui rend la réponse réutilisable. Les partitions appartiennent
 * à la zone, pas à la rencontre : sans la liste de ses rencontres, l'analyse d'un rapport de
 * douze boss redemande douze fois la même réponse, parce que rien dans les onze autres appels
 * ne dit qu'ils tomberaient sur la zone déjà résolue. Voir `partitions.ts`.
 *
 * `brackets` voyage avec elles pour la même raison, et sans requête de plus : le découpage
 * d'ilvl appartient à la zone, et c'est lui qui rend `bracket` calculable côté client — les
 * bornes changent de palier en palier, les coder en dur les ferait mentir au suivant.
 */
export const Q_ENCOUNTER_PARTITIONS = `
  query EncounterPartitions($encounterID: Int!) {
    worldData {
      encounter(id: $encounterID) {
        zone {
          id
          encounters { id }
          partitions { id name default }
          brackets { type min max bucket }
        }
      }
    }
  }
`;

/**
 * Le classement mondial restreint à une partition explicite.
 *
 * Jumelle de `Q_WORLD_RANKINGS`, qui reste la voie de repli quand la résolution des
 * partitions échoue. Deux constantes plutôt qu'un `$partition: Int` nullable : passer
 * `null` à un argument optionnel n'équivaut pas à l'omettre côté GraphQL, et WCL ne
 * documente pas ce qu'il en fait.
 */
export const Q_WORLD_RANKINGS_PARTITION = `
  query WorldRankingsPartition(
    $encounterID: Int!, $difficulty: Int!,
    $specName: String!, $className: String!, $page: Int!, $partition: Int!,
    $bracket: Int!, $externalBuffs: ExternalBuffRankFilter!
  ) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(
          specName: $specName, className: $className,
          metric: dps, difficulty: $difficulty, leaderboard: LogsOnly,
          page: $page, partition: $partition,
          bracket: $bracket, externalBuffs: $externalBuffs
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
 * The cast chain, which the `Casts` *table* cannot give: it aggregates, so the order is lost
 * at the source. `events` keeps it.
 *
 * One page, always. Measured on 2026-09-03 (`scripts/probe-cast-timeline.ts`): a 512 s Mythic
 * kill is 502 to 779 cast events, so `CAST_EVENT_LIMIT` holds a whole fight in the single
 * request this query has always cost — the opening was never the cheap part, the absence of
 * pagination was.
 *
 * `nextPageTimestamp` is selected for what its *presence* means, never to follow it: a
 * non-null value says the fight outran the page, and the chain that comes back is a prefix.
 * Following it would turn one request per actor into several, times the reference cohort.
 */
export const Q_CAST_EVENTS = `
  query CastEvents($code: String!, $fightIDs: [Int]!, $sourceID: Int!, $limit: Int!) {
    reportData {
      report(code: $code) {
        events(dataType: Casts, fightIDs: $fightIDs, sourceID: $sourceID, limit: $limit) {
          data
          nextPageTimestamp
        }
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
