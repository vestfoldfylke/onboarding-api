const { ENTRA } = require('../config')
const msal = require('@azure/msal-node')

let entraInstance = null

/**
 *
 * @returns {import('@azure/msal-node').ConfidentialClientApplication} entraClient
 */
const getEntraClient = () => {
  if (entraInstance) return entraInstance

  entraInstance = new msal.ConfidentialClientApplication({
    auth: {
      clientId: ENTRA.CLIENT_ID,
      authority: `https://login.microsoftonline.com/${ENTRA.TENANT_ID}`,
      clientSecret: ENTRA.ClIENT_SECRET
    }
  })

  return entraInstance
}

module.exports = { getEntraClient }
