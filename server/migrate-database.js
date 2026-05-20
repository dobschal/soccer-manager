import { query } from './lib/database.js'
import { randomItem } from '../client/lib/randomItem.js'
import { EMBLEM_COLORS, EMBLEM_PATTERNS, EMBLEM_SHAPES, adjustBrightness } from '../client/util/emblemGenerator.js'
import { _getBotPlayerLevelRange, _getBotStadiumConfig } from './prepare-season.js'

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
      let color2 = EMBLEM_COLORS[Math.floor(Math.random() * EMBLEM_COLORS.length)]
      while (color2 === color) {
        color2 = EMBLEM_COLORS[Math.floor(Math.random() * EMBLEM_COLORS.length)]
      }
      const emblem = JSON.stringify({
        shape,
        pattern,
        color,
        color2
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
        let color2 = EMBLEM_COLORS[Math.floor(Math.random() * EMBLEM_COLORS.length)]
        while (color2 === color) {
          color2 = EMBLEM_COLORS[Math.floor(Math.random() * EMBLEM_COLORS.length)]
        }
        const emblem = JSON.stringify({ shape, pattern, color, color2 })
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
}, {
  name: 'Migrate team emblems to two-color pattern system',
  async run () {
    // Map old pattern names to new ones and compute color2
    const patternMapping = {
      stripesDark: { pattern: 'stripes', brightness: -40 },
      stripesBright: { pattern: 'stripes', brightness: 40 },
      horizontalStripesDark: { pattern: 'horizontalStripes', brightness: -40 },
      horizontalStripesBright: { pattern: 'horizontalStripes', brightness: 40 },
      quarteredDark: { pattern: 'quartered', brightness: -40 },
      quarteredBright: { pattern: 'quartered', brightness: 40 },
      diagonalDark: { pattern: 'diagonal', brightness: -40 },
      diagonalBright: { pattern: 'diagonal', brightness: 40 },
      halvedDark: { pattern: 'halved', brightness: -40 },
      halvedBright: { pattern: 'halved', brightness: 40 }
    }

    const teams = await query('SELECT id, emblem FROM team WHERE emblem IS NOT NULL')
    const promises = []
    for (const team of teams) {
      try {
        const emblemData = JSON.parse(team.emblem)
        if (emblemData.color2) continue // Already migrated
        const mapping = patternMapping[emblemData.pattern]
        if (mapping) {
          emblemData.color2 = adjustBrightness(emblemData.color, mapping.brightness)
          emblemData.pattern = mapping.pattern
        } else {
          // For patterns already using new names or 'solid', pick a random second color
          emblemData.color2 = EMBLEM_COLORS[Math.floor(Math.random() * EMBLEM_COLORS.length)]
        }
        promises.push(query('UPDATE team SET emblem=? WHERE id=?', [JSON.stringify(emblemData), team.id]))
      } catch {
        // Skip teams with invalid JSON
      }
    }
    await Promise.all(promises)
  }
},
{
  name: 'Create news_like table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS news_like
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        news_id BIGINT(20) UNSIGNED NOT NULL,
        user_id BIGINT(20) UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_news_user (news_id, user_id),
        INDEX idx_news_like_user_id (user_id)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
},
{
  name: 'Create news_comment table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS news_comment
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        news_id BIGINT(20) UNSIGNED NOT NULL,
        user_id BIGINT(20) UNSIGNED NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_news_comment_news_id (news_id),
        INDEX idx_news_comment_user_id (user_id)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Convert news_comment table to utf8mb4 for emoji support',
  async run () {
    await query(`ALTER TABLE news_comment CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`)
  }
},
{
  name: 'Allow NULL team_2_id in game table for bye games',
  async run () {
    await query('ALTER TABLE game MODIFY team_2_id BIGINT(20) NULL')
  }
},
{
  name: 'Add is_star_player column to player table',
  async run () {
    await query('ALTER TABLE player ADD COLUMN is_star_player TINYINT(1) DEFAULT 0')
  }
},
{
  name: 'Add is_system_team column to team table',
  async run () {
    await query('ALTER TABLE team ADD COLUMN is_system_team TINYINT(1) DEFAULT 0')
  }
},
{
  name: 'Create International Oversea Club system team',
  async run () {
    await query("INSERT INTO team SET name='International Oversea Club', is_system_team=1, balance=0, formation='442b', color='#1a237e', league=NULL, level=NULL")
  }
},
{
  name: 'Add index for game table bot stadium query',
  async run () {
    await query('CREATE INDEX idx_game_team1_played ON game (team_1_id, played, season DESC, game_day DESC)')
  }
},
{
  name: 'Add index for action_card team lookup',
  async run () {
    await query('CREATE INDEX idx_action_card_team_state ON action_card (team_id, played, state)')
  }
}, {
  name: 'Add last_login column to user table',
  async run () {
    await query('ALTER TABLE user ADD COLUMN last_login TIMESTAMP NULL DEFAULT NULL')
  }
}, {
  name: 'Add platform-specific last_login columns to user table',
  async run () {
    await query('ALTER TABLE user ADD COLUMN last_login_web TIMESTAMP NULL DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN last_login_ios TIMESTAMP NULL DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN last_login_android TIMESTAMP NULL DEFAULT NULL')
  }
}, {
  name: 'Create device_token table for push notifications',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS device_token (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT(20) UNSIGNED NOT NULL,
      token VARCHAR(512) NOT NULL,
      platform VARCHAR(20) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_platform (user_id, platform),
      INDEX idx_device_token_platform (platform)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Hash existing plaintext passwords',
  async run () {
    const { hashPassword } = await import('./lib/passwordHash.js')
    const users = await query('SELECT id, password FROM user')
    let count = 0
    for (const user of users) {
      // Skip already-hashed passwords (format is "salt:derivedKeyHex")
      if (user.password && user.password.includes(':')) continue
      const hashed = await hashPassword(user.password)
      await query('UPDATE user SET password=? WHERE id=?', [hashed, user.id])
      count++
    }
    console.log(`✅ Hashed ${count} existing plaintext passwords`)
  }
}, {
  name: 'Add motivating_speech_active column to team table',
  async run () {
    await query('ALTER TABLE team ADD COLUMN motivating_speech_active TINYINT(1) DEFAULT 0')
  }
},
{
  name: 'Create team_stats_cache table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS team_stats_cache
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        team_id BIGINT(20) NOT NULL,
        season INT NOT NULL,
        game_day INT NOT NULL,
        level INT NOT NULL,
        league INT NOT NULL,
        player_count INT DEFAULT 0,
        avg_strength DECIMAL(10,2) DEFAULT 0,
        total_strength INT DEFAULT 0,
        squad_size INT DEFAULT 0,
        avg_freshness DECIMAL(6,4) DEFAULT 0,
        stadium_size INT DEFAULT 0,
        squad_value BIGINT DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY idx_team_stats_cache (team_id, season, game_day),
        INDEX idx_team_stats_league (season, game_day, level, league)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
},
{
  name: 'Create client_log table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS client_log
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        level VARCHAR(10) NOT NULL DEFAULT 'info',
        message TEXT NOT NULL,
        user_id BIGINT(20) UNSIGNED DEFAULT NULL,
        user_agent TEXT,
        platform VARCHAR(50),
        url TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_client_log_created_at (created_at)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4;`)
  }
},
{
  name: 'Add status column to trade_offer table',
  async run () {
    await query("ALTER TABLE trade_offer ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'open'")
    await query('CREATE INDEX idx_trade_offer_status ON trade_offer (status)')
  }
}, {
  name: 'Add IP and country columns per platform to user table',
  async run () {
    await query('ALTER TABLE user ADD COLUMN last_ip_web VARCHAR(45) NULL DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN last_ip_ios VARCHAR(45) NULL DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN last_ip_android VARCHAR(45) NULL DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN last_country_web VARCHAR(2) NULL DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN last_country_ios VARCHAR(2) NULL DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN last_country_android VARCHAR(2) NULL DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN last_region_web VARCHAR(10) NULL DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN last_region_ios VARCHAR(10) NULL DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN last_region_android VARCHAR(10) NULL DEFAULT NULL')
  }
},
{
  name: 'Add captain_id column to team table',
  async run () {
    await query('ALTER TABLE team ADD COLUMN captain_id BIGINT(20) DEFAULT NULL')
  }
},
{
  name: 'Add index for game table team_2_id lookup',
  async run () {
    await query('CREATE INDEX idx_game_team2_played ON game (team_2_id, played, season DESC, game_day DESC)')
  }
},
{
  name: 'Balance existing bot team players and stadiums by league level',
  async run () {
    const botTeams = await query('SELECT * FROM team WHERE user_id IS NULL AND is_system_team = 0')
    for (const team of botTeams) {
      const levelRange = _getBotPlayerLevelRange(team.level ?? 0)
      const players = await query('SELECT id FROM player WHERE team_id = ?', [team.id])
      for (const player of players) {
        const newLevel = Math.floor(Math.random() * (levelRange.max - levelRange.min + 1)) + levelRange.min
        await query('UPDATE player SET level = ? WHERE id = ?', [newLevel, player.id])
      }
      const stadiumConfig = _getBotStadiumConfig(team.level ?? 0)
      await query(
        'UPDATE stadium SET north_stand_size = ?, south_stand_size = ?, east_stand_size = ?, west_stand_size = ? WHERE team_id = ?',
        [stadiumConfig.n, stadiumConfig.s, stadiumConfig.e, stadiumConfig.w, team.id]
      )
    }
    console.log(`✅ Balanced ${botTeams.length} bot teams by league level`)
  }
},
{
  name: 'Reduce bot team player levels by 10 and clear their history',
  async run () {
    await query(`
      UPDATE player p
      JOIN team t ON p.team_id = t.id
      SET p.level = GREATEST(1, p.level - 10)
      WHERE t.user_id IS NULL AND t.is_system_team = 0
    `)
    const result = await query(`
      DELETE ph FROM player_history ph
      JOIN player p ON ph.player_id = p.id
      JOIN team t ON p.team_id = t.id
      WHERE t.user_id IS NULL AND t.is_system_team = 0
    `)
    console.log(`✅ Reduced bot player levels by 10 and deleted ${result.affectedRows ?? 0} history entries`)
  }
},
{
  name: 'Create forum_category table',
  async run () {
    await query(`
      CREATE TABLE IF NOT EXISTS forum_category (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
  }
},
{
  name: 'Create forum_post table',
  async run () {
    await query(`
      CREATE TABLE IF NOT EXISTS forum_post (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        category_id BIGINT(20) UNSIGNED NOT NULL,
        user_id BIGINT(20) UNSIGNED NOT NULL,
        team_id BIGINT(20) UNSIGNED,
        title VARCHAR(255) NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_forum_post_category (category_id),
        INDEX idx_forum_post_user (user_id)
      ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
  }
},
{
  name: 'Create forum_post_like table',
  async run () {
    await query(`
      CREATE TABLE IF NOT EXISTS forum_post_like (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        post_id BIGINT(20) UNSIGNED NOT NULL,
        user_id BIGINT(20) UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_post_user (post_id, user_id),
        INDEX idx_forum_post_like_post (post_id)
      ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
  }
},
{
  name: 'Add is_admin column to user table',
  async run () {
    await query('ALTER TABLE user ADD COLUMN is_admin TINYINT(1) DEFAULT 0')
    // Emmo is always an admin
    await query("UPDATE user SET is_admin = 1 WHERE username = 'Emmo'")
  }
},
{
  name: 'Increase sponsor values by 20 percent',
  async run () {
    const result = await query('UPDATE sponsor SET value = FLOOR(value * 1.2)')
    console.log(`✅ Increased ${result.affectedRows ?? 0} sponsor values by 20%`)
  }
},
{
  name: 'Create forum_comment table',
  async run () {
    await query(`
      CREATE TABLE IF NOT EXISTS forum_comment (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        post_id BIGINT(20) UNSIGNED NOT NULL,
        user_id BIGINT(20) UNSIGNED NOT NULL,
        team_id BIGINT(20) UNSIGNED,
        text TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_forum_comment_post (post_id),
        INDEX idx_forum_comment_user (user_id)
      ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
  }
},
{
  name: 'Create forum_comment_image table',
  async run () {
    await query(`
      CREATE TABLE IF NOT EXISTS forum_comment_image (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        comment_id BIGINT(20) UNSIGNED NOT NULL,
        filename VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_forum_comment_image_comment (comment_id)
      ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
  }
},
{
  name: 'Add game_day and season columns to trade_offer table',
  async run () {
    await query('ALTER TABLE trade_offer ADD COLUMN game_day INT DEFAULT NULL')
    await query('ALTER TABLE trade_offer ADD COLUMN season INT DEFAULT NULL')
    await query('CREATE INDEX idx_trade_offer_attempts ON trade_offer (from_team_id, player_id, game_day, season)')
  }
},
{
  name: 'Create forum_post_image table',
  async run () {
    await query(`
      CREATE TABLE IF NOT EXISTS forum_post_image (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        post_id BIGINT(20) UNSIGNED NOT NULL,
        filename VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_forum_post_image_post (post_id)
      ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
  }
}, {
  name: 'Reduce carrier_end_season by 2 for retirement at age 36-39',
  async run () {
    await query('UPDATE player SET carrier_end_season = carrier_end_season - 2')
  }
}, {
  name: 'Add injury and bench columns to player table',
  async run () {
    await query('ALTER TABLE player ADD COLUMN is_injured TINYINT(1) DEFAULT 0')
    await query('ALTER TABLE player ADD COLUMN injury_type VARCHAR(50) DEFAULT NULL')
    await query('ALTER TABLE player ADD COLUMN injury_days_left INT DEFAULT 0')
    await query('ALTER TABLE player ADD COLUMN bench_position VARCHAR(20) DEFAULT NULL')
  }
},
{
  name: 'Create hall_of_fame_comment table',
  async run () {
    await query(`
      CREATE TABLE IF NOT EXISTS hall_of_fame_comment (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        season INT NOT NULL,
        user_id BIGINT(20) UNSIGNED NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_hof_comment_season (season),
        INDEX idx_hof_comment_user (user_id)
      ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
  }
},
{
  name: 'Create hall_of_fame_comment_like table',
  async run () {
    await query(`
      CREATE TABLE IF NOT EXISTS hall_of_fame_comment_like (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        comment_id BIGINT(20) UNSIGNED NOT NULL,
        user_id BIGINT(20) UNSIGNED NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY unique_comment_user (comment_id, user_id),
        INDEX idx_hof_like_comment (comment_id)
      ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
    `)
  }
}, {
  name: 'Add description column to team table',
  async run () {
    await query('ALTER TABLE team ADD COLUMN description TEXT DEFAULT NULL')
  }
},
{
  name: 'Add badge columns to forum_post table',
  async run () {
    await query('ALTER TABLE forum_post ADD COLUMN badge_text VARCHAR(50) DEFAULT NULL')
    await query('ALTER TABLE forum_post ADD COLUMN badge_color VARCHAR(7) DEFAULT NULL')
  }
},
{
  name: 'Add bench_substitution_mode column to player table',
  async run () {
    await query("ALTER TABLE player ADD COLUMN bench_substitution_mode VARCHAR(20) NOT NULL DEFAULT 'injury_only'")
  }
},
{
  name: 'Create statistics table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS statistics
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        daily_active_users INT NOT NULL DEFAULT 0,
        in_game_money BIGINT NOT NULL DEFAULT 0,
        player_count INT NOT NULL DEFAULT 0,
        avg_player_level DECIMAL(6,2) NOT NULL DEFAULT 0,
        avg_player_age DECIMAL(6,2) NOT NULL DEFAULT 0,
        action_card_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_statistics_created_at (created_at)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
},
{
  name: 'Add name column to stadium table',
  async run () {
    await query('ALTER TABLE stadium ADD COLUMN name VARCHAR(255) DEFAULT NULL')
    const { defaultStadiumName } = await import('./helper/stadiumHelper.js')
    const rows = await query('SELECT s.id, t.name AS team_name FROM stadium s JOIN team t ON s.team_id = t.id')
    const promises = []
    for (const row of rows) {
      promises.push(query('UPDATE stadium SET name=? WHERE id=?', [defaultStadiumName(row.team_name), row.id]))
    }
    await Promise.all(promises)
  }
}, {
  name: 'Add is_forfeit column to game table',
  async run () {
    await query('ALTER TABLE game ADD COLUMN is_forfeit TINYINT(1) NOT NULL DEFAULT 0;')
  }
}, {
  name: 'Create mini_game_score table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS mini_game_score
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        team_id BIGINT(20) NOT NULL,
        score INT NOT NULL,
        goals_scored INT NOT NULL DEFAULT 0,
        duration_ms INT NOT NULL DEFAULT 0,
        rewarded_card_id BIGINT(20) UNSIGNED DEFAULT NULL,
        played_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_mini_game_score_team (team_id),
        INDEX idx_mini_game_score_played_at (played_at),
        INDEX idx_mini_game_score_score (score)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Add game_day and season to mini_game_score',
  async run () {
    await query('ALTER TABLE mini_game_score ADD COLUMN game_day INT NOT NULL DEFAULT 0;')
    await query('ALTER TABLE mini_game_score ADD COLUMN season INT NOT NULL DEFAULT 0;')
    await query('CREATE INDEX idx_mini_game_score_game_day_season ON mini_game_score (game_day, season);')
  }
}, {
  // User-facing match day, separate from internal sequential game_day.
  // League: 1..(2*(teamsPerLeague-1)), no gaps. Cup: 1..N (1=first round, N=final).
  // Internal game_day stays as the cron-tick counter; cup days are interleaved
  // between league days, which would otherwise create gaps in the league dropdown.
  name: 'Add match_day column to game table',
  async run () {
    await query('ALTER TABLE game ADD COLUMN match_day INT DEFAULT NULL;')
    await query('CREATE INDEX idx_game_match_day ON game (season, level, league, match_day);')

    // Backfill league: rank distinct game_days within each (season, level, league)
    const leagueGroups = await query(`
      SELECT DISTINCT season, level, league
      FROM game
      WHERE game_type = 'league' OR game_type IS NULL
    `)
    for (const { season, level, league } of leagueGroups) {
      const days = await query(
        "SELECT DISTINCT game_day FROM game WHERE season=? AND level=? AND league=? AND (game_type='league' OR game_type IS NULL) ORDER BY game_day ASC",
        [season, level, league]
      )
      for (let i = 0; i < days.length; i++) {
        await query(
          "UPDATE game SET match_day=? WHERE season=? AND level=? AND league=? AND game_day=? AND (game_type='league' OR game_type IS NULL)",
          [i + 1, season, level, league, days[i].game_day]
        )
      }
    }

    // Backfill cup: per season, derive sequential round number from cup_round
    const cupSeasons = await query("SELECT DISTINCT season FROM game WHERE game_type='cup'")
    for (const { season } of cupSeasons) {
      const [{ maxRound }] = await query(
        "SELECT MAX(cup_round) as maxRound FROM game WHERE game_type='cup' AND season=?",
        [season]
      )
      if (!maxRound) continue
      const totalRounds = Math.log2(maxRound) + 1
      const cupGames = await query(
        "SELECT id, cup_round FROM game WHERE game_type='cup' AND season=?",
        [season]
      )
      for (const g of cupGames) {
        const matchDay = totalRounds - Math.log2(g.cup_round)
        await query('UPDATE game SET match_day=? WHERE id=?', [matchDay, g.id])
      }
    }
  }
}, {
  name: 'Add monthly_active_users and total_user_count to statistics',
  async run () {
    await query('ALTER TABLE statistics ADD COLUMN monthly_active_users INT NOT NULL DEFAULT 0')
    await query('ALTER TABLE statistics ADD COLUMN total_user_count INT NOT NULL DEFAULT 0')
  }
}, {
  // Removes standing_cache rows that were written by the getStanding route for
  // unplayed match days. Those rows freeze a "current at the time of the request"
  // snapshot under a future game_day key and never get refreshed by the cron.
  name: 'Purge stale future-game_day standing_cache rows',
  async run () {
    const result = await query(`
      DELETE sc FROM standing_cache sc
      LEFT JOIN (
        SELECT season, level, league, MAX(game_day) AS lastPlayed
        FROM game
        WHERE played = 1 AND (game_type = 'league' OR game_type IS NULL)
        GROUP BY season, level, league
      ) lp
        ON lp.season = sc.season AND lp.level = sc.level AND lp.league = sc.league
      WHERE lp.lastPlayed IS NULL OR sc.game_day > lp.lastPlayed
    `)
    console.log(`🧹 Purged ${result.affectedRows} stale standing_cache rows`)
  }
}, {
  // Re-place unplayed cup games on the earliest game_day where every
  // participating team is league-idle. Previously progressCupRound used a
  // "no league anywhere" lookup which could push late rounds (semi-final,
  // final) far past their natural slot when no fully league-empty days
  // remained.
  name: 'Reschedule unplayed cup games onto team-idle slots',
  async run () {
    const groups = await query(`
      SELECT season, cup_round, MIN(game_day) AS current_game_day
      FROM game
      WHERE game_type = 'cup' AND played = 0
      GROUP BY season, cup_round
    `)
    if (groups.length === 0) {
      console.log('⏭️ No unplayed cup games to reschedule.')
      return
    }

    let movedRows = 0
    for (const { season, cup_round: cupRound, current_game_day: currentGameDay } of groups) {
      // Latest played cup game for this season — that's the floor for the new slot.
      const [{ maxPlayedDay }] = await query(
        "SELECT COALESCE(MAX(game_day), -1) AS maxPlayedDay FROM game WHERE game_type='cup' AND season=? AND played=1",
        [season]
      )
      const minGameDay = Math.max(maxPlayedDay + 1, 0)

      // All teams participating in this round/season.
      const teamRows = await query(
        "SELECT team_1_id, team_2_id FROM game WHERE game_type='cup' AND season=? AND cup_round=? AND played=0",
        [season, cupRound]
      )
      const teamIds = [...new Set(teamRows.flatMap(r => [r.team_1_id, r.team_2_id]).filter(id => id != null))]
      if (teamIds.length === 0) continue

      const placeholders = teamIds.map(() => '?').join(',')
      const conflicts = await query(
        `SELECT DISTINCT game_day FROM game
         WHERE season=? AND (game_type='league' OR game_type IS NULL)
           AND (team_1_id IN (${placeholders}) OR team_2_id IN (${placeholders}))`,
        [season, ...teamIds, ...teamIds]
      )
      const conflictSet = new Set(conflicts.map(d => d.game_day))
      let candidate = minGameDay
      while (conflictSet.has(candidate)) candidate++

      if (candidate >= currentGameDay) continue // already at or past the team-aware slot

      const result = await query(
        "UPDATE game SET game_day=? WHERE game_type='cup' AND season=? AND cup_round=? AND played=0",
        [candidate, season, cupRound]
      )
      console.log(`🏆 Season ${season} cup round ${cupRound}: moved ${result.affectedRows} game(s) from day ${currentGameDay} → ${candidate}`)
      movedRows += result.affectedRows
    }
    console.log(`🏆 Cup reschedule done — moved ${movedRows} game(s) total.`)
  }
}, {
  name: 'Add avatar column to user table',
  async run () {
    await query('ALTER TABLE user ADD COLUMN avatar VARCHAR(255) NULL DEFAULT NULL')
  }
}, {
  name: 'Remove CHANGE_PLAYER_POSITION action cards',
  async run () {
    const result = await query("DELETE FROM action_card WHERE action='CHANGE_PLAYER_POSITION'")
    console.log(`🗑️ Deleted ${result.affectedRows} CHANGE_PLAYER_POSITION action cards`)
  }
}, {
  name: 'Create season_title table and backfill historical titles',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS season_title
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        season INT NOT NULL,
        title_type VARCHAR(20) NOT NULL,
        level INT NOT NULL DEFAULT -1,
        league INT NOT NULL DEFAULT -1,
        team_id BIGINT NOT NULL,
        user_id BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_season_title (season, title_type, level, league),
        INDEX idx_season_title_season (season)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)

    // Backfill league champions: read frozen user_id from standing_cache JSON.
    const completedSeasons = await query(`
      SELECT DISTINCT season FROM (
        SELECT season FROM game
        WHERE (game_type='league' OR game_type IS NULL) AND level=1
        GROUP BY season
        HAVING COUNT(*) = SUM(played)
      ) s
    `)
    for (const { season } of completedSeasons) {
      const levelLeagues = await query(
        'SELECT DISTINCT level, league FROM standing_cache WHERE season=?',
        [season]
      )
      for (const { level, league } of levelLeagues) {
        const [lastGameDay] = await query(
          'SELECT MAX(game_day) AS maxDay FROM standing_cache WHERE season=? AND level=? AND league=?',
          [season, level, league]
        )
        if (lastGameDay?.maxDay == null) continue
        const [cached] = await query(
          'SELECT data FROM standing_cache WHERE season=? AND game_day=? AND level=? AND league=?',
          [season, lastGameDay.maxDay, level, league]
        )
        if (!cached?.data) continue
        let standing
        try { standing = JSON.parse(cached.data) } catch { continue }
        const topTeam = standing[0]
        if (!topTeam?.team?.id) continue
        await query(
          `INSERT IGNORE INTO season_title (season, title_type, level, league, team_id, user_id)
           VALUES (?, 'champion', ?, ?, ?, ?)`,
          [season, level, league, topTeam.team.id, topTeam.team.user_id ?? null]
        )
      }
    }

    // Backfill cup winners: best-effort, using current team.user_id since no
    // historical snapshot exists. Sentinel level=-1, league=-1.
    const cupFinals = await query(`
      SELECT g.season, g.goals_team_1, g.goals_team_2,
             t1.id AS t1Id, t1.user_id AS t1UserId,
             t2.id AS t2Id, t2.user_id AS t2UserId
      FROM game g
      JOIN team t1 ON t1.id = g.team_1_id
      JOIN team t2 ON t2.id = g.team_2_id
      WHERE g.game_type='cup' AND g.cup_round=1 AND g.played=1
    `)
    for (const f of cupFinals) {
      const team1Won = f.goals_team_1 > f.goals_team_2
      const winnerId = team1Won ? f.t1Id : f.t2Id
      const winnerUserId = team1Won ? f.t1UserId : f.t2UserId
      await query(
        `INSERT IGNORE INTO season_title (season, title_type, level, league, team_id, user_id)
         VALUES (?, 'cup_winner', -1, -1, ?, ?)`,
        [f.season, winnerId, winnerUserId ?? null]
      )
    }

    console.log(`🏆 Backfilled season_title for ${completedSeasons.length} season(s), ${cupFinals.length} cup final(s)`)
  }
}, {
  // Before this migration, calculateConstructionEndDate hardcoded
  // GAMEDAYS_PER_SEASON=34 and wrapped builds into the next season once
  // start_day + duration > 34. Cup-day interleaving made the actual season
  // 42 game days, so the wrap was premature and the affected stadium/building
  // builds stayed stuck on "wird heute fertiggestellt" — completeXConstructions
  // checks end_season < current_season, which was never true while still in
  // the same real season. Recompute the correct end with the actual season
  // length so they finish on schedule (some immediately on the next cron tick).
  name: 'Fix stuck stadium and building constructions caused by hardcoded 34-day season wrap',
  async run () {
    const { calculateConstructionEndDate } = await import('./helper/stadiumHelper.js')
    const { BUILDING_UPGRADES } = await import('./helper/buildingHelper.js')
    const { getGameDayAndSeason } = await import('./helper/gameDayHelper.js')
    const { season: currentSeason } = await getGameDayAndSeason()

    let fixedStadiums = 0
    const stands = ['north', 'south', 'east', 'west']
    for (const stand of stands) {
      const stuck = await query(`
        SELECT s.id AS stadium_id,
               s.${stand}_construction_end_game_day AS end_day,
               s.${stand}_construction_end_season AS end_season,
               h.started_game_day, h.started_season, h.old_size, h.new_size, h.added_roof
        FROM stadium s
        JOIN stadium_construction_history h
          ON h.stadium_id = s.id AND h.stand = ? AND h.completed_game_day IS NULL
        WHERE s.${stand}_construction_end_game_day IS NOT NULL
      `, [stand])

      for (const r of stuck) {
        const seatsDiff = r.new_size - r.old_size
        // Use the OLD formula here: users paid the OLD price for that duration.
        const baseTime = Math.max(3, Math.ceil(seatsDiff / 1000))
        const roofTime = r.added_roof ? 3 : 0
        const duration = baseTime + roofTime
        const { endGameDay, endSeason } = await calculateConstructionEndDate(
          r.started_game_day, r.started_season, duration
        )
        if (endGameDay !== r.end_day || endSeason !== r.end_season) {
          await query(
            `UPDATE stadium SET ${stand}_construction_end_game_day=?, ${stand}_construction_end_season=? WHERE id=?`,
            [endGameDay, endSeason, r.stadium_id]
          )
          fixedStadiums++
        }
      }
    }

    // Buildings: no started_* columns, so reverse-engineer the start from the
    // buggy wrap. Max upgrade duration is 17 days < 34, so at most one wrap.
    let fixedBuildings = 0
    const stuckBuildings = await query(`
      SELECT id, type, construction_target_level, construction_end_game_day, construction_end_season
      FROM building
      WHERE construction_end_game_day IS NOT NULL
    `)
    for (const b of stuckBuildings) {
      const upgrade = BUILDING_UPGRADES[`${b.type}_${b.construction_target_level}`]
      if (!upgrade) continue
      const duration = upgrade.constructionDays
      // Buggy total day count is preserved across the wrap: total = season*34 + day.
      // start_total_buggy = end_total_buggy - duration. Pick the (season, day)
      // representation that has the highest season ≤ currentSeason (builds can
      // only be placed in the current season or earlier). startDay may exceed
      // 34 — that's fine, the buggy wrap is undone here so the new logic can
      // re-wrap using the actual season length.
      const endTotalBuggy = b.construction_end_season * 34 + b.construction_end_game_day
      const startTotalBuggy = endTotalBuggy - duration
      let startSeason = currentSeason
      let startDay = startTotalBuggy - startSeason * 34
      while (startDay < 0 && startSeason > 0) {
        startSeason--
        startDay += 34
      }
      const { endGameDay, endSeason } = await calculateConstructionEndDate(startDay, startSeason, duration)
      if (endGameDay !== b.construction_end_game_day || endSeason !== b.construction_end_season) {
        await query(
          'UPDATE building SET construction_end_game_day=?, construction_end_season=? WHERE id=?',
          [endGameDay, endSeason, b.id]
        )
        fixedBuildings++
      }
    }

    console.log(`🛠️ Fixed ${fixedStadiums} stuck stadium stand(s) and ${fixedBuildings} stuck building(s)`)
  }
}, {
  // Standings now count forfeit games as games played (with no points/goals)
  // and the results UI labels them "abges.". Cached standings were computed
  // when forfeits were skipped entirely, so drop them for any league that has
  // forfeit games and let getStanding recompute on next request.
  name: 'Drop standing_cache for leagues with forfeit games',
  async run () {
    const leagues = await query(
      'SELECT DISTINCT season, level, league FROM game WHERE is_forfeit=1'
    )
    let droppedRows = 0
    for (const { season, level, league } of leagues) {
      const dr = await query(
        'DELETE FROM standing_cache WHERE season=? AND level=? AND league=?',
        [season, level, league]
      )
      droppedRows += dr.affectedRows
    }
    if (droppedRows > 0) {
      console.log(`🗑️ Dropped ${droppedRows} stale standing_cache row(s) for ${leagues.length} affected league(s)`)
    }
  }
}, {
  name: 'Add type column to log_message table',
  async run () {
    await query("ALTER TABLE log_message ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'info';")
  }
}, {
  name: 'Backfill log_message type column based on icon and content',
  async run () {
    // Warnings: explicit "Warning:"/"Warnung:" prefix or the warning icon.
    await query("UPDATE log_message SET type='warning' WHERE type='info' AND (message LIKE 'Warning:%' OR message LIKE 'Warnung:%' OR icon='exclamation-triangle')")
    // Danger: negative outcomes — relegations, injuries, suspensions, rejected offers, cup eliminations.
    // Cup losses share the trophy icon with cup wins, so detect them by text first.
    await query("UPDATE log_message SET type='danger' WHERE type='info' AND (icon IN ('arrow-down', 'medkit', 'ban', 'times-circle') OR message LIKE 'Pokal-Aus%' OR message LIKE 'Cup elimination%')")
    // Success: positive outcomes — promotions, trophies, recoveries, signings, level-ups, money, star/youth/level cards.
    await query("UPDATE log_message SET type='success' WHERE type='info' AND icon IN ('trophy', 'arrow-up', 'star', 'heartbeat', 'money', 'level-up', 'child', 'pencil')")
  }
}, {
  name: 'Add season column to action_card table',
  async run () {
    await query('ALTER TABLE action_card ADD COLUMN season INT DEFAULT NULL')
    // Backfill existing NEW_YOUTH_PLAYER cards with the current season so the
    // "guarantee a youth card per season" rule doesn't double-grant right
    // after migration.
    const [current] = await query('SELECT MAX(season) AS season FROM game WHERE played=1')
    const currentSeason = current?.season ?? null
    if (currentSeason !== null) {
      await query("UPDATE action_card SET season=? WHERE action='NEW_YOUTH_PLAYER' AND season IS NULL", [currentSeason])
    }
  }
}, {
  name: 'Create user_friend Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS user_friend (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT(20) NOT NULL,
      friend_user_id BIGINT(20) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_friend (user_id, friend_user_id),
      INDEX idx_user_friend_user (user_id),
      INDEX idx_user_friend_friend (friend_user_id)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Add allow_instant_buy column to trade_offer table',
  async run () {
    await query('ALTER TABLE trade_offer ADD COLUMN allow_instant_buy TINYINT(1) NOT NULL DEFAULT 1')
  }
}, {
  name: 'Add weekly_active_users column to statistics',
  async run () {
    await query('ALTER TABLE statistics ADD COLUMN weekly_active_users INT NOT NULL DEFAULT 0')
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
