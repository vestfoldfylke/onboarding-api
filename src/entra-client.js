const { ENTRA_PWD, ENTRA_MFA, ENTRA_STATISTICS } = require('../config')
const msal = require('@azure/msal-node')

let entraPwdInstance = null
let entraMfaInstance = null
let entraStatisitcsInstance = null

/**
 *
 * @returns {import('@azure/msal-node').ConfidentialClientApplication} entraClient
 */
const getEntraPwdClient = () => {
  if (entraPwdInstance) return entraPwdInstance

  entraPwdInstance = new msal.ConfidentialClientApplication({
    auth: {
      clientId: ENTRA_PWD.CLIENT_ID,
      authority: `https://login.microsoftonline.com/${ENTRA_PWD.TENANT_ID}`,
      clientSecret: ENTRA_PWD.ClIENT_SECRET
    }
  })

  return entraPwdInstance
}

/**
 *
 * @returns {import('@azure/msal-node').ConfidentialClientApplication} entraClient
 */
const getEntraMfaClient = () => {
  if (entraMfaInstance) return entraMfaInstance

  entraMfaInstance = new msal.ConfidentialClientApplication({
    auth: {
      clientId: ENTRA_MFA.CLIENT_ID,
      authority: `https://login.microsoftonline.com/${ENTRA_MFA.TENANT_ID}`,
      clientSecret: ENTRA_MFA.ClIENT_SECRET
    }
  })

  return entraMfaInstance
}

/**
 *
 * @returns {import('@azure/msal-node').ConfidentialClientApplication} entraClient
 */
const getStatisticsClient = () => {
  if (entraStatisitcsInstance) return entraStatisitcsInstance

  entraStatisitcsInstance = new msal.ConfidentialClientApplication({
    auth: {
      clientId: ENTRA_STATISTICS.CLIENT_ID,
      authority: `https://login.microsoftonline.com/${ENTRA_STATISTICS.TENANT_ID}`,
      clientSecret: ENTRA_STATISTICS.ClIENT_SECRET
    }
  })

  return entraStatisitcsInstance
}

module.exports = { getEntraPwdClient, getEntraMfaClient, getStatisticsClient }
