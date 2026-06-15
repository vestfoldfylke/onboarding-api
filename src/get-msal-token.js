const { ConfidentialClientApplication } = require('@azure/msal-node')
const { logger } = require('@vestfoldfylke/loglady')
const NodeCache = require('node-cache')
const { APPREG } = require('../config')

const cache = new NodeCache({ stdTTL: 4000 })

/**
 *
 * @param {Object} config
 * @param {string} config.scope
 * @param {boolean} [config.forceNew]
 */
const getMsalToken = async (config) => {
  if (!config.scope) throw new Error('Missing required parameter config.scope')
  const cacheKey = `${config.scope}token`

  const cachedToken = cache.get(cacheKey)
  if (!config.forceNew && cachedToken) {
    // logger.info('getMsalToken - found valid token in cache, will use that instead of fetching new')
    return cachedToken.substring(0, cachedToken.length - 2)
  }

  if (!APPREG.CLIENT_ID || !APPREG.CLIENT_SECRET || !APPREG.TENANT_ID) {
    throw new Error('Missing required environment variables for Microsoft authentication')
  }

  logger.info('getMsalToken - no token in cache, fetching new from Microsoft')
  const confidentialClient = new ConfidentialClientApplication({
    auth: {
      clientId: APPREG.CLIENT_ID,
      authority: `https://login.microsoftonline.com/${APPREG.TENANT_ID}/`,
      clientSecret: APPREG.CLIENT_SECRET
    }
  })

  const tokenResponse = await confidentialClient.acquireTokenByClientCredential({
    scopes: [config.scope]
  })

  if (!tokenResponse || !tokenResponse.accessToken) {
    throw new Error('Failed to acquire token from Microsoft')
  }

  if (!tokenResponse.expiresOn) {
    throw new Error('Token response missing expiresOn property')
  }

  const expires = Math.floor((tokenResponse.expiresOn.getTime() - Date.now()) / 1000)
  logger.info('getMsalToken - Got token from Microsoft, expires in {Expires} seconds.', expires)
  cache.set(cacheKey, `${tokenResponse.accessToken}==`, expires) // Haha, just to make the cached token not directly usable
  logger.info('getMsalToken - Token stored in cache')

  return tokenResponse.accessToken
}

module.exports = { getMsalToken }
