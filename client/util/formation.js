/**
 * We need to know which position are in a formation to set the in_game_position of new players
 *
 * @param {string} formation
 * @returns {Array<string>}
 */
export function getPositionsOfFormation (formation) {
  switch (formation) {
    case '352': return ['GK', 'LD', 'CD', 'RD', 'LM', 'DM', 'DM', 'RM', 'OM', 'LA', 'RA']
    case '343a':return ['GK', 'LD', 'CD', 'RD', 'LM', 'DM', 'RM', 'OM', 'LA', 'CA', 'RA']
    case '343b':return ['GK', 'LD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'LA', 'CA', 'RA']
    case '451a':return ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'DM', 'CM', 'RM', 'OM', 'CA']
    case '451b':return ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'DM', 'DM', 'RM', 'OM', 'CA']
    case '442a':return ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'DM', 'RM', 'OM', 'LA', 'RA']
    case '442b':return ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'LA', 'RA']
    case '433':return ['GK', 'LD', 'CD', 'CD', 'RD', 'LM', 'CM', 'RM', 'LA', 'CA', 'RA']
    case '541':return ['GK', 'LD', 'CD', 'CD', 'CD', 'RD', 'LM', 'CM', 'CM', 'RM', 'CA']
    case '532':return ['GK', 'LD', 'CD', 'CD', 'CD', 'RD', 'LM', 'CM', 'RM', 'LA', 'RA']
  }
  console.error('Unknown formation: ', formation)
}

export const Position = {
  GK: 'GK',
  LD: 'LD',
  CD: 'CD',
  RD: 'RD',
  LM: 'LM',
  DM: 'DM',
  CM: 'CM',
  RM: 'RM',
  OM: 'OM',
  LA: 'LA',
  CA: 'CA',
  RA: 'RA'
}

export const Formation = {
  352: '352',
  '343a': '343a', // 2x CM
  '343b': '343b', // DM, OM
  '451a': '451a', // with DM, CM, OM
  '451b': '451b', // with 2x DM & 1x OM
  '442a': '442a', // with DM, OM
  '442b': '442b', // with CM, CM
  433: '433',
  541: '541',
  532: '532'
}

/**
 * @param {string} position
 * @returns {string}
 */
export function determineOponentPosition (position) {
  switch (position) {
    case 'GK': return null
    case 'LD': return 'RA'
    case 'CD': return 'CA'
    case 'RD': return 'LA'
    case 'LM': return 'RM'
    case 'DM': return 'OM'
    case 'CM': return 'CM'
    case 'RM': return 'LM'
    case 'OM': return 'DM'
    case 'LA': return 'RD'
    case 'CA': return 'CD'
    case 'RA': return 'LD'
  }
  throw new Error('Unknown position: ' + position)
}
