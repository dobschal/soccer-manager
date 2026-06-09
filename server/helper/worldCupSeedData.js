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
  { code: 'nz', name: 'New Zealand' }
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
 * Initial WM 2026 group-stage seed fixtures. Times are stored as UTC ISO
 * strings; the client converts to the viewer's local timezone for display.
 *
 * Only a representative sample is seeded — the admin completes the schedule
 * via the admin sub-page once all groups are drawn.
 *
 * @type {{ team1Code: string, team2Code: string, kickoffUtc: string, stage: string }[]}
 */
export const WORLD_CUP_2026_SEED_GAMES = [
  // Opening match - Mexico City
  { team1Code: 'mx', team2Code: 'jm', kickoffUtc: '2026-06-11T18:00:00Z', stage: 'group' },
  // Group stage – matchday 1 (UTC times approximate official kickoffs)
  { team1Code: 'ca', team2Code: 'sa', kickoffUtc: '2026-06-12T00:00:00Z', stage: 'group' },
  { team1Code: 'us', team2Code: 'gh', kickoffUtc: '2026-06-12T20:00:00Z', stage: 'group' },
  { team1Code: 'es', team2Code: 'ma', kickoffUtc: '2026-06-13T18:00:00Z', stage: 'group' },
  { team1Code: 'ar', team2Code: 'ci', kickoffUtc: '2026-06-13T21:00:00Z', stage: 'group' },
  { team1Code: 'de', team2Code: 'jp', kickoffUtc: '2026-06-14T18:00:00Z', stage: 'group' },
  { team1Code: 'br', team2Code: 'sn', kickoffUtc: '2026-06-14T21:00:00Z', stage: 'group' },
  { team1Code: 'fr', team2Code: 'dz', kickoffUtc: '2026-06-15T18:00:00Z', stage: 'group' },
  { team1Code: 'pt', team2Code: 'cr', kickoffUtc: '2026-06-15T21:00:00Z', stage: 'group' },
  { team1Code: 'gb-eng', team2Code: 'no', kickoffUtc: '2026-06-16T18:00:00Z', stage: 'group' },
  { team1Code: 'nl', team2Code: 'eg', kickoffUtc: '2026-06-16T21:00:00Z', stage: 'group' },
  { team1Code: 'it', team2Code: 'cm', kickoffUtc: '2026-06-17T18:00:00Z', stage: 'group' },
  { team1Code: 'be', team2Code: 'qa', kickoffUtc: '2026-06-17T21:00:00Z', stage: 'group' },
  { team1Code: 'hr', team2Code: 'nz', kickoffUtc: '2026-06-18T18:00:00Z', stage: 'group' },
  { team1Code: 'uy', team2Code: 'au', kickoffUtc: '2026-06-18T21:00:00Z', stage: 'group' },
  { team1Code: 'co', team2Code: 'kr', kickoffUtc: '2026-06-19T18:00:00Z', stage: 'group' },
  { team1Code: 'ch', team2Code: 'pa', kickoffUtc: '2026-06-19T21:00:00Z', stage: 'group' },
  { team1Code: 'ec', team2Code: 'ir', kickoffUtc: '2026-06-20T18:00:00Z', stage: 'group' },
  { team1Code: 'pl', team2Code: 'tn', kickoffUtc: '2026-06-20T21:00:00Z', stage: 'group' },
  { team1Code: 'dk', team2Code: 'cv', kickoffUtc: '2026-06-21T18:00:00Z', stage: 'group' },
  { team1Code: 'at', team2Code: 'jo', kickoffUtc: '2026-06-21T21:00:00Z', stage: 'group' },
  { team1Code: 'rs', team2Code: 'uz', kickoffUtc: '2026-06-22T18:00:00Z', stage: 'group' },
  { team1Code: 'tr', team2Code: 'hn', kickoffUtc: '2026-06-22T21:00:00Z', stage: 'group' },
  { team1Code: 'sa', team2Code: 'jm', kickoffUtc: '2026-06-23T18:00:00Z', stage: 'group' },
  { team1Code: 'ca', team2Code: 'mx', kickoffUtc: '2026-06-23T21:00:00Z', stage: 'group' }
]
