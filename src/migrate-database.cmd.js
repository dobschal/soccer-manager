import { runMigration } from './migrate-database.js'

runMigration().then(() => process.exit(0))
