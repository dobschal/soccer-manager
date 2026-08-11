import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()

vi.mock('../lib/database.js', () => ({ query: (...args) => query(...args) }))

const { convertLegacyTablesToUtf8mb4 } = await import('../migrate-database.js')

describe('convertLegacyTablesToUtf8mb4', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('converts every table that is still on utf8mb3', async () => {
    query.mockResolvedValueOnce([{ name: 'team_lineup' }, { name: 'team' }])
    query.mockResolvedValue({})

    await convertLegacyTablesToUtf8mb4()

    const alters = query.mock.calls.map(([sql]) => sql).filter(sql => sql.startsWith('ALTER TABLE'))
    expect(alters).toEqual([
      'ALTER TABLE `team_lineup` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
      'ALTER TABLE `team` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
    ])
  })

  it('does nothing once every table is on utf8mb4', async () => {
    query.mockResolvedValueOnce([])

    await convertLegacyTablesToUtf8mb4()

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('only looks at base tables of the current schema', async () => {
    query.mockResolvedValueOnce([])

    await convertLegacyTablesToUtf8mb4()

    const [sql] = query.mock.calls[0]
    expect(sql).toContain('TABLE_SCHEMA = DATABASE()')
    expect(sql).toContain("TABLE_TYPE = 'BASE TABLE'")
    expect(sql).toContain("TABLE_COLLATION LIKE 'utf8mb3%'")
  })
})
