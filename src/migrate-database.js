import { query } from './lib/database.js'

/**
 * @typedef {Object} Migration
 * @property {string} name
 * @property {() => Promise} run
 */

/**
 * @type {Array<Migration>}
 */
const migrations = [{
  name: 'Create Stadium Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS stadium (
              id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
              team_id BIGINT(20),

              north_stand_price INT,
              south_stand_price INT,
              west_stand_price INT,
              east_stand_price INT,

              north_stand_size INT,
              south_stand_size INT,
              west_stand_size INT,
              east_stand_size INT,

              north_stand_roof TINYINT(1),
              south_stand_roof TINYINT(1),
              west_stand_roof TINYINT(1),
              east_stand_roof TINYINT(1),

              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id)
          ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Sponsor Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS sponsor (
              id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
              team_id BIGINT(20),
              start_season INT,
              start_game_day INT,
              duration INT,
              value INT,
              name VARCHAR(255),
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id)
          ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Card Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS action_card (
              id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
              user_id BIGINT(20),
              action VARCHAR(255),
              played TINYINT(1),
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id)
          ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create User Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS user (
              id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
              username VARCHAR(255) NOT NULL UNIQUE ,
              password VARCHAR(255) NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id)
          ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Team Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS team (
            id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT(20),
            name VARCHAR(255),
            formation VARCHAR(255),
            level INT,
            balance INT,
            league INT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Player Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS player (
              id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
              team_id BIGINT(20),
              name VARCHAR(255),
              position VARCHAR(255),
              in_game_position VARCHAR(255),
              carrier_start_season INT,
              carrier_end_season INT,
              level INT,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id)
          ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Game Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS game (
                id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
                season INT,
                game_day INT,
                level INT,
                league INT,
                team_1_id BIGINT(20),
                team_2_id BIGINT(20),
                played TINYINT(1),
                details TEXT,
                goals_team_1 INT,
                goals_team_2 INT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Finance Log Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS finance_log (
                id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
                season INT,
                game_day INT,
                value INT,
                balance INT,
                team_id BIGINT(20),
                reason TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Create Trade Offer Table',
  async run () {
    await query(`CREATE TABLE IF NOT EXISTS trade_offer (
                id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
                offer_value INT,
                type VARCHAR(255),
                player_id BIGINT(20),
                from_team_id BIGINT(20),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
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
    await query(`CREATE TABLE IF NOT EXISTS news (
                id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
                game_day INT,
                season INT,
                message TEXT,
                team_id BIGINT(20),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id)
            ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  }
}, {
  name: 'Alter table player to have freshness',
  async run () {
    await query('ALTER TABLE player ADD COLUMN freshness DECIMAL(6, 2) DEFAULT 1.0;')
  }
}]

export async function runMigration () {
  console.log('🚀 Database migration started...')
  const t1 = Date.now()
  await query(`CREATE TABLE IF NOT EXISTS __migration (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        name VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
    ) ENGINE=INNODB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8;`)
  for (const migration of migrations) {
    const [{ amount }] = await query(`SELECT COUNT(*) AS amount FROM __migration WHERE \`name\`="${migration.name}";`)
    if (amount > 0) continue
    await migration.run()
    await query(`INSERT INTO __migration (name) VALUES ("${migration.name}");`)
  }
  console.log(`✅ Database migration done in ${Date.now() - t1}ms.`)
}
