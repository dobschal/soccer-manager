const BAD_WORDS = [
  // English
  'fuck', 'shit', 'ass', 'bitch', 'bastard', 'damn', 'dick', 'cunt', 'piss', 'cock',
  'wanker', 'twat', 'bollocks', 'bugger', 'crap', 'slut', 'whore', 'nigger', 'faggot', 'retard',
  // German
  'scheiße', 'scheisse', 'fick', 'ficken', 'arsch', 'arschloch', 'hurensohn', 'wichser',
  'fotze', 'missgeburt', 'hure', 'schwuchtel', 'spast', 'depp', 'idiot', 'vollidiot',
  'drecksau', 'miststück', 'penner', 'trottel',
  // Hate speech / extremism
  'nazi', 'nazis', 'hitler', 'heil', 'sieg heil', 'rassist', 'rassisten'
]

const pattern = new RegExp(`\\b(${BAD_WORDS.join('|')})\\b`, 'gi')

/**
 * Replace bad words in text with asterisks of matching length
 * @param {string} text
 * @returns {string}
 */
export function maskBadWords (text) {
  return text.replace(pattern, (match) => '*'.repeat(match.length))
}

/**
 * Check if text contains any bad words
 * @param {string} text
 * @returns {boolean}
 */
export function containsBadWords (text) {
  pattern.lastIndex = 0
  return pattern.test(text)
}
