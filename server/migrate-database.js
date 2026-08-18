import { query } from './lib/database.js'
import { randomItem } from '../client/lib/randomItem.js'
import { EMBLEM_COLORS, EMBLEM_PATTERNS, EMBLEM_SHAPES, adjustBrightness } from '../client/util/emblemGenerator.js'
import { _getBotPlayerLevelRange, _getBotStadiumConfig } from './prepare-season.js'
import { WIKI_SEED } from './data/wikiSeed.js'
import { cachePlayerStatsForGameDay } from './helper/playerStatsHelper.js'
import { ensurePlayableAudio, UNIVERSAL_AUDIO_EXTENSIONS } from './lib/audioTranscode.js'
import { getGameDayAndSeason } from './helper/gameDayHelper.js'

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
}, {
  name: 'Add email columns to user table',
  async run () {
    await query('ALTER TABLE user ADD COLUMN email VARCHAR(255) DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN pending_email VARCHAR(255) DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN email_verification_token VARCHAR(128) DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN email_verification_expires_at TIMESTAMP NULL DEFAULT NULL')
    // Unique index on email (NULLs are allowed multiple times in MySQL UNIQUE indexes)
    await query('CREATE UNIQUE INDEX uq_user_email ON user (email)')
    await query('CREATE INDEX idx_user_email_verification_token ON user (email_verification_token)')
  }
}, {
  name: 'Add password reset columns to user table',
  async run () {
    await query('ALTER TABLE user ADD COLUMN password_reset_token VARCHAR(128) DEFAULT NULL')
    await query('ALTER TABLE user ADD COLUMN password_reset_expires_at TIMESTAMP NULL DEFAULT NULL')
    await query('CREATE INDEX idx_user_password_reset_token ON user (password_reset_token)')
  }
}, {
  name: 'Create tv_money_payout table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS tv_money_payout (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      season INT NOT NULL,
      team_id BIGINT(20) UNSIGNED NOT NULL,
      level INT NOT NULL,
      league INT NOT NULL,
      rank_in_league INT NOT NULL,
      value INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_tv_money_season_team (season, team_id),
      INDEX idx_tv_money_season (season)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Randomly assign new skin_color 3 to bot team players',
  async run () {
    await query(`UPDATE player p
                 JOIN team t ON t.id = p.team_id
                 SET p.skin_color = 3
                 WHERE t.user_id IS NULL
                   AND RAND() < 0.25`)
    await query(`UPDATE youth_player yp
                 JOIN team t ON t.id = yp.team_id
                 SET yp.skin_color = 3
                 WHERE t.user_id IS NULL
                   AND RAND() < 0.25`)
  }
}, {
  name: 'Add short_name column to team table',
  async run () {
    await query('ALTER TABLE team ADD COLUMN short_name VARCHAR(32) DEFAULT NULL')
  }
}, {
  name: 'Add new_user_count column to statistics',
  async run () {
    await query('ALTER TABLE statistics ADD COLUMN new_user_count INT NOT NULL DEFAULT 0')
  }
}, {
  name: 'Create match_day_recap table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS match_day_recap
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        game_day INT NOT NULL,
        season INT NOT NULL,
        level INT NOT NULL,
        league INT NOT NULL,
        locale VARCHAR(5) NOT NULL DEFAULT 'en',
        title VARCHAR(255) NOT NULL,
        text TEXT NOT NULL,
        image_player_id BIGINT(20) UNSIGNED DEFAULT NULL,
        image_team_id BIGINT(20) UNSIGNED DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_recap_lookup (season, game_day, level, league, locale)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`)
  }
}, {
  name: 'Drop news, news_like and news_comment tables',
  async run () {
    await query('DROP TABLE IF EXISTS news_comment')
    await query('DROP TABLE IF EXISTS news_like')
    await query('DROP TABLE IF EXISTS news')
  }
}, {
  name: 'Seed youth_academy building for all teams',
  async run () {
    const teams = await query('SELECT id FROM team')
    for (const team of teams) {
      const existing = await query("SELECT id FROM building WHERE team_id=? AND type='youth_academy' LIMIT 1", [team.id])
      if (existing.length === 0) {
        await query('INSERT INTO building SET ?', {
          team_id: team.id,
          type: 'youth_academy',
          level: 1
        })
      }
    }
    console.log(`✅ Seeded ${teams.length} teams with youth_academy level 1`)
  }
}, {
  name: 'Convert legacy NEW_YOUTH_PLAYER action cards to NEW_YOUTH_PLAYER_1',
  async run () {
    const result = await query("UPDATE action_card SET action='NEW_YOUTH_PLAYER_1' WHERE action='NEW_YOUTH_PLAYER'")
    console.log(`✅ Converted ${result.affectedRows || 0} legacy NEW_YOUTH_PLAYER cards to NEW_YOUTH_PLAYER_1`)
  }
}, {
  name: 'Add youth_options column to action_card',
  async run () {
    await query('ALTER TABLE action_card ADD COLUMN youth_options TEXT DEFAULT NULL')
  }
}, {
  name: 'Bump youth_academy buildings from level 0 to level 1',
  async run () {
    const result = await query("UPDATE building SET level=1 WHERE type='youth_academy' AND level=0")
    console.log(`✅ Bumped ${result.affectedRows || 0} youth_academy buildings from level 0 to level 1`)
  }
}, {
  name: 'Add coach_since column to team table',
  async run () {
    await query('ALTER TABLE team ADD COLUMN coach_since TIMESTAMP NULL DEFAULT NULL')
    await query('UPDATE team SET coach_since = created_at WHERE user_id IS NOT NULL AND coach_since IS NULL')
  }
}, {
  name: 'Re-backfill coach_since with user.created_at when before user registration',
  async run () {
    const result = await query(`
      UPDATE team t
      JOIN user u ON u.id = t.user_id
      SET t.coach_since = u.created_at
      WHERE t.coach_since IS NOT NULL AND t.coach_since < u.created_at
    `)
    console.log(`✅ Re-backfilled coach_since for ${result.affectedRows || 0} teams`)
  }
}, {
  name: 'Create app_setting table for admin-configurable values',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS app_setting (
      setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
      setting_value VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`)
  }
}, {
  name: 'Create referral_invitation table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS referral_invitation (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      inviter_user_id BIGINT UNSIGNED NOT NULL,
      email VARCHAR(255) NOT NULL,
      used_by_user_id BIGINT UNSIGNED DEFAULT NULL,
      reward_action VARCHAR(64) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      used_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_referral_email (email),
      INDEX idx_referral_inviter (inviter_user_id)
    )`)
  }
}, {
  name: 'Seed default referral benefit setting',
  async run () {
    await query(
      `INSERT INTO app_setting (setting_key, setting_value) VALUES ('referral_benefit', 'BONUS_100K')
       ON DUPLICATE KEY UPDATE setting_value = setting_value`
    )
  }
}, {
  name: 'Create notification_email table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS notification_email (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      body_text TEXT NOT NULL,
      image_filename VARCHAR(255) NOT NULL,
      image_token VARCHAR(64) NOT NULL,
      recipient_count INT NOT NULL DEFAULT 0,
      open_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_notification_email_token (image_token),
      INDEX idx_notification_email_created (created_at)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }
}, {
  name: 'Add rewarded_at to referral_invitation for deferred bonus',
  async run () {
    await query('ALTER TABLE referral_invitation ADD COLUMN rewarded_at TIMESTAMP NULL DEFAULT NULL')
    // Backfill: any invitations that were already used by an existing user are
    // treated as already-rewarded so the new flow doesn't double-grant cards.
    await query('UPDATE referral_invitation SET rewarded_at=used_at WHERE used_by_user_id IS NOT NULL AND rewarded_at IS NULL')
  }
}, {
  name: 'Add is_archived to forum_post',
  async run () {
    await query('ALTER TABLE forum_post ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0')
  }
}, {
  name: 'Create forum_mention table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS forum_mention (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      mentioned_user_id BIGINT(20) NOT NULL,
      author_user_id BIGINT(20) NOT NULL,
      post_id BIGINT(20) UNSIGNED NOT NULL,
      comment_id BIGINT(20) UNSIGNED NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      seen_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (id),
      INDEX idx_forum_mention_user_unseen (mentioned_user_id, seen_at),
      INDEX idx_forum_mention_post (post_id)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }
}, {
  name: 'Create user_device table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS user_device (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT(20) NOT NULL,
      device_uuid VARCHAR(64) NOT NULL,
      first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_device (user_id, device_uuid),
      INDEX idx_user_device_uuid (device_uuid)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }
}, {
  name: 'Add email_opt_out column to user table',
  async run () {
    await query('ALTER TABLE user ADD COLUMN email_opt_out TINYINT(1) NOT NULL DEFAULT 0')
  }
}, {
  name: 'Create friend_post table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS friend_post (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT(20) UNSIGNED NOT NULL,
      text TEXT NOT NULL,
      image_filename VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_friend_post_user (user_id),
      INDEX idx_friend_post_created (created_at)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci`)
  }
}, {
  name: 'Create friend_post_like table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS friend_post_like (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      post_id BIGINT(20) UNSIGNED NOT NULL,
      user_id BIGINT(20) UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_friend_post_like (post_id, user_id),
      INDEX idx_friend_post_like_post (post_id)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci`)
  }
}, {
  name: 'Create friend_post_comment table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS friend_post_comment (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      post_id BIGINT(20) UNSIGNED NOT NULL,
      user_id BIGINT(20) UNSIGNED NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_friend_post_comment_post (post_id),
      INDEX idx_friend_post_comment_user (user_id)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci`)
  }
}, {
  // Stages: 0 = no warning sent, 1 = 7-day notice sent, 2 = 1-day notice sent.
  // Reset to 0 on each successful login so a returning user re-enters the
  // funnel from scratch if they go quiet again later.
  name: 'Add inactivity_warning_stage column to user table',
  async run () {
    await query('ALTER TABLE user ADD COLUMN inactivity_warning_stage TINYINT NOT NULL DEFAULT 0')
  }
}, {
  name: 'Create world_cup_game table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS world_cup_game (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      team_1_code VARCHAR(10) NOT NULL,
      team_1_name VARCHAR(64) NOT NULL,
      team_2_code VARCHAR(10) NOT NULL,
      team_2_name VARCHAR(64) NOT NULL,
      kickoff DATETIME NOT NULL,
      goals_team_1 INT DEFAULT NULL,
      goals_team_2 INT DEFAULT NULL,
      stage VARCHAR(32) NOT NULL DEFAULT 'group',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_world_cup_game_kickoff (kickoff),
      INDEX idx_world_cup_game_stage (stage)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci`)
  }
}, {
  name: 'Create world_cup_bet table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS world_cup_bet (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT(20) UNSIGNED NOT NULL,
      game_id BIGINT(20) UNSIGNED NOT NULL,
      prediction VARCHAR(10) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_world_cup_bet (user_id, game_id),
      INDEX idx_world_cup_bet_game (game_id)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci`)
  }
}, {
  name: 'Create world_cup_reward_claim table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS world_cup_reward_claim (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT(20) UNSIGNED NOT NULL,
      points_threshold INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_world_cup_reward (user_id, points_threshold)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci`)
  }
}, {
  name: 'Create world_cup_state table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS world_cup_state (
      id INT NOT NULL DEFAULT 1,
      is_concluded TINYINT(1) NOT NULL DEFAULT 0,
      star_players_awarded TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await query('INSERT IGNORE INTO world_cup_state (id, is_concluded, star_players_awarded) VALUES (1, 0, 0)')
  }
}, {
  name: 'Seed WM 2026 group-stage games',
  async run () {
    const { WORLD_CUP_2026_SEED_GAMES, nationNameByCode } = await import('./helper/worldCupSeedData.js')
    const names = nationNameByCode()
    for (const fixture of WORLD_CUP_2026_SEED_GAMES) {
      // Convert ISO UTC string to MySQL DATETIME format. The kickoff column is
      // DATETIME (not TIMESTAMP) so the server tz doesn't shift the stored value.
      const utcDate = new Date(fixture.kickoffUtc)
      const kickoff = utcDate.toISOString().slice(0, 19).replace('T', ' ')
      await query(
        `INSERT INTO world_cup_game (team_1_code, team_1_name, team_2_code, team_2_name, kickoff, stage)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          fixture.team1Code,
          names[fixture.team1Code] || fixture.team1Code,
          fixture.team2Code,
          names[fixture.team2Code] || fixture.team2Code,
          kickoff,
          fixture.stage
        ]
      )
    }
  }
}, {
  // The original seed used invented fixtures; replace with the official FIFA
  // draw. Safe to wipe bets here because the tournament has not kicked off yet.
  name: 'Reseed WM 2026 with official FIFA group-stage fixtures',
  async run () {
    await query('DELETE FROM world_cup_bet')
    await query('DELETE FROM world_cup_game')
    const { WORLD_CUP_2026_SEED_GAMES, nationNameByCode } = await import('./helper/worldCupSeedData.js')
    const names = nationNameByCode()
    for (const fixture of WORLD_CUP_2026_SEED_GAMES) {
      const utcDate = new Date(fixture.kickoffUtc)
      const kickoff = utcDate.toISOString().slice(0, 19).replace('T', ' ')
      await query(
        `INSERT INTO world_cup_game (team_1_code, team_1_name, team_2_code, team_2_name, kickoff, stage)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          fixture.team1Code,
          names[fixture.team1Code] || fixture.team1Code,
          fixture.team2Code,
          names[fixture.team2Code] || fixture.team2Code,
          kickoff,
          fixture.stage
        ]
      )
    }
  }
}, {
  name: 'Add training_mode column to youth_player table',
  async run () {
    await query("ALTER TABLE youth_player ADD COLUMN training_mode VARCHAR(20) DEFAULT NULL")
  }
}, {
  name: 'Create user_team_history table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS user_team_history (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      team_id BIGINT NOT NULL,
      start_season INT NOT NULL DEFAULT 0,
      end_season INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_uth_user (user_id),
      INDEX idx_uth_team (team_id)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8mb4`)
  }
}, {
  name: 'Backfill user_team_history from current team ownership',
  async run () {
    const [g] = await query('SELECT season FROM game ORDER BY season DESC LIMIT 1')
    const season = g?.season ?? 0
    await query(
      `INSERT INTO user_team_history (user_id, team_id, start_season, end_season)
       SELECT user_id, id, ?, NULL FROM team WHERE user_id IS NOT NULL`,
      [season]
    )
  }
}, {
  name: 'Create user_report table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS user_report (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      reporter_user_id BIGINT(20) UNSIGNED NOT NULL,
      reported_user_id BIGINT(20) UNSIGNED NOT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (id),
      INDEX idx_user_report_reported (reported_user_id),
      INDEX idx_user_report_status (status)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }
}, {
  name: 'Create wiki_entry table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS wiki_entry (
      id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
      locale VARCHAR(5) NOT NULL DEFAULT 'en',
      title VARCHAR(255) NOT NULL,
      subtitle VARCHAR(255) DEFAULT NULL,
      text MEDIUMTEXT NOT NULL,
      images TEXT DEFAULT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_wiki_entry_locale (locale),
      INDEX idx_wiki_entry_sort (sort_order)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  }
}, {
  name: 'Seed initial wiki entries (EN/DE)',
  async run () {
    // Only seed when the wiki is still empty so we never duplicate entries an
    // admin may already have created. All entries use sort_order 0 so the
    // public list sorts alphabetically by title within each locale (#441).
    const [{ amount }] = await query('SELECT COUNT(*) AS amount FROM wiki_entry')
    if (amount > 0) return
    for (const topic of WIKI_SEED) {
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query('INSERT INTO wiki_entry SET ?', {
          locale,
          title: entry.title,
          subtitle: entry.subtitle || null,
          text: entry.text,
          images: JSON.stringify([]),
          sort_order: 0
        })
        // page_key is added by a later migration; the fresh column defaults to
        // NULL here and is backfilled from the seed keys right after.
      }
    }
  }
}, {
  name: 'Add page_key to wiki_entry and backfill from seed (#456)',
  async run () {
    // page_key links in-game pages to their wiki article in a locale-independent
    // way (the info icon behind page headings, #456).
    const [existing] = await query("SHOW COLUMNS FROM wiki_entry LIKE 'page_key'")
    if (!existing) {
      await query('ALTER TABLE wiki_entry ADD COLUMN page_key VARCHAR(64) DEFAULT NULL')
      await query('ALTER TABLE wiki_entry ADD INDEX idx_wiki_entry_page_key (page_key)')
    }
    // Backfill existing rows (prod was seeded before this column existed) by
    // matching the seeded titles per locale. Admin-renamed entries simply keep
    // a null page_key and won't be linked — that's acceptable.
    for (const topic of WIKI_SEED) {
      if (!topic.key) continue
      for (const locale of ['en', 'de']) {
        await query(
          'UPDATE wiki_entry SET page_key=? WHERE locale=? AND title=? AND (page_key IS NULL OR page_key="")',
          [topic.key, locale, topic[locale].title]
        )
      }
    }
  }
}, {
  name: 'Recompute player_season_stats from league games only (#464)',
  async run () {
    // Cup/friendly goals were previously cached into player_season_stats and
    // polluted the per-league top-scorer lists with players from other leagues.
    // Rebuild the table from league games only using the fixed cache logic.
    await query('DELETE FROM player_season_stats')
    const days = await query(
      `SELECT DISTINCT season, game_day FROM game
       WHERE played = 1 AND details IS NOT NULL AND (game_type = 'league' OR game_type IS NULL)
       ORDER BY season ASC, game_day ASC`
    )
    for (const { season, game_day: gameDay } of days) {
      await cachePlayerStatsForGameDay(gameDay, season)
    }
  }
}, {
  name: 'Create link_invite table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS link_invite (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      inviter_user_id BIGINT UNSIGNED NOT NULL,
      invitee_ip VARCHAR(45) NOT NULL,
      used_by_user_id BIGINT UNSIGNED DEFAULT NULL,
      reward_action VARCHAR(64) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      used_at TIMESTAMP NULL DEFAULT NULL,
      rewarded_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_link_invite_ip (invitee_ip),
      INDEX idx_link_invite_inviter (inviter_user_id)
    )`)
  }
}, {
  name: 'Insert missing seed wiki entries by page_key (#456)',
  async run () {
    // The original seed only runs on an empty wiki, so wiki topics added to
    // WIKI_SEED after prod was first seeded never get inserted. Backfill any
    // seed topic whose page_key is not present yet, per locale. Idempotent:
    // topics that already exist (by page_key) are skipped.
    for (const topic of WIKI_SEED) {
      if (!topic.key) continue
      for (const locale of ['en', 'de']) {
        const [existing] = await query(
          'SELECT id FROM wiki_entry WHERE page_key=? AND locale=? LIMIT 1',
          [topic.key, locale]
        )
        if (existing) continue
        const entry = topic[locale]
        await query('INSERT INTO wiki_entry SET ?', {
          locale,
          page_key: topic.key,
          title: entry.title,
          subtitle: entry.subtitle || null,
          text: entry.text,
          images: JSON.stringify([]),
          sort_order: 0
        })
      }
    }
  }
}, {
  name: 'Refresh stale wiki entries and add in-game-level topic',
  async run () {
    // Overwrite entries whose content has drifted from the game:
    // - tv-money: base is 150k (not 100k), factor 0.75 (not 0.5), payout is (N − rank + 1) × base.
    // - cup / match-simulation: cup ties now go to 30 min extra time and then a penalty shootout.
    // - action-cards: NEW_YOUTH_PLAYER has three tiers tied to Youth Academy level.
    // Also insert the in-game-level topic (added after the earlier "Insert missing seed" migration
    // was already recorded as done on prod, so that migration won't pick it up).
    const KEYS_TO_REFRESH = ['action-cards', 'cup', 'match-simulation', 'tv-money']
    const KEYS_TO_ADD = ['in-game-level']
    for (const topic of WIKI_SEED) {
      if (KEYS_TO_REFRESH.includes(topic.key)) {
        for (const locale of ['en', 'de']) {
          const entry = topic[locale]
          await query(
            'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
            [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
          )
        }
      }
      if (KEYS_TO_ADD.includes(topic.key)) {
        for (const locale of ['en', 'de']) {
          const [existing] = await query(
            'SELECT id FROM wiki_entry WHERE page_key=? AND locale=? LIMIT 1',
            [topic.key, locale]
          )
          if (existing) continue
          const entry = topic[locale]
          await query('INSERT INTO wiki_entry SET ?', {
            locale,
            page_key: topic.key,
            title: entry.title,
            subtitle: entry.subtitle || null,
            text: entry.text,
            images: JSON.stringify([]),
            sort_order: 0
          })
        }
      }
    }
  }
}, {
  name: 'Create page_view table (#498)',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS page_view
    (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id    BIGINT NULL,
        client_id  VARCHAR(64) NULL,
        page       VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_page_view_page (page),
        INDEX idx_page_view_created (created_at),
        INDEX idx_page_view_client (client_id)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create action-card marketplace tables (#476)',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS action_card_offer
    (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        action_card_id BIGINT NOT NULL,
        action        VARCHAR(255) NOT NULL,
        from_team_id  BIGINT NOT NULL,
        comment       VARCHAR(255) NULL,
        status        VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_aco_status (status),
        INDEX idx_aco_from_team (from_team_id)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8;`)
    await query(`CREATE TABLE IF NOT EXISTS action_card_bid
    (
        id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        offer_id       BIGINT NOT NULL,
        bidder_team_id BIGINT NOT NULL,
        money          INT NOT NULL DEFAULT 0,
        comment        VARCHAR(255) NULL,
        status         VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_acb_offer (offer_id),
        INDEX idx_acb_bidder (bidder_team_id),
        INDEX idx_acb_status (status)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8;`)
    await query(`CREATE TABLE IF NOT EXISTS action_card_bid_card
    (
        id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        bid_id         BIGINT NOT NULL,
        action_card_id BIGINT NOT NULL,
        action         VARCHAR(255) NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_acbc_bid (bid_id)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create chat_message table (#490)',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS chat_message
    (
        id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        from_user_id BIGINT NOT NULL,
        to_user_id   BIGINT NOT NULL,
        text         TEXT NULL,
        image        VARCHAR(255) NULL,
        read_at      TIMESTAMP NULL DEFAULT NULL,
        created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_chat_from (from_user_id),
        INDEX idx_chat_to (to_user_id),
        INDEX idx_chat_pair (from_user_id, to_user_id),
        INDEX idx_chat_unread (to_user_id, read_at)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Add last-spied-team columns to team (spy report)',
  async run () {
    await query('ALTER TABLE team ADD COLUMN last_spied_team_id BIGINT NULL DEFAULT NULL')
    await query('ALTER TABLE team ADD COLUMN last_spied_at TIMESTAMP NULL DEFAULT NULL')
  }
}, {
  name: 'Card offers: multi-card bundles + trade history',
  async run () {
    // A single offer can now bundle several cards — mirror the many-cards join
    // table that already exists for bids (action_card_bid_card).
    await query(`CREATE TABLE IF NOT EXISTS action_card_offer_card
    (
        id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        offer_id       BIGINT NOT NULL,
        action_card_id BIGINT NOT NULL,
        action         VARCHAR(255) NOT NULL,
        PRIMARY KEY (id),
        INDEX idx_acoc_offer (offer_id)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8;`)
    // Backfill existing single-card offers into the join table so old offers
    // keep working under the new multi-card code path. Runs exactly once.
    await query(`INSERT INTO action_card_offer_card (offer_id, action_card_id, action)
                 SELECT id, action_card_id, action FROM action_card_offer
                 WHERE action_card_id IS NOT NULL`)
    // The scalar card columns on the offer row are now legacy — the join table
    // is the source of truth, so they no longer have to be populated.
    await query('ALTER TABLE action_card_offer MODIFY COLUMN action_card_id BIGINT NULL')
    await query('ALTER TABLE action_card_offer MODIFY COLUMN action VARCHAR(255) NULL')
    // Record when an offer settled so the trade-history view can order/show it.
    await query('ALTER TABLE action_card_offer ADD COLUMN settled_at TIMESTAMP NULL DEFAULT NULL')
    await query("UPDATE action_card_offer SET settled_at = created_at WHERE status='accepted' AND settled_at IS NULL")
  }
}, {
  name: 'Wiki: refresh action-cards, add marketplace + chat topics',
  async run () {
    // The initial seed only runs on an empty wiki, so new/changed topics must be
    // applied to already-seeded prod/sandbox DBs here. Idempotent:
    // - action-cards: refreshed to add the Spy card and the per-type / youth caps.
    // - action-card-market, chat: inserted only when not already present (by page_key).
    const KEYS_TO_REFRESH = ['action-cards']
    const KEYS_TO_ADD = ['action-card-market', 'chat']
    for (const topic of WIKI_SEED) {
      if (KEYS_TO_REFRESH.includes(topic.key)) {
        for (const locale of ['en', 'de']) {
          const entry = topic[locale]
          await query(
            'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
            [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
          )
        }
      }
      if (KEYS_TO_ADD.includes(topic.key)) {
        for (const locale of ['en', 'de']) {
          const [existing] = await query(
            'SELECT id FROM wiki_entry WHERE page_key=? AND locale=? LIMIT 1',
            [topic.key, locale]
          )
          if (existing) continue
          const entry = topic[locale]
          await query('INSERT INTO wiki_entry SET ?', {
            locale,
            page_key: topic.key,
            title: entry.title,
            subtitle: entry.subtitle || null,
            text: entry.text,
            images: JSON.stringify([]),
            sort_order: 0
          })
        }
      }
    }
  }
}, {
  name: 'chat_message: convert to utf8mb4 (emoji support)',
  async run () {
    // The table was created with 3-byte utf8mb3, so 4-byte characters (most
    // emoji) can't be stored — inserting one throws "Incorrect string value"
    // and the whole message fails to send. Convert to utf8mb4 so emoji work.
    await query('ALTER TABLE chat_message CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  }
}, {
  name: 'Add corner stands to stadium table',
  async run () {
    // Four corner stands (NE/NW/SE/SW). Existing stadiums start with corner
    // size 0 (no corners yet), default price 13, no roof. Construction columns
    // mirror the main stands' tracking columns and default to NULL.
    const corners = ['corner_ne', 'corner_nw', 'corner_se', 'corner_sw']
    for (const corner of corners) {
      await query(`ALTER TABLE stadium
        ADD COLUMN ${corner}_stand_size INT DEFAULT 0,
        ADD COLUMN ${corner}_stand_price INT DEFAULT 13,
        ADD COLUMN ${corner}_stand_roof TINYINT(1) DEFAULT 0,
        ADD COLUMN ${corner}_construction_end_game_day INT DEFAULT NULL,
        ADD COLUMN ${corner}_construction_end_season INT DEFAULT NULL,
        ADD COLUMN ${corner}_construction_target_size INT DEFAULT NULL,
        ADD COLUMN ${corner}_construction_target_roof TINYINT(1) DEFAULT NULL
      `)
    }
  }
}, {
  name: 'Add last-spied snapshot column to team (spy report is a snapshot)',
  async run () {
    // The spy report is a point-in-time snapshot taken when the SPY card is
    // played: the opponent's tactics, lineup and active motivating-speech
    // buff are frozen here so later tactic changes don't alter the report.
    await query('ALTER TABLE team ADD COLUMN last_spied_snapshot LONGTEXT NULL DEFAULT NULL')
  }
}, {
  name: 'Wiki: refresh in-game-level (subs no longer get out-of-position penalty)',
  async run () {
    // The initial seed only runs on an empty wiki, so the reworded
    // out-of-position rule must be pushed to already-seeded prod/sandbox DBs.
    const topic = WIKI_SEED.find(t => t.key === 'in-game-level')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Wiki: refresh buildings (3D club grounds + training area levels) v3',
  async run () {
    // The buildings page now opens with the 3D scene and the training ground is
    // actually built in it, so the wiki text describes what each level looks
    // like. Push it to already-seeded prod/sandbox DBs.
    const topic = WIKI_SEED.find(t => t.key === 'buildings')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Wiki: add fair-play rules topic',
  async run () {
    // Multi-accounting and arranged transfers were detected but nowhere written
    // down for players. The rules now live in their own wiki topic — insert it
    // into already-seeded prod/sandbox DBs, skipping locales that have it.
    const topic = WIKI_SEED.find(t => t.key === 'fair-play')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const [existing] = await query(
        'SELECT id FROM wiki_entry WHERE page_key=? AND locale=? LIMIT 1',
        [topic.key, locale]
      )
      if (existing) continue
      const entry = topic[locale]
      await query('INSERT INTO wiki_entry SET ?', {
        locale,
        page_key: topic.key,
        title: entry.title,
        subtitle: entry.subtitle || null,
        text: entry.text,
        images: JSON.stringify([]),
        sort_order: 0
      })
    }
  }
}, {
  name: 'Wiki: refresh transfers (75% minimum offer price)',
  async run () {
    // Sell and buy offers now both have a 75% market-value floor (#446), so the
    // transfers topic must be pushed to already-seeded prod/sandbox DBs.
    const topic = WIKI_SEED.find(t => t.key === 'transfers')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Create blocked_email table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS blocked_email
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL,
        reason VARCHAR(255) DEFAULT NULL,
        blocked_by_user_id BIGINT(20) UNSIGNED DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_blocked_email (email)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Add sessions_invalid_before to user',
  async run () {
    // JWTs are stateless, so revoking a login means recording a cut-off and
    // rejecting any token whose `iat` predates it (see the auth middleware).
    await query('ALTER TABLE user ADD COLUMN sessions_invalid_before TIMESTAMP NULL DEFAULT NULL')
  }
}, {
  name: 'Wiki: refresh fair-play (new detectors + email block)',
  async run () {
    // Detection now also covers action-card auctions and self-claimed invite
    // rewards, and a confirmed cheat can be blocked instead of only deleted.
    const topic = WIKI_SEED.find(t => t.key === 'fair-play')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Wiki: refresh buildings (dugout benches and car park per level) v4',
  async run () {
    // The training ground now shows its level through the benches (none / open /
    // roofed and glazed) and the car park beside it (none / one / two rows), and
    // there is traffic on the roads around the club grounds.
    const topic = WIKI_SEED.find(t => t.key === 'buildings')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Wiki: refresh buildings (fitness studio in 3D) v5',
  async run () {
    // The fitness studio now has its own geometry: a glass hall with a neon
    // "Gym", a lit room whose equipment fills up per level, and a car park.
    const topic = WIKI_SEED.find(t => t.key === 'buildings')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Wiki: refresh buildings (youth academy in 3D) v6',
  async run () {
    // The youth academy now has its own geometry too: a block with a tall
    // entrance bay carrying the club's own emblem, a roof terrace and a recessed
    // top floor, its own half-size pitch and a car park.
    const topic = WIKI_SEED.find(t => t.key === 'buildings')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Wiki: refresh buildings + stadium (time-of-day slider) v7',
  async run () {
    // The 3D view now follows the player's own clock and has a slider for dawn /
    // day / dusk / night under it — it appears on both pages that show the scene.
    for (const key of ['buildings', 'stadium']) {
      const topic = WIKI_SEED.find(t => t.key === key)
      if (!topic) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: refresh buildings (clubhouse on the training ground) v8',
  async run () {
    // The training ground now has a clubhouse north of the pitch that grows with
    // its level.
    const topic = WIKI_SEED.find(t => t.key === 'buildings')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Wiki: refresh buildings (card images taken from the 3D scene) v9',
  async run () {
    // The building cards no longer show a painted level image but a still of the
    // player's own building, cropped out of the 3D scene above them.
    const topic = WIKI_SEED.find(t => t.key === 'buildings')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Seed medical_practice building for all teams',
  async run () {
    // Level 0 — unlike the other three this one is not there from the start, it
    // has to be built. The row only exists so `upgradeBuilding` has something to
    // raise to level 1.
    const teams = await query('SELECT id FROM team')
    for (const team of teams) {
      const existing = await query("SELECT id FROM building WHERE team_id=? AND type='medical_practice' LIMIT 1", [team.id])
      if (existing.length === 0) {
        await query('INSERT INTO building SET ?', {
          team_id: team.id,
          type: 'medical_practice',
          level: 0
        })
      }
    }
    console.log(`✅ Seeded ${teams.length} teams with medical_practice level 0`)
  }
}, {
  name: 'Wiki: refresh buildings and action cards (medical practice) v10',
  async run () {
    for (const key of ['buildings', 'action-cards', 'players']) {
      const topic = WIKI_SEED.find(t => t.key === key)
      if (!topic) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Create team_lineup tables (#481)',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS team_lineup
    (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        team_id     BIGINT NOT NULL,
        name        VARCHAR(40) NOT NULL,
        formation   VARCHAR(20) NULL,
        pass_style  VARCHAR(20) NULL,
        play_style  VARCHAR(20) NULL,
        attack_mode VARCHAR(20) NULL,
        captain_id  BIGINT NULL,
        is_active   TINYINT(1) NOT NULL DEFAULT 0,
        created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_team_lineup_team (team_id),
        INDEX idx_team_lineup_active (team_id, is_active)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8;`)
    await query(`CREATE TABLE IF NOT EXISTS team_lineup_player
    (
        id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        lineup_id              BIGINT UNSIGNED NOT NULL,
        player_id              BIGINT NOT NULL,
        in_game_position       VARCHAR(20) NULL,
        bench_position         VARCHAR(20) NULL,
        bench_substitution_mode VARCHAR(20) NULL,
        PRIMARY KEY (id),
        INDEX idx_team_lineup_player_lineup (lineup_id),
        UNIQUE KEY uniq_team_lineup_player (lineup_id, player_id)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Seed a default lineup per team from its current setup (#481)',
  async run () {
    // Only real managers get a slot up front. Bots never go through the
    // routes that read or write lineups, and a team taken over from a bot
    // gets one lazily via `ensureActiveLineup`.
    const teams = await query(
      'SELECT id, formation, pass_style, play_style, attack_mode, captain_id FROM team WHERE user_id IS NOT NULL'
    )
    let seeded = 0
    for (const team of teams) {
      const [existing] = await query('SELECT id FROM team_lineup WHERE team_id=? LIMIT 1', [team.id])
      if (existing) continue
      const result = await query('INSERT INTO team_lineup SET ?', {
        team_id: team.id,
        name: 'Lineup 1',
        formation: team.formation,
        pass_style: team.pass_style,
        play_style: team.play_style,
        attack_mode: team.attack_mode,
        captain_id: team.captain_id,
        is_active: 1
      })
      const players = await query(
        `SELECT id, in_game_position, bench_position, bench_substitution_mode
         FROM player
         WHERE team_id=? AND ((in_game_position IS NOT NULL AND in_game_position <> '') OR bench_position IS NOT NULL)`,
        [team.id]
      )
      for (const player of players) {
        await query('INSERT INTO team_lineup_player SET ?', {
          lineup_id: result.insertId,
          player_id: player.id,
          in_game_position: player.in_game_position || null,
          bench_position: player.bench_position || null,
          bench_substitution_mode: player.bench_substitution_mode || null
        })
      }
      seeded++
    }
    console.log(`✅ Seeded ${seeded} teams with a default lineup`)
  }
}, {
  name: 'Create user_login_streak table (#501)',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS user_login_streak
    (
        user_id         BIGINT NOT NULL,
        last_login_date DATE NOT NULL,
        streak          INT NOT NULL DEFAULT 0,
        cycle_day       INT NOT NULL DEFAULT 0,
        longest_streak  INT NOT NULL DEFAULT 0,
        rewards_claimed VARCHAR(64) NOT NULL DEFAULT '',
        updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id),
        INDEX idx_user_login_streak_streak (streak)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Wiki: daily login bonus, saved lineups, bot card bids, reports (#501/#481/#505/#489)',
  async run () {
    const KEYS_TO_REFRESH = ['lineup', 'action-card-market', 'fair-play']
    const KEYS_TO_ADD = ['daily-login']
    for (const topic of WIKI_SEED) {
      if (KEYS_TO_REFRESH.includes(topic.key)) {
        for (const locale of ['en', 'de']) {
          const entry = topic[locale]
          await query(
            'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
            [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
          )
        }
      }
      if (KEYS_TO_ADD.includes(topic.key)) {
        for (const locale of ['en', 'de']) {
          const [existing] = await query(
            'SELECT id FROM wiki_entry WHERE page_key=? AND locale=? LIMIT 1',
            [topic.key, locale]
          )
          if (existing) continue
          const entry = topic[locale]
          await query('INSERT INTO wiki_entry SET ?', {
            locale,
            page_key: topic.key,
            title: entry.title,
            subtitle: entry.subtitle || null,
            text: entry.text,
            images: JSON.stringify([]),
            sort_order: 0
          })
        }
      }
    }
  }
}, {
  name: 'Wiki: million gift card, youth sales, card stack limit (#537/#524/#506/#518)',
  async run () {
    const KEYS_TO_REFRESH = ['action-cards', 'youth-players', 'urgency-list']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: salary curve, position penalty, ticket prices, match ticker (#543/#540/#538/#539)',
  async run () {
    const KEYS_TO_REFRESH = ['in-game-level', 'players', 'stadium', 'match-day']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Add voice message columns to chat_message (#541)',
  async run () {
    await query('ALTER TABLE chat_message ADD COLUMN audio VARCHAR(255) DEFAULT NULL')
    await query('ALTER TABLE chat_message ADD COLUMN audio_duration INT DEFAULT NULL')
  }
}, {
  name: 'Wiki: recalibrated salary curve (#543)',
  async run () {
    const topic = WIKI_SEED.find(t => t.key === 'players')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Wiki: voice messages in the chat (#541)',
  async run () {
    const topic = WIKI_SEED.find(t => t.key === 'chat')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const entry = topic[locale]
      await query(
        'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
        [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
      )
    }
  }
}, {
  name: 'Create team_tour table and player tour column (#535)',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS team_tour
    (
        team_id    BIGINT NOT NULL,
        mode       VARCHAR(20) NOT NULL,
        progress   DECIMAL(10,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (team_id)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8;`)
    // Counts down one per game day; > 0 means the player is away and cannot be
    // fielded.
    await query('ALTER TABLE player ADD COLUMN tour_days_left INT NOT NULL DEFAULT 0')
  }
}, {
  name: 'Wiki: login reward cycle, lineup renaming, card count, match ticker (#501/#481/#523/#539)',
  async run () {
    const KEYS_TO_REFRESH = ['daily-login', 'lineup', 'action-cards', 'match-simulation']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: add the On Tour topic (#535)',
  async run () {
    const topic = WIKI_SEED.find(t => t.key === 'on-tour')
    if (!topic) return
    for (const locale of ['en', 'de']) {
      const [existing] = await query(
        'SELECT id FROM wiki_entry WHERE page_key=? AND locale=? LIMIT 1',
        [topic.key, locale]
      )
      if (existing) continue
      const entry = topic[locale]
      await query('INSERT INTO wiki_entry SET ?', {
        locale,
        page_key: topic.key,
        title: entry.title,
        subtitle: entry.subtitle || null,
        text: entry.text,
        images: JSON.stringify([]),
        sort_order: 0
      })
    }
  }
}, {
  name: 'Wiki: daily login rewards are collected via the gift (#501)',
  async run () {
    const KEYS_TO_REFRESH = ['daily-login']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Add player.tour_days_total so a fresh tour can be cancelled (#535)',
  async run () {
    // The duration the player was sent away for. While `tour_days_left` still
    // equals it, no match day has passed and nothing was earned — that is the
    // window in which the manager may recall them. Players already travelling
    // keep 0 and stay locked in, since we cannot tell how much they earned.
    await query('ALTER TABLE player ADD COLUMN tour_days_total INT NOT NULL DEFAULT 0')
  }
}, {
  name: 'Wiki: urgency list starts collapsed with a show-all row',
  async run () {
    const KEYS_TO_REFRESH = ['urgency-list']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  // The friends page dropped the (unused) posts feature and leads with a
  // messenger-style chat list instead.
  name: 'Wiki: friends page shows chats instead of posts',
  async run () {
    const KEYS_TO_REFRESH = ['friends', 'chat']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Backfill tour_days_total for trips that were already running (#535)',
  async run () {
    // Without this every player who was already abroad when the column arrived
    // would be stuck: `tour_days_total = 0` never equals their remaining days,
    // so the recall button never appears for them. Treating their trip as
    // not-yet-started grants one free cancellation at rollout — a one-off, and
    // far better than a button that silently does not exist.
    await query('UPDATE player SET tour_days_total = tour_days_left WHERE tour_days_left > 0 AND tour_days_total = 0')
  }
}, {
  name: 'Wiki: a fresh tour can be cancelled, bar previews the next match day (#535)',
  async run () {
    const KEYS_TO_REFRESH = ['on-tour']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: the player picker is a scrollable strip that also offers out-of-position players',
  async run () {
    const KEYS_TO_REFRESH = ['lineup']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Transcode existing WebM voice messages to m4a (#541)',
  async run () {
    // Voice messages recorded in Chrome/Firefox are WebM/Opus, which Safari and
    // the iOS WebView cannot decode — those bubbles just read "Error". New
    // uploads are converted on the way in; these are the ones already stored.
    const rows = await query('SELECT id, audio FROM chat_message WHERE audio IS NOT NULL')
    for (const { id, audio } of rows) {
      const ext = String(audio).split('.').pop().toLowerCase()
      if (UNIVERSAL_AUDIO_EXTENSIONS.has(ext)) continue
      const converted = await ensurePlayableAudio('uploads/chat', audio)
      if (converted !== audio) {
        await query('UPDATE chat_message SET audio=? WHERE id=?', [converted, id])
      }
    }
  }
}, {
  name: 'Wiki: voice recording is browser-only, not iOS (#541)',
  async run () {
    const KEYS_TO_REFRESH = ['chat']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: full out-of-position penalty table per line (#540)',
  async run () {
    const KEYS_TO_REFRESH = ['in-game-level', 'lineup']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: IOC asking prices track the market value',
  async run () {
    const KEYS_TO_REFRESH = ['transfers']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: player picker marks players already in the lineup',
  async run () {
    const KEYS_TO_REFRESH = ['lineup']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: fewer youth cards from the login bonus and South America tour',
  async run () {
    const KEYS_TO_REFRESH = ['daily-login', 'on-tour']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: offers and bids without cover are withdrawn automatically',
  async run () {
    const KEYS_TO_REFRESH = ['action-card-market']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Extend careers of players who outlived their retirement on a team',
  run: extendOverdueCarriers
}, {
  name: 'Wiki: when a player retires and what happens to him',
  async run () {
    const KEYS_TO_REFRESH = ['players']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Reset cup byes whose round has not been played yet',
  async run () {
    // Byes used to be inserted as played=1 at the moment of the draw. Cup games
    // are rendered with `created_at` as their "played at" date, so a bye showed
    // a finished match dated on the draw — days before the round is actually
    // played. Roll back the byes of every round that still has open matches;
    // the game day now resolves them together with those matches.
    const openRounds = await query(`
        SELECT DISTINCT season, cup_round AS cupRound
        FROM game
        WHERE game_type = 'cup'
          AND played = 0
    `)
    let resetCount = 0
    for (const { season, cupRound } of openRounds) {
      const { affectedRows } = await query(
        `UPDATE game
         SET played = 0, goals_team_1 = NULL, goals_team_2 = NULL
         WHERE game_type = 'cup'
           AND season = ?
           AND cup_round = ?
           AND team_2_id IS NULL
           AND played = 1`,
        [season, cupRound]
      )
      resetCount += affectedRows
    }
    if (resetCount > 0) {
      console.log(`🏆 Reset ${resetCount} cup bye(s) to unplayed until their round is reached`)
    }
  }
}, {
  name: 'Wiki: a bye only counts on its round\'s match day',
  async run () {
    const KEYS_TO_REFRESH = ['cup']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: youth promotions show up in the player history',
  async run () {
    const KEYS_TO_REFRESH = ['youth-players']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: roofs are priced per covered seat',
  async run () {
    const KEYS_TO_REFRESH = ['stadium']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Create funnel_event table for registration tracking',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS funnel_event
    (
        id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id    BIGINT NULL,
        client_id  VARCHAR(64) NULL,
        event      VARCHAR(64) NOT NULL,
        detail     VARCHAR(64) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_funnel_event_event (event),
        INDEX idx_funnel_event_created (created_at),
        INDEX idx_funnel_event_client (client_id)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;`)
  }
}, {
  name: 'Wiki: injury risk depends on player age',
  async run () {
    const KEYS_TO_REFRESH = ['players']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: steeper salary curve above level 70',
  async run () {
    const KEYS_TO_REFRESH = ['players']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: add match-report topic',
  async run () {
    const KEYS_TO_ADD = ['match-report']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_ADD.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const [existing] = await query(
          'SELECT id FROM wiki_entry WHERE page_key=? AND locale=? LIMIT 1',
          [topic.key, locale]
        )
        if (existing) continue
        const entry = topic[locale]
        await query('INSERT INTO wiki_entry SET ?', {
          locale,
          page_key: topic.key,
          title: entry.title,
          subtitle: entry.subtitle || null,
          text: entry.text,
          images: JSON.stringify([]),
          sort_order: 0
        })
      }
    }
  }
}, {
  name: 'Create game_report table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS game_report
    (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        game_id BIGINT(20) UNSIGNED NOT NULL,
        locale VARCHAR(5) NOT NULL DEFAULT 'en',
        text TEXT NOT NULL,
        model VARCHAR(128) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_game_report (game_id, locale)
    ) ENGINE=INNODB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`)
  }
}, {
  name: 'Add bot_decision_at column to trade_offer table',
  async run () {
    await query('ALTER TABLE trade_offer ADD COLUMN bot_decision_at DATETIME NULL DEFAULT NULL')
    await query('CREATE INDEX idx_trade_offer_bot_decision ON trade_offer (bot_decision_at)')
  }
}, {
  name: 'Wiki: steeper salary curve above level 70',
  async run () {
    const KEYS_TO_REFRESH = ['players']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }

}, {
  name: 'Wiki: match events in the game details, injuries last their full days',
  async run () {
    const KEYS_TO_REFRESH = ['match-simulation', 'players']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}, {
  name: 'Wiki: bot clubs answer with a delay and skip retiring players',
  async run () {
    const KEYS_TO_REFRESH = ['transfers']
    for (const topic of WIKI_SEED) {
      if (!KEYS_TO_REFRESH.includes(topic.key)) continue
      for (const locale of ['en', 'de']) {
        const entry = topic[locale]
        await query(
          'UPDATE wiki_entry SET title=?, subtitle=?, text=? WHERE page_key=? AND locale=?',
          [entry.title, entry.subtitle || null, entry.text, topic.key, locale]
        )
      }
    }
  }
}]

/**
 * Give players who are still on a team although their career ended a career
 * end of the current season.
 *
 * `givePlayerContract` used to check only whether a player was unemployed,
 * never whether their career had already ended. The season transition retires
 * everyone at 00:00, but a squad page opened before midnight kept offering
 * them — so ten already-retired players were signed in production and then
 * stayed on their teams for seasons, because nothing re-checks a career end
 * once a player has a club.
 *
 * Rather than pull them off their teams mid-season, their career is extended to
 * the current season: they finish this season like every other veteran and
 * retire through the normal path at the next transition. The guard in
 * `givePlayerContract` stops new cases.
 *
 * @returns {Promise<void>}
 */
export async function extendOverdueCarriers () {
  const [row] = await query('SELECT COUNT(*) AS games FROM game')
  // A fresh database has no games and therefore no meaningful current season.
  if (!row?.games) return
  const { season } = await getGameDayAndSeason()
  const { affectedRows } = await query(
    'UPDATE player SET carrier_end_season=? WHERE team_id IS NOT NULL AND carrier_end_season<?',
    [season, season]
  )
  if (affectedRows > 0) {
    console.log(`👴🏽 Extended ${affectedRows} overdue player carrier(s) to season ${season}.`)
  }
}

/**
 * Move every table that is not on `utf8mb4_unicode_ci` over to it (#544).
 *
 * Two problems in one sweep:
 *
 * - Most of the older tables above were created with `DEFAULT CHARSET=utf8`,
 *   which MySQL 8 maps to utf8mb3 — three bytes per character, so anything
 *   outside the BMP is rejected with ER_TRUNCATED_WRONG_VALUE_FOR_FIELD. Every
 *   emoji lives outside the BMP, which is why renaming a lineup to "😳" blew up.
 * - Tables created without an explicit `COLLATE` land on the server default
 *   (utf8mb4_0900_ai_ci on MySQL 8). Comparing such a column against one of
 *   the utf8mb4_unicode_ci columns fails with ER_CANT_AGGREGATE_2COLLATIONS.
 *
 * This runs after every migration rather than as a one-off entry, so a table
 * added later can never silently reintroduce the problem. Once everything is
 * converted it costs a single information_schema query per boot.
 *
 * @returns {Promise<void>}
 */
export async function convertLegacyTablesToUtf8mb4 () {
  const tables = await query(`SELECT TABLE_NAME AS name
                              FROM information_schema.TABLES
                              WHERE TABLE_SCHEMA = DATABASE()
                                AND TABLE_TYPE = 'BASE TABLE'
                                AND TABLE_COLLATION <> 'utf8mb4_unicode_ci'
                              ORDER BY DATA_LENGTH + INDEX_LENGTH ASC`)
  if (!tables.length) return
  console.log(`🔤 Converting ${tables.length} table(s) to utf8mb4_unicode_ci...`)
  for (const { name } of tables) {
    // Table names come from information_schema, never from user input.
    await query(`ALTER TABLE \`${name}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`)
    console.log(`  ↳ ${name}`)
  }
}

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
      ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;`)
  for (const migration of migrations) {
    const [{ amount }] = await query(`SELECT COUNT(*) AS amount
                                      FROM __migration
                                      WHERE \`name\` = "${migration.name}";`)
    if (amount > 0) continue
    await migration.run()
    await query(`INSERT INTO __migration (name)
                 VALUES ("${migration.name}");`)
  }
  await convertLegacyTablesToUtf8mb4()
  console.log(`✅ Database migration done in ${Date.now() - t1}ms.`)
}
