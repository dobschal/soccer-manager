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
  console.log(`\n✅ Database migration done in ${Date.now() - t1}ms.`)
  process.exit(0)
}

runMigration()
