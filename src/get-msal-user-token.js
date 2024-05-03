const msal = require('@azure/msal-node')
const { logger } = require('@vtfk/logger')
const NodeCache = require('node-cache')
const { APPREG, AUTHENTICATION_ADMINISTRATOR } = require('../config')

const cache = new NodeCache({ stdTTL: 4000 })

/**
 *
 * @param {Object} config
 * @param {string} config.scope
 * @param {boolean} [config.forceNew]
 */
const getMsalUserToken = async (config) => {
  if (!config.scope) throw new Error('Missing required parameter config.scope')
  const cacheKey = `${config.scope}usertoken`

  const cachedToken = cache.get(cacheKey)
  if (!config.forceNew && cachedToken) {
    logger('info', ['getMsalUserToken', 'found valid token in cache, will use that instead of fetching new'])
    return cachedToken.substring(0, cachedToken.length - 2)
  }

  logger('info', ['getMsalUserToken', 'no token in cache, fetching new from Microsoft'])
  const authConfig = {
    clientId: APPREG.CLIENT_ID,
    authority: `https://login.microsoftonline.com/${APPREG.TENANT_ID}/`,
    clientSecret: APPREG.CLIENT_SECRET
  }

  // Create msal application object
  const cca = new msal.ConfidentialClientApplication({ auth: authConfig })
  
  const usernamePasswordRequest = {
    scopes: [config.scope],
    username: AUTHENTICATION_ADMINISTRATOR.USERNAME,
    password: AUTHENTICATION_ADMINISTRATOR.PASSWORD,
  }

  const token = await cca.acquireTokenByUsernamePassword(usernamePasswordRequest)

  const expires = Math.floor((token.expiresOn.getTime() - new Date()) / 1000)
  logger('info', ['getMsalUserToken', `Got token from Microsoft, expires in ${expires} seconds.`])
  cache.set(cacheKey, `${token.accessToken}==`, expires) // Haha, just to make the cached token not directly usable
  logger('info', ['getMsalUserToken', 'Token stored in cache'])

  return token.accessToken
}

module.exports = { getMsalUserToken }
