const generatePassword = () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const vocals = 'aeiouy'
  const consonants = "bcdfghjklmnpqrstvwxz"
  const numbers = '123456789'
  const specialCharacters = '_!-'
  let password = ''
  // First random letter uppercase
  {
    const randomInt = Math.floor(Math.random() * consonants.length)
    password += consonants.charAt(randomInt).toUpperCase()  
  }
  // Then 10 random letters lowercase (annahver vocal konsonant)
  for (let i = 0; i < 10; i++) {
    if (i % 2 !== 0) {
      const randomInt = Math.floor(Math.random() * consonants.length)
      password += consonants.charAt(randomInt)
    } else {
      const randomInt = Math.floor(Math.random() * vocals.length)
      password += vocals.charAt(randomInt)
    }
  }
  // Then 2 random numbers
  for (let i = 0; i < 3; i++) {
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

module.exports = { generatePassword }

/*
for (let i = 0; i < 8; i++) {
  const password = generatePassword(14)
  console.log(password)
}
*/
