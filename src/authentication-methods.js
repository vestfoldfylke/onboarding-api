const axios = require('axios')
const { getMsalToken } = require('./get-msal-token')
const { getAuthenticationMethods } = require('./call-graph')
const { GRAPH, TAP } = require('../config')

// Passkeys kan ligge i ulike metode-typer (synkroniserte og device-bound), så vi filtrerer på @odata.type og ikke bare på fido2Methods-collection
const PASSKEY_ODATA_TYPES = [
  '#microsoft.graph.fido2authenticationmethod',
  '#microsoft.graph.passkeydeviceboundauthenticationmethod'
]

/**
 * @typedef TemporaryAccessPassMethod
 * @property {string} id
 * @property {string} temporaryAccessPass
 * @property {string} startDateTime
 * @property {number} lifetimeInMinutes
 * @property {boolean} isUsableOnce
 */

/**
 * Utsteder en engangs-TAP for brukeren. Krever UserAuthenticationMethod.ReadWrite.All (Application)
 * @param {string} userId id eller userPrincipalName
 * @returns {Promise<TemporaryAccessPassMethod>} temporaryAccessPassMethod
 */
const createTemporaryAccessPass = async (userId) => {
  const url = `${GRAPH.URL}/v1.0/users/${userId}/authentication/temporaryAccessPassMethods`
  const tapBody = {
    lifetimeInMinutes: TAP.LIFETIME_MINUTES,
    isUsableOnce: true
  }
  const { data } = await axios.post(url, tapBody, { headers: { Authorization: `Bearer ${await getMsalToken({ scope: GRAPH.SCOPE })}` } })
  return data
}

/**
 *
 * @param {string} userId id eller userPrincipalName
 * @returns {Promise<boolean>} hasPasskey
 */
const hasRegisteredPasskey = async (userId) => {
  const authenticationMethods = await getAuthenticationMethods(userId)
  return authenticationMethods.value.some(method => PASSKEY_ODATA_TYPES.includes(method['@odata.type']?.toLowerCase()))
}

module.exports = { createTemporaryAccessPass, hasRegisteredPasskey }
