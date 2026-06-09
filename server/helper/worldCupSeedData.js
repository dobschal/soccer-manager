/**
 * Curated list of FIFA World Cup 2026 nations.
 *
 * The `code` is the ISO 3166-1 alpha-2 code (with FIFA-specific overrides for
 * the four UK home nations, e.g. `gb-eng`) so flag images can be loaded from
 * flagcdn.com. The `name` is the English display name used as the canonical
 * label; the client renders translated names by code when available.
 *
 * Includes the three confirmed co-hosts (USA, Canada, Mexico), all directly
 * qualified nations, and the most likely play-off contenders so the admin can
 * pick any opponent from the dropdown when adding knockout-stage games.
 *
 * @type {{ code: string, name: string }[]}
 */
export const WORLD_CUP_NATIONS = [
  { code: 'us', name: 'United States' },
  { code: 'ca', name: 'Canada' },
  { code: 'mx', name: 'Mexico' },
  { code: 'ar', name: 'Argentina' },
  { code: 'br', name: 'Brazil' },
  { code: 'uy', name: 'Uruguay' },
  { code: 'co', name: 'Colombia' },
  { code: 'ec', name: 'Ecuador' },
  { code: 'pe', name: 'Peru' },
  { code: 'cl', name: 'Chile' },
  { code: 'py', name: 'Paraguay' },
  { code: 'bo', name: 'Bolivia' },
  { code: 'de', name: 'Germany' },
  { code: 'fr', name: 'France' },
  { code: 'es', name: 'Spain' },
  { code: 'pt', name: 'Portugal' },
  { code: 'it', name: 'Italy' },
  { code: 'nl', name: 'Netherlands' },
  { code: 'be', name: 'Belgium' },
  { code: 'ch', name: 'Switzerland' },
  { code: 'at', name: 'Austria' },
  { code: 'hr', name: 'Croatia' },
  { code: 'rs', name: 'Serbia' },
  { code: 'pl', name: 'Poland' },
  { code: 'dk', name: 'Denmark' },
  { code: 'no', name: 'Norway' },
  { code: 'se', name: 'Sweden' },
  { code: 'tr', name: 'Turkey' },
  { code: 'ua', name: 'Ukraine' },
  { code: 'cz', name: 'Czech Republic' },
  { code: 'gr', name: 'Greece' },
  { code: 'hu', name: 'Hungary' },
  { code: 'ro', name: 'Romania' },
  { code: 'al', name: 'Albania' },
  { code: 'ie', name: 'Ireland' },
  { code: 'gb-eng', name: 'England' },
  { code: 'gb-sct', name: 'Scotland' },
  { code: 'gb-wls', name: 'Wales' },
  { code: 'gb-nir', name: 'Northern Ireland' },
  { code: 'is', name: 'Iceland' },
  { code: 'jp', name: 'Japan' },
  { code: 'kr', name: 'South Korea' },
  { code: 'ir', name: 'Iran' },
  { code: 'sa', name: 'Saudi Arabia' },
  { code: 'qa', name: 'Qatar' },
  { code: 'ae', name: 'United Arab Emirates' },
  { code: 'iq', name: 'Iraq' },
  { code: 'au', name: 'Australia' },
  { code: 'uz', name: 'Uzbekistan' },
  { code: 'jo', name: 'Jordan' },
  { code: 'ma', name: 'Morocco' },
  { code: 'sn', name: 'Senegal' },
  { code: 'ci', name: 'Ivory Coast' },
  { code: 'ng', name: 'Nigeria' },
  { code: 'gh', name: 'Ghana' },
  { code: 'cm', name: 'Cameroon' },
  { code: 'tn', name: 'Tunisia' },
  { code: 'eg', name: 'Egypt' },
  { code: 'dz', name: 'Algeria' },
  { code: 'za', name: 'South Africa' },
  { code: 'cv', name: 'Cape Verde' },
  { code: 'cr', name: 'Costa Rica' },
  { code: 'pa', name: 'Panama' },
  { code: 'hn', name: 'Honduras' },
  { code: 'jm', name: 'Jamaica' },
  { code: 'nz', name: 'New Zealand' },
  { code: 'ba', name: 'Bosnia and Herzegovina' },
  { code: 'ht', name: 'Haiti' },
  { code: 'cw', name: 'Curaçao' },
  { code: 'cd', name: 'DR Congo' }
]

/**
 * Build a quick lookup by code.
 * @returns {Record<string, string>}
 */
export function nationNameByCode () {
  const map = {}
  for (const n of WORLD_CUP_NATIONS) {
    map[n.code] = n.name
  }
  return map
}

/**
 * Official FIFA World Cup 2026 group-stage fixtures (all 72 matches across 12
 * groups). Times are stored as UTC ISO strings; the client converts to the
 * viewer's local timezone for display. Source: ESPN match schedule, derived
 * from the December 2025 group draw. Knockout games are added later via the
 * admin sub-page.
 *
 * @type {{ team1Code: string, team2Code: string, kickoffUtc: string, stage: string }[]}
 */
export const WORLD_CUP_2026_SEED_GAMES = [
  // Matchday 1
  { team1Code: 'mx', team2Code: 'za', kickoffUtc: '2026-06-11T19:00:00Z', stage: 'group' },
  { team1Code: 'kr', team2Code: 'cz', kickoffUtc: '2026-06-12T02:00:00Z', stage: 'group' },
  { team1Code: 'ca', team2Code: 'ba', kickoffUtc: '2026-06-12T19:00:00Z', stage: 'group' },
  { team1Code: 'us', team2Code: 'py', kickoffUtc: '2026-06-13T01:00:00Z', stage: 'group' },
  { team1Code: 'qa', team2Code: 'ch', kickoffUtc: '2026-06-13T19:00:00Z', stage: 'group' },
  { team1Code: 'br', team2Code: 'ma', kickoffUtc: '2026-06-13T22:00:00Z', stage: 'group' },
  { team1Code: 'ht', team2Code: 'gb-sct', kickoffUtc: '2026-06-14T01:00:00Z', stage: 'group' },
  { team1Code: 'au', team2Code: 'tr', kickoffUtc: '2026-06-14T04:00:00Z', stage: 'group' },
  { team1Code: 'de', team2Code: 'cw', kickoffUtc: '2026-06-14T17:00:00Z', stage: 'group' },
  { team1Code: 'nl', team2Code: 'jp', kickoffUtc: '2026-06-14T20:00:00Z', stage: 'group' },
  { team1Code: 'ci', team2Code: 'ec', kickoffUtc: '2026-06-14T23:00:00Z', stage: 'group' },
  { team1Code: 'se', team2Code: 'tn', kickoffUtc: '2026-06-15T02:00:00Z', stage: 'group' },
  { team1Code: 'es', team2Code: 'cv', kickoffUtc: '2026-06-15T17:00:00Z', stage: 'group' },
  { team1Code: 'be', team2Code: 'eg', kickoffUtc: '2026-06-15T22:00:00Z', stage: 'group' },
  { team1Code: 'sa', team2Code: 'uy', kickoffUtc: '2026-06-15T22:00:00Z', stage: 'group' },
  { team1Code: 'ir', team2Code: 'nz', kickoffUtc: '2026-06-16T04:00:00Z', stage: 'group' },
  { team1Code: 'fr', team2Code: 'sn', kickoffUtc: '2026-06-16T19:00:00Z', stage: 'group' },
  { team1Code: 'iq', team2Code: 'no', kickoffUtc: '2026-06-16T22:00:00Z', stage: 'group' },
  { team1Code: 'ar', team2Code: 'dz', kickoffUtc: '2026-06-17T01:00:00Z', stage: 'group' },
  { team1Code: 'at', team2Code: 'jo', kickoffUtc: '2026-06-17T04:00:00Z', stage: 'group' },
  { team1Code: 'pt', team2Code: 'cd', kickoffUtc: '2026-06-17T17:00:00Z', stage: 'group' },
  { team1Code: 'gb-eng', team2Code: 'hr', kickoffUtc: '2026-06-17T20:00:00Z', stage: 'group' },
  { team1Code: 'gh', team2Code: 'pa', kickoffUtc: '2026-06-17T23:00:00Z', stage: 'group' },
  { team1Code: 'uz', team2Code: 'co', kickoffUtc: '2026-06-18T02:00:00Z', stage: 'group' },
  // Matchday 2
  { team1Code: 'cz', team2Code: 'za', kickoffUtc: '2026-06-18T16:00:00Z', stage: 'group' },
  { team1Code: 'ch', team2Code: 'ba', kickoffUtc: '2026-06-18T19:00:00Z', stage: 'group' },
  { team1Code: 'ca', team2Code: 'qa', kickoffUtc: '2026-06-18T22:00:00Z', stage: 'group' },
  { team1Code: 'mx', team2Code: 'kr', kickoffUtc: '2026-06-19T03:00:00Z', stage: 'group' },
  { team1Code: 'us', team2Code: 'au', kickoffUtc: '2026-06-19T19:00:00Z', stage: 'group' },
  { team1Code: 'gb-sct', team2Code: 'ma', kickoffUtc: '2026-06-19T22:00:00Z', stage: 'group' },
  { team1Code: 'br', team2Code: 'ht', kickoffUtc: '2026-06-20T01:00:00Z', stage: 'group' },
  { team1Code: 'tr', team2Code: 'py', kickoffUtc: '2026-06-20T04:00:00Z', stage: 'group' },
  { team1Code: 'nl', team2Code: 'se', kickoffUtc: '2026-06-20T17:00:00Z', stage: 'group' },
  { team1Code: 'de', team2Code: 'ci', kickoffUtc: '2026-06-20T20:00:00Z', stage: 'group' },
  { team1Code: 'ec', team2Code: 'cw', kickoffUtc: '2026-06-21T00:00:00Z', stage: 'group' },
  { team1Code: 'tn', team2Code: 'jp', kickoffUtc: '2026-06-21T04:00:00Z', stage: 'group' },
  { team1Code: 'es', team2Code: 'sa', kickoffUtc: '2026-06-21T16:00:00Z', stage: 'group' },
  { team1Code: 'be', team2Code: 'ir', kickoffUtc: '2026-06-21T19:00:00Z', stage: 'group' },
  { team1Code: 'uy', team2Code: 'cv', kickoffUtc: '2026-06-21T22:00:00Z', stage: 'group' },
  { team1Code: 'nz', team2Code: 'eg', kickoffUtc: '2026-06-22T01:00:00Z', stage: 'group' },
  { team1Code: 'ar', team2Code: 'at', kickoffUtc: '2026-06-22T17:00:00Z', stage: 'group' },
  { team1Code: 'fr', team2Code: 'iq', kickoffUtc: '2026-06-22T21:00:00Z', stage: 'group' },
  { team1Code: 'no', team2Code: 'sn', kickoffUtc: '2026-06-23T00:00:00Z', stage: 'group' },
  { team1Code: 'jo', team2Code: 'dz', kickoffUtc: '2026-06-23T03:00:00Z', stage: 'group' },
  { team1Code: 'pt', team2Code: 'uz', kickoffUtc: '2026-06-23T17:00:00Z', stage: 'group' },
  { team1Code: 'gb-eng', team2Code: 'gh', kickoffUtc: '2026-06-23T20:00:00Z', stage: 'group' },
  { team1Code: 'pa', team2Code: 'hr', kickoffUtc: '2026-06-23T23:00:00Z', stage: 'group' },
  { team1Code: 'co', team2Code: 'cd', kickoffUtc: '2026-06-24T02:00:00Z', stage: 'group' },
  // Matchday 3 (final group games kick off simultaneously within each group)
  { team1Code: 'ch', team2Code: 'ca', kickoffUtc: '2026-06-24T19:00:00Z', stage: 'group' },
  { team1Code: 'ba', team2Code: 'qa', kickoffUtc: '2026-06-24T19:00:00Z', stage: 'group' },
  { team1Code: 'gb-sct', team2Code: 'br', kickoffUtc: '2026-06-24T22:00:00Z', stage: 'group' },
  { team1Code: 'ma', team2Code: 'ht', kickoffUtc: '2026-06-24T22:00:00Z', stage: 'group' },
  { team1Code: 'cz', team2Code: 'mx', kickoffUtc: '2026-06-25T01:00:00Z', stage: 'group' },
  { team1Code: 'za', team2Code: 'kr', kickoffUtc: '2026-06-25T01:00:00Z', stage: 'group' },
  { team1Code: 'ec', team2Code: 'de', kickoffUtc: '2026-06-25T20:00:00Z', stage: 'group' },
  { team1Code: 'cw', team2Code: 'ci', kickoffUtc: '2026-06-25T20:00:00Z', stage: 'group' },
  { team1Code: 'jp', team2Code: 'se', kickoffUtc: '2026-06-25T23:00:00Z', stage: 'group' },
  { team1Code: 'tn', team2Code: 'nl', kickoffUtc: '2026-06-25T23:00:00Z', stage: 'group' },
  { team1Code: 'tr', team2Code: 'us', kickoffUtc: '2026-06-26T02:00:00Z', stage: 'group' },
  { team1Code: 'py', team2Code: 'au', kickoffUtc: '2026-06-26T02:00:00Z', stage: 'group' },
  { team1Code: 'no', team2Code: 'fr', kickoffUtc: '2026-06-26T19:00:00Z', stage: 'group' },
  { team1Code: 'sn', team2Code: 'iq', kickoffUtc: '2026-06-26T19:00:00Z', stage: 'group' },
  { team1Code: 'cv', team2Code: 'sa', kickoffUtc: '2026-06-27T00:00:00Z', stage: 'group' },
  { team1Code: 'uy', team2Code: 'es', kickoffUtc: '2026-06-27T00:00:00Z', stage: 'group' },
  { team1Code: 'eg', team2Code: 'ir', kickoffUtc: '2026-06-27T03:00:00Z', stage: 'group' },
  { team1Code: 'nz', team2Code: 'be', kickoffUtc: '2026-06-27T03:00:00Z', stage: 'group' },
  { team1Code: 'pa', team2Code: 'gb-eng', kickoffUtc: '2026-06-27T21:00:00Z', stage: 'group' },
  { team1Code: 'hr', team2Code: 'gh', kickoffUtc: '2026-06-27T21:00:00Z', stage: 'group' },
  { team1Code: 'co', team2Code: 'pt', kickoffUtc: '2026-06-27T23:30:00Z', stage: 'group' },
  { team1Code: 'cd', team2Code: 'uz', kickoffUtc: '2026-06-27T23:30:00Z', stage: 'group' },
  { team1Code: 'dz', team2Code: 'at', kickoffUtc: '2026-06-28T02:00:00Z', stage: 'group' },
  { team1Code: 'jo', team2Code: 'ar', kickoffUtc: '2026-06-28T02:00:00Z', stage: 'group' }
]
