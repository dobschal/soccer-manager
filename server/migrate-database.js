import { query } from './lib/database.js'
import { randomItem } from '../client/lib/randomItem.js'
import { EMBLEM_COLORS, EMBLEM_PATTERNS, EMBLEM_SHAPES } from '../client/util/emblemGenerator.js'

/**
 * @typedef {object} Migration
 * @property {string} name
 * @property {() => Promise} run
 */

/**
 * @type {Array<Migration>}
 */
const migrations = [{
  name: 'Create Stadium Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS stadium
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        team_id BIGINT
                 (
                     20
                 ),

        north_stand_price INT,
        south_stand_price INT,
        west_stand_price INT,
        east_stand_price INT,

        north_stand_size INT,
        south_stand_size INT,
        west_stand_size INT,
        east_stand_size INT,

        north_stand_roof TINYINT
                 (
                     1
                 ),
        south_stand_roof TINYINT
                 (
                     1
                 ),
        west_stand_roof TINYINT
                 (
                     1
                 ),
        east_stand_roof TINYINT
                 (
                     1
                 ),

        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Sponsor Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS sponsor
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        team_id BIGINT
                 (
                     20
                 ),
        start_season INT,
        start_game_day INT,
        duration INT,
        value INT,
        name VARCHAR
                 (
                     255
                 ),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Card Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS action_card
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT
                 (
                     20
                 ),
        action VARCHAR
                 (
                     255
                 ),
        played TINYINT
                 (
                     1
                 ),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create User Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS user
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        username VARCHAR
                 (
                     255
                 ) NOT NULL UNIQUE ,
        password VARCHAR
                 (
                     255
                 ) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Team Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS team
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT
                 (
                     20
                 ),
        name VARCHAR
                 (
                     255
                 ),
        formation VARCHAR
                 (
                     255
                 ),
        level INT,
        balance INT,
        league INT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Player Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS player
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        team_id BIGINT
                 (
                     20
                 ),
        name VARCHAR
                 (
                     255
                 ),
        position VARCHAR
                 (
                     255
                 ),
        in_game_position VARCHAR
                 (
                     255
                 ),
        carrier_start_season INT,
        carrier_end_season INT,
        level INT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Game Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS game
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        season INT,
        game_day INT,
        level INT,
        league INT,
        team_1_id BIGINT
                 (
                     20
                 ),
        team_2_id BIGINT
                 (
                     20
                 ),
        played TINYINT
                 (
                     1
                 ),
        details LONGTEXT,
        goals_team_1 INT,
        goals_team_2 INT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Finance Log Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS finance_log
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        season INT,
        game_day INT,
        value INT,
        balance INT,
        team_id BIGINT
                 (
                     20
                 ),
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Trade Offer Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS trade_offer
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        offer_value INT,
        type VARCHAR
                 (
                     255
                 ),
        player_id BIGINT
                 (
                     20
                 ),
        from_team_id BIGINT
                 (
                     20
                 ),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Have Action Cards on Team and not on Users',
  async run () {
    /** @type {ActionCardType[]} */
    const actionCards = await query('SELECT * FROM action_card')
    await query('ALTER TABLE action_card DROP COLUMN user_id;')
    await query('ALTER TABLE action_card ADD COLUMN team_id BIGINT(20);')
    for (const actionCard of actionCards) {
      /** @type {TeamType[]} */
      const [team] = await query('SELECT * FROM team WHERE user_id=? LIMIT 1', [actionCard.user_id])
      await query('UPDATE action_card SET team_id=? WHERE id=?', [team.id, actionCard.user_id])
    }
  }
}, {
  name: 'Add news table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS news
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        game_day INT,
        season INT,
        message TEXT,
        team_id BIGINT
                 (
                     20
                 ),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Alter table player to have freshness',
  async run () {
    await query('ALTER TABLE player ADD COLUMN freshness DECIMAL(6, 2) DEFAULT 1.0;')
  }
}, {
  name: 'Alter table team to have color',
  async run () {
    await query('ALTER TABLE team ADD COLUMN color VARCHAR(255) DEFAULT "#00d9ff";')
  }
}, {
  name: 'Add Trade History table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS trade_history
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        game_day INT,
        season INT,
        player_id BIGINT,
        from_team_id BIGINT
                 (
                     20
                 ),
        to_team_id BIGINT
                 (
                     20
                 ),
        price INT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Alter table player to have hair color',
  async run () {
    await query('ALTER TABLE player ADD COLUMN hair_color INT;')
    const players = await query('SELECT * FROM player')
    const promises = []
    for (const player of players) {
      player.hair_color = Math.floor(Math.random() * 7)
      promises.push(query('UPDATE player SET hair_color=? WHERE id=?', [player.hair_color, player.id]))
    }
    await Promise.all(promises)
  }
}, {
  name: 'Give bot teams random colors',
  async run () {
    const chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f']
    const teams = await query('SELECT * FROM team WHERE user_id IS NULL')
    const promises = []
    for (const team of teams) {
      let color = '#'
      for (let i = 0; i < 6; i++) {
        color += randomItem(chars)
      }
      team.color = color
      promises.push(query('UPDATE team SET color=? WHERE id=?', [team.color, team.id]))
    }
    await Promise.all(promises)
  }
}, {
  name: 'Alter table player to have skin color',
  async run () {
    await query('ALTER TABLE player ADD COLUMN skin_color INT;')
    const players = await query('SELECT * FROM player')
    const promises = []
    for (const player of players) {
      player.skin_color = Math.floor(Math.random() * 3)
      promises.push(query('UPDATE player SET skin_color=? WHERE id=?', [player.skin_color, player.id]))
    }
    await Promise.all(promises)
  }
}, {
  name: 'Create Player History Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS player_history
    (
        id
        BIGINT
                 (
        20
                 ) UNSIGNED NOT NULL AUTO_INCREMENT,
        player_id BIGINT
                 (
                     20
                 ),
        type VARCHAR
                 (
                     255
                 ),
        value VARCHAR
                 (
                     255
                 ),
        season INT,
        game_day INT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY
                 (
                     id
                 )
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Rename news table to log_message',
  async run () {
    await query('RENAME TABLE news TO log_message')
  }
}, {
  name: 'Update emblem column to TEXT and assign random emblems',
  async run () {
    // Change emblem column to TEXT to store JSON
    await query('ALTER TABLE team ADD COLUMN emblem TEXT;')

    // Use shared emblem configuration
    const shapes = Object.keys(EMBLEM_SHAPES)
    const patterns = Object.keys(EMBLEM_PATTERNS)

    const teams = await query('SELECT * FROM team')
    const promises = []
    for (const team of teams) {
      const shape = shapes[Math.floor(Math.random() * shapes.length)]
      const pattern = patterns[Math.floor(Math.random() * patterns.length)]
      const color = EMBLEM_COLORS[Math.floor(Math.random() * EMBLEM_COLORS.length)]
      const emblem = JSON.stringify({
        shape,
        pattern,
        color
      })
      promises.push(query('UPDATE team SET emblem=?, color=? WHERE id=?', [emblem, color, team.id]))
    }
    await Promise.all(promises)
  }
}, {
  name: 'Create news table for league news',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS news
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        game_day INT NOT NULL,
        season INT NOT NULL,
        level INT NOT NULL,
        league INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        player_id BIGINT(20),
        team_id BIGINT(20),
        metadata TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_news_lookup (season, game_day, level, league)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Add stadium construction tracking columns',
  async run () {
    const stands = ['north', 'south', 'east', 'west']
    for (const stand of stands) {
      await query(`ALTER TABLE stadium
        ADD COLUMN ${stand}_construction_end_game_day INT DEFAULT NULL,
        ADD COLUMN ${stand}_construction_end_season INT DEFAULT NULL,
        ADD COLUMN ${stand}_construction_target_size INT DEFAULT NULL,
        ADD COLUMN ${stand}_construction_target_roof TINYINT(1) DEFAULT NULL
      `)
    }
  }
}, {
  name: 'Add tutorial_completed column to team table',
  async run () {
    await query('ALTER TABLE team ADD COLUMN tutorial_completed TEXT;')
  }
}, {
  name: 'Add action columns to log_message table',
  async run () {
    await query('ALTER TABLE log_message ADD COLUMN action VARCHAR(50);')
    await query('ALTER TABLE log_message ADD COLUMN action_value BIGINT;')
  }
}, {
  name: 'Add icon column to log_message table',
  async run () {
    await query('ALTER TABLE log_message ADD COLUMN icon VARCHAR(50);')
  }
}, {
  name: 'Migrate team emblems to new pattern variants',
  async run () {
    const validPatterns = Object.keys(EMBLEM_PATTERNS)
    const teams = await query('SELECT id, emblem FROM team WHERE emblem IS NOT NULL')
    const promises = []
    for (const team of teams) {
      try {
        const emblemData = JSON.parse(team.emblem)
        // Check if pattern is invalid (solid or any other non-existent pattern)
        if (!validPatterns.includes(emblemData.pattern)) {
          emblemData.pattern = validPatterns[Math.floor(Math.random() * validPatterns.length)]
          promises.push(query('UPDATE team SET emblem=? WHERE id=?', [JSON.stringify(emblemData), team.id]))
        }
      } catch {
        // If JSON parsing fails, assign a random valid emblem
        const shape = Object.keys(EMBLEM_SHAPES)[Math.floor(Math.random() * Object.keys(EMBLEM_SHAPES).length)]
        const pattern = validPatterns[Math.floor(Math.random() * validPatterns.length)]
        const color = EMBLEM_COLORS[Math.floor(Math.random() * EMBLEM_COLORS.length)]
        const emblem = JSON.stringify({ shape, pattern, color })
        promises.push(query('UPDATE team SET emblem=? WHERE id=?', [emblem, team.id]))
      }
    }
    await Promise.all(promises)
  }
}, {
  name: 'Add language column to user table',
  async run () {
    await query("ALTER TABLE user ADD COLUMN language VARCHAR(5) DEFAULT 'en'")
  }
}, {
  name: 'Add locale column to news table',
  async run () {
    await query("ALTER TABLE news ADD COLUMN locale VARCHAR(5) DEFAULT 'en'")
    await query('ALTER TABLE news DROP INDEX idx_news_lookup')
    await query('CREATE INDEX idx_news_lookup ON news (season, game_day, level, league, locale)')
  }
}, {
  name: 'Add pass_style column to team table',
  async run () {
    await query("ALTER TABLE team ADD COLUMN pass_style VARCHAR(10) DEFAULT 'mixed'")
    const teams = await query('SELECT id FROM team')
    const passStyles = ['short', 'mixed', 'long']
    const promises = []
    for (const team of teams) {
      const randomStyle = passStyles[Math.floor(Math.random() * passStyles.length)]
      promises.push(query('UPDATE team SET pass_style=? WHERE id=?', [randomStyle, team.id]))
    }
    await Promise.all(promises)
  }
}, {
  name: 'Create youth_player table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS youth_player
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        team_id BIGINT(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        position VARCHAR(255) NOT NULL,
        level DECIMAL(4,3) DEFAULT 0.1,
        talent DECIMAL(4,3) NOT NULL,
        moral DECIMAL(4,3) DEFAULT 0.7,
        fitness DECIMAL(4,3) DEFAULT 0.7,
        hair_color INT NOT NULL,
        skin_color INT NOT NULL,
        birth_season INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_youth_team (team_id)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Add youth_training_mode column to team table',
  async run () {
    await query("ALTER TABLE team ADD COLUMN youth_training_mode VARCHAR(20) DEFAULT 'rest'")
  }
}, {
  name: 'Seed 3 youth players per team',
  async run () {
    const teams = await query('SELECT id FROM team')
    const [game] = await query('SELECT * FROM game g ORDER BY g.season DESC LIMIT 1')
    const season = game?.season ?? 0
    const positions = ['GK', 'CD', 'LD', 'RD', 'CM', 'LM', 'RM', 'DM', 'OM', 'CA', 'LA', 'RA']
    const nameLibrary = await import('./lib/name-library.js')
    const util = await import('./lib/util.js')

    for (const team of teams) {
      for (let i = 0; i < 3; i++) {
        const name = `${util.randomItem(nameLibrary.playerNames).firstName} ${util.randomItem(nameLibrary.playerNames).lastName}`
        const talent = 0.1 + Math.random() * 0.9 // 0.1 to 1.0
        const level = 0.1 + Math.random() * 0.9 // 0.1 to 1.0
        const youthPlayer = {
          team_id: team.id,
          name,
          position: util.randomItem(positions),
          level,
          talent,
          moral: 0.5 + Math.random() * 0.5, // 0.5 to 1.0
          fitness: 0.5 + Math.random() * 0.5, // 0.5 to 1.0
          hair_color: Math.floor(Math.random() * 7),
          skin_color: Math.floor(Math.random() * 3),
          birth_season: season // They are 15 years old at current season
        }
        await query('INSERT INTO youth_player SET ?', youthPlayer)
      }
    }
  }
}, {
  name: 'Add play_style column to team table',
  async run () {
    await query("ALTER TABLE team ADD COLUMN play_style VARCHAR(20) DEFAULT 'normal'")
    const teams = await query('SELECT id FROM team')
    const playStyles = ['aggressive', 'normal', 'friendly']
    const promises = []
    for (const team of teams) {
      const randomStyle = playStyles[Math.floor(Math.random() * playStyles.length)]
      promises.push(query('UPDATE team SET play_style=? WHERE id=?', [randomStyle, team.id]))
    }
    await Promise.all(promises)
  }
}, {
  name: 'Add card columns to player table',
  async run () {
    await query('ALTER TABLE player ADD COLUMN yellow_cards INT DEFAULT 0')
    await query('ALTER TABLE player ADD COLUMN red_cards INT DEFAULT 0')
    await query('ALTER TABLE player ADD COLUMN is_suspended TINYINT(1) DEFAULT 0')
  }
}, {
  name: 'Add game_type column to game table for friendly matches',
  async run () {
    await query("ALTER TABLE game ADD COLUMN game_type VARCHAR(20) DEFAULT 'league'")
    await query('CREATE INDEX idx_game_type ON game (game_type)')
  }
}, {
  name: 'Add index for game table to optimize getGameDayAndSeason',
  async run () {
    // Composite index for queries that filter by played and order by season, game_day
    await query('CREATE INDEX idx_game_played_season_gameday ON game (played, season, game_day)')
  }
}, {
  name: 'Create standing_cache table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS standing_cache
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        season INT NOT NULL,
        game_day INT NOT NULL,
        level INT NOT NULL,
        league INT NOT NULL,
        data LONGTEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_standing_lookup (season, game_day, level, league)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Add index for game table season column',
  async run () {
    // Index for queries that order by season DESC (e.g., _seasonForNewGames)
    await query('CREATE INDEX idx_game_season ON game (season DESC)')
  }
}, {
  name: 'Add index for trade_offer table for team sell offers lookup',
  async run () {
    // Index for getMySellOfferPlayerIds query
    await query('CREATE INDEX idx_trade_offer_team_type ON trade_offer (from_team_id, type)')
  }
}, {
  name: 'Add index for trade_offer table for player sell offer lookup',
  async run () {
    // Index for hasPlayerSellOffer query
    await query('CREATE INDEX idx_trade_offer_player_type ON trade_offer (player_id, type)')
  }
}, {
  name: 'Add index for team table user_id lookup',
  async run () {
    // Index for getTeam queries that look up team by user_id
    await query('CREATE INDEX idx_team_user_id ON team (user_id)')
  }
}, {
  name: 'Add index for game table results lookup',
  async run () {
    // Index for getResults query that filters by game_day, season, level, league
    await query('CREATE INDEX idx_game_results_lookup ON game (season, game_day, level, league)')
  }
}, {
  name: 'Add index for game table season results lookup with played filter',
  async run () {
    // Index for getSeasonResults query that filters by season, level, league, played and range on game_day
    // Equality columns first, then range column last for optimal index usage
    await query('CREATE INDEX idx_game_season_results ON game (season, level, league, played, game_day)')
  }
}, {
  name: 'Create player_season_stats table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS player_season_stats
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        player_id BIGINT(20) NOT NULL,
        season INT NOT NULL,
        level INT NOT NULL,
        league INT NOT NULL,
        goals INT DEFAULT 0,
        yellow_cards INT DEFAULT 0,
        red_cards INT DEFAULT 0,
        games_played INT DEFAULT 0,
        last_updated_game_day INT DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_player_season_league (player_id, season, level, league),
        INDEX idx_top_scorers (season, level, league, goals DESC)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Add cup_round column to game table',
  async run () {
    await query('ALTER TABLE game ADD COLUMN cup_round INT DEFAULT NULL')
    await query('CREATE INDEX idx_game_cup ON game (game_type, season, cup_round)')
  }
}, {
  name: 'Delete incorrectly created cup games',
  async run () {
    // Delete all cup games that were created for seasons that have already started
    // This fixes a bug where cup games were created for the wrong season
    const result = await query("DELETE FROM game WHERE game_type = 'cup'")
    if (result.affectedRows > 0) {
      console.log(`🗑️ Deleted ${result.affectedRows} incorrectly created cup games`)
    }
  }
}, {
  name: 'Fix accumulated red/yellow cards bug',
  async run () {
    // Fix players with accumulated red cards (should never have more than 1)
    // and clear suspensions/cards for players who shouldn't be suspended
    const result = await query(
      'UPDATE player SET red_cards=0, yellow_cards=0, is_suspended=0 WHERE red_cards > 1 OR (is_suspended=0 AND red_cards > 0)'
    )
    if (result.affectedRows > 0) {
      console.log(`🔧 Fixed ${result.affectedRows} players with accumulated cards bug`)
    }
  }
}, {
  name: 'Create stadium_construction_history table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS stadium_construction_history
    (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        stadium_id BIGINT NOT NULL,
        stand VARCHAR(10) NOT NULL,
        old_size INT NOT NULL,
        new_size INT NOT NULL,
        added_roof TINYINT(1) DEFAULT 0,
        started_game_day INT NOT NULL,
        started_season INT NOT NULL,
        completed_game_day INT DEFAULT NULL,
        completed_season INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_construction_stadium (stadium_id)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
},
{
  name: 'Add player_level column to trade_history',
  async run () {
    await query('ALTER TABLE trade_history ADD COLUMN player_level INT')
  }
},
{
  name: 'Refactor level system from 1-10 to 1-100',
  async run () {
    // Change youth_player.level column FIRST to accommodate new range (max 10.00)
    await query('ALTER TABLE youth_player MODIFY COLUMN level DECIMAL(5,2) DEFAULT 1.0')
    // Multiply all existing player levels by 10
    await query('UPDATE player SET level = level * 10')
    // Multiply all existing youth player levels by 10
    await query('UPDATE youth_player SET level = level * 10')
    // Multiply all existing trade history player levels by 10
    await query('UPDATE trade_history SET player_level = player_level * 10')
    // Rename action card types
    await query("UPDATE action_card SET action = 'LEVEL_UP_PLAYER_40' WHERE action = 'LEVEL_UP_PLAYER_4'")
    await query("UPDATE action_card SET action = 'LEVEL_UP_PLAYER_70' WHERE action = 'LEVEL_UP_PLAYER_7'")
    await query("UPDATE action_card SET action = 'LEVEL_UP_PLAYER_100' WHERE action = 'LEVEL_UP_PLAYER_10'")
    console.log('✅ Level system refactored from 1-10 to 1-100')
  }
},
{
  name: 'Create building table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS building
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        team_id BIGINT(20) NOT NULL,
        type VARCHAR(50) NOT NULL,
        level INT NOT NULL DEFAULT 0,
        construction_end_game_day INT DEFAULT NULL,
        construction_end_season INT DEFAULT NULL,
        construction_target_level INT DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_building_team (team_id),
        UNIQUE KEY idx_building_team_type (team_id, type)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)

    // Seed existing teams with training_area at level 1
    const teams = await query('SELECT id FROM team')
    for (const team of teams) {
      await query('INSERT INTO building SET ?', {
        team_id: team.id,
        type: 'training_area',
        level: 1
      })
    }
    console.log(`✅ Created building table and seeded ${teams.length} teams with training_area level 1`)
  }
},
{
  name: 'Add sort_index column to player table',
  async run () {
    await query('ALTER TABLE player ADD COLUMN sort_index INT DEFAULT 0')
  }
},
{
  name: 'Seed fitness_studio building for all teams',
  async run () {
    const teams = await query('SELECT id FROM team')
    for (const team of teams) {
      const existing = await query("SELECT id FROM building WHERE team_id=? AND type='fitness_studio' LIMIT 1", [team.id])
      if (existing.length === 0) {
        await query('INSERT INTO building SET ?', {
          team_id: team.id,
          type: 'fitness_studio',
          level: 1
        })
      }
    }
    console.log(`✅ Seeded ${teams.length} teams with fitness_studio level 1`)
  }
},
{
  name: 'Add attack_mode column to team table',
  async run () {
    await query("ALTER TABLE team ADD COLUMN attack_mode VARCHAR(20) DEFAULT 'balanced'")
    const teams = await query('SELECT id FROM team')
    const attackModes = ['offensive', 'balanced', 'defensive']
    const promises = []
    for (const team of teams) {
      const randomMode = attackModes[Math.floor(Math.random() * attackModes.length)]
      promises.push(query('UPDATE team SET attack_mode=? WHERE id=?', [randomMode, team.id]))
    }
    await Promise.all(promises)
  }
},
{
  name: 'Add state column to action_card table',
  async run () {
    await query("ALTER TABLE action_card ADD COLUMN state VARCHAR(20) DEFAULT 'received'")
    // Backfill existing rows
    await query("UPDATE action_card SET state='received' WHERE played=0")
    await query("UPDATE action_card SET state='played' WHERE played=1")
    console.log('✅ Added state column to action_card table')
  }
},
{
  name: 'Rename all bot teams with new random names',
  async run () {
    const nameLibrary = await import('./lib/name-library.js')
    const util = await import('./lib/util.js')

    function generateName () {
      let prefix1, prefix2
      do {
        prefix1 = util.randomItem(nameLibrary.clubPrefixes1)
        prefix2 = util.randomItem(nameLibrary.clubPrefixes2)
      } while (!prefix1 && !prefix2)
      return `${prefix1} ${prefix2} ${util.randomItem(nameLibrary.cityNames)}`.replace(/\s+/g, ' ').trim()
    }

    const botTeams = await query('SELECT id FROM team WHERE user_id IS NULL')
    const usedNames = new Set()
    let updated = 0

    for (const team of botTeams) {
      let name
      do {
        name = generateName()
      } while (usedNames.has(name))
      usedNames.add(name)
      await query('UPDATE team SET name=? WHERE id=?', [name, team.id])
      updated++
    }
    console.log(`✅ Renamed ${updated} bot teams with new random names`)
  }
}]

/**
 * @returns {Promise<void>}
 */
export async function runMigration () {
  console.log('🚀 Database migration started...')
  const t1 = Date.now()
  await query(`CREATE TABLE IF NOT EXISTS __migration
  (
      id
      BIGINT
               (
      20
               ) UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR
               (
                   255
               ),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY
               (
                   id
               )
      ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  for (const migration of migrations) {
    const [{ amount }] = await query(`SELECT COUNT(*) AS amount
                                      FROM __migration
                                      WHERE \`name\` = "${migration.name}";`)
    if (amount > 0) continue
    await migration.run()
    await query(`INSERT INTO __migration (name)
                 VALUES ("${migration.name}");`)
  }
  console.log(`✅ Database migration done in ${Date.now() - t1}ms.`)
}
