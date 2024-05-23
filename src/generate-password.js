const { BAD_WORDS } = require("../config")

const generatePassword = () => {
  // const letters = 'abcdefghijklmnopqrstuvwxyz'
  const vocals = 'aeiouy'
  const consonants = 'bcdfghjklmnpqrstvwxz'
  const numbers = '123456789'
  // const specialCharacters = '_!-'
  let password = ''
  // First random letter uppercase
  {
    const randomInt = Math.floor(Math.random() * consonants.length)
    password += consonants.charAt(randomInt).toUpperCase()
  }

  // Then 10 random letters lowercase (annahver vocal konsonant)
  for (let i = 0; i < 8; i++) {
    if (i % 2 !== 0) {
      const randomInt = Math.floor(Math.random() * consonants.length)
      password += consonants.charAt(randomInt)
    } else {
      const randomInt = Math.floor(Math.random() * vocals.length)
      password += vocals.charAt(randomInt)
    }
  }
  // Then 2 random numbers
  for (let i = 0; i < 5; i++) {
    const randomInt = Math.floor(Math.random() * numbers.length)
    password += numbers.charAt(randomInt)
  }
  /*
  // Then random special character
  {
    const randomInt = Math.floor(Math.random() * specialCharacters.length)
    password += specialCharacters.charAt(randomInt).toUpperCase()
  }
  */
  return password
}

const generateWord = (numberOfLetters = 5) => {
  // Common letter selection
  const vocalSelection = 'aeiouy'
  const consonantSelection = 'bcdfghjklmnprstvz'

  // Double chances
  const doubleChanceVocals = 'eaio'
  const doubleChanceConsonants = 'rntsld'

  // Set up selections withb double chances
  const vocals = `${vocalSelection}${doubleChanceVocals}`
  const consonants = `${consonantSelection}${doubleChanceConsonants}`

  const letters = `${vocals}${consonants}`

  // Allowed double-letters
  const canBeDouble = 'bcdfgklmnprstz'

  // Specific consonant that can follow up other consonants (Cannot end on these)
  const canHaveRAfter = 'bcdfgkpt' // br
  const canHaveLAfter = 'cfgkpsz' // cl
  const canHaveJAfter = 'bfgkp' // bj

  // Specific consonant that can follow up other consonants (MUST HAVE at least two letters already)
  const canHaveSAfter = 'fgjklmnprtv' // fs
  const canHaveTAfter = 'cfgklnrsz' // ct
  const canHaveNAfter = 'gklmprstvz' // gn

  // Consonants that can follow up specific consonant
  const canBeAfterS = 'chjklmnptvw'

  // Specific vocals that can follow up other vocals
  const canHaveIAfter = 'aeo'

  let word = ''

  let forceOppositeType = false
  while (word.length < numberOfLetters) {
    if (word.length === 0) { // First letter simply take uppercase random letter
      const randomInt = Math.floor(Math.random() * letters.length)
      // Remove i - to avoid confusion between l and I for user
      const lettersToUse = letters.replace('i', '')
      const letter = lettersToUse.charAt(randomInt)
      word += letter.toUpperCase()
      continue
    }
    const previousLetter = word.charAt(word.length - 1).toLowerCase()
    if (forceOppositeType) { // If we force opposite and previous was consonant we use vocal, and vice versa
      const lettersToUse = vocals.includes(previousLetter) ? consonants : vocals
      const randomInt = Math.floor(Math.random() * lettersToUse.length)
      const letter = lettersToUse.charAt(randomInt)
      word += letter
      forceOppositeType = false // reset forceOppositeType
      continue
    }
    // If not forceOppositeType we can have some fun

    let possibleLetters = vocals.includes(previousLetter) ? consonants : vocals // we can always use consonant after vocal and vice versa
    // First check if we can have double letters
    if (word.length > 1) { // At least 2 letters
      if (word.length === 2 || word.charAt(word.length - 2) !== word.charAt(word.length - 3)) { // We did not use double letters already
        if (canBeDouble.includes(previousLetter)) { // predefined letters can be double
          possibleLetters += previousLetter
        }
      }
    }
    if (canHaveIAfter.includes(previousLetter)) possibleLetters += 'i'
    if (word.length !== numberOfLetters - 1) { // Don't end on one of these possibilities
      if (canHaveRAfter.includes(previousLetter)) possibleLetters += 'r'
      if (canHaveLAfter.includes(previousLetter)) possibleLetters += 'l'
      if (canHaveJAfter.includes(previousLetter)) possibleLetters += 'j'
      if (previousLetter === 's') possibleLetters += canBeAfterS
    }
    if (word.length > 2) { // We must have at least one vocal
      if (canHaveSAfter.includes(previousLetter)) possibleLetters += 's'
      if (canHaveTAfter.includes(previousLetter)) possibleLetters += 't'
      if (canHaveNAfter.includes(previousLetter)) possibleLetters += 'n'
    }

    const randomInt = Math.floor(Math.random() * possibleLetters.length)
    const letter = possibleLetters.charAt(randomInt)
    // console.log(`Previous letter: "${previousLetter}" - possible follow ups: "${possibleLetters}" - winner: "${letter}"`)
    word += letter

    // Then if we used did not use opposite type we force opposite and continue
    const previousWasVocal = vocals.includes(previousLetter)
    const currentWasVocal = vocals.includes(letter)
    if (previousWasVocal === currentWasVocal) {
      forceOppositeType = true
    }
    continue
  }
  return word
}

const generateRandomNumber = (numberOfDigits) => {
  const numberSelection = '0123456789'
  let numbers = ''

  // Numbers
  for (let i = 0; i < numberOfDigits; i++) {
    const randomInt = Math.floor(Math.random() * numberSelection.length)
    numbers += numberSelection.charAt(randomInt)
  }

  return numbers
}

const generateFriendlyPassword = () => {
  const needLength = 12
  const firstWordLength = 3 + Math.floor(Math.random() * 2) // First word is 3 to 4 letters long
  const numberOfDigits = 3 + Math.floor(Math.random() * 2) // 3 or 4 letters
  const secondWordLength = needLength - firstWordLength - numberOfDigits // Second word is the rest
  let firstWord = generateWord(firstWordLength)

  // Filter out bad words
  while (BAD_WORDS.some(badWord => firstWord.toLowerCase().includes(badWord))) {
    // console.log(`BAD WORD 1 ${firstWord}`)
    firstWord = generateWord(firstWordLength)
    // console.log(`NEW WORD 1 ${firstWord}`)
  }
  let secondWord = generateWord(secondWordLength)
  while (BAD_WORDS.some(badWord => secondWord.toLowerCase().includes(badWord))) {
    // console.log(`BAD WORD 2 ${secondWord}`)
    secondWord = generateWord(secondWordLength)
    // console.log(`NEW WORD 2 ${secondWord}`)
  }
  const number = generateRandomNumber(numberOfDigits)
  const password = `${firstWord}-${secondWord}-${number}`
  return password
}

module.exports = { generatePassword, generateFriendlyPassword }

/*
console.log('')
const pws = generateFriendlyPassword()
console.log(pws)
console.log('')
*/
// console.log(generateWord(10))
// console.log(' ')
/*
for (let i = 0; i < 100; i++) {
  const pw = generateFriendlyPassword()
  // console.log(pw)
}
*/

/*
const passwords = []
let duplicates = 0
for (let i = 0; i < 100000; i++) {
  if (i % 10000 === 0) console.log(`Er på ${i}`)
  const pw = generateFriendlyPassword(5)
  if (passwords.includes(pw)) {
    console.log(pw)
    duplicates++
  }
  passwords.push(pw)
}

console.log('duplicates', duplicates)
console.log('done')
*/
