const { logger } = require('@vtfk/logger')
const NodeCache = require('node-cache')

let stateCacheInstance = null

/**
 *
 * @returns {import('node-cache')} stateCache
 */
const getStateCache = () => {
  if (stateCacheInstance) return stateCacheInstance
  logger('info', ['stateCache', 'No internal cache, creating new'])
  stateCacheInstance = new NodeCache({ stdTTL: 0 })
  return stateCacheInstance
}

module.exports = { getStateCache }
