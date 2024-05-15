const NodeCache = require('node-cache')

let stateCacheInstance = null

/**
 *
 * @returns {import('node-cache')} stateCache
 */
const getStateCache = () => {
  if (stateCacheInstance) return stateCacheInstance
  stateCacheInstance = new NodeCache({ stdTTL: 3600 })
  return stateCacheInstance
}

module.exports = { getStateCache }
