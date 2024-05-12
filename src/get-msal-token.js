const { getAccessToken } = require('@vestfoldfylke/msal-token')
const { logger } = require('@vtfk/logger')
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
    // logger('info', ['getMsalToken', 'found valid token in cache, will use that instead of fetching new'])
    return cachedToken.substring(0, cachedToken.length - 2)
  }

  logger('info', ['getMsalToken', 'no token in cache, fetching new from Microsoft'])
  const clientConfig = {
    clientId: APPREG.CLIENT_ID,
    tenantId: APPREG.TENANT_ID,
    clientSecret: APPREG.CLIENT_SECRET,
    scopes: [config.scope]
  }

  const token = await getAccessToken(clientConfig)
  const expires = Math.floor((token.expiresOn.getTime() - new Date()) / 1000)
  logger('info', ['getMsalToken', `Got token from Microsoft, expires in ${expires} seconds.`])
  cache.set(cacheKey, `${token.accessToken}==`, expires) // Haha, just to make the cached token not directly usable
  logger('info', ['getMsalToken', 'Token stored in cache'])

  return token.accessToken
}

module.exports = { getMsalToken }
