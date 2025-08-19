const axios = require('axios')
const { KRR } = require('../config')

const getKrrPerson = async (ssn) => {
  const { data } = await axios.post(`${KRR.URL}/lookup`, [ssn], { headers: { 'x-functions-key': KRR.KEY } })
  if (!data.personer) throw new Error('Could not find anyone in KRR with that ssn, sure it is valid?')
  if (data.personer.length > 1) throw new Error('Found more than one person with that ssn in KRR')
  if (data.personer.length === 0) throw new Error('Could not find anyone in KRR with that ssn, sure it is valid?')
  const krrPerson = data.personer[0]
  /* Vi har visst lov å sende sms uansett vi */
  /*
  if (krrPerson.reservasjon.toUpperCase() !== 'NEI') {
    throw new Error('Person is reserved agains digital communication')
  }
  */
  if (krrPerson.status.toUpperCase() !== 'AKTIV') { // LEGGE INN SJEKK PÅ "status": "IKKE_REGISTRERT" ??? mon tro - det får man om den ikke finnes i KRR
    throw new Error('Person is not active, or not registered in KRR')
  }
  return krrPerson
}

module.exports = { getKrrPerson }
