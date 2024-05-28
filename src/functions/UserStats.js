const { app } = require('@azure/functions')
const { getStateCache } = require('../state-cache')
const { logger } = require('@vtfk/logger')
const { getEntraMfaClient } = require('../entra-client')
const { MONGODB, ENTRA_MFA } = require('../../config')
const { getMongoClient } = require('../mongo-client')
const { ObjectId } = require('mongodb')
const { createMfaStat } = require('../stats')

const stateCache = getStateCache()

app.http('UserStats', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    let logPrefix = 'EntraMfaAuth'
    logger('info', [logPrefix, 'New request'], context)
    // Validate request body
    const { code, state } = await request.json()
    if (!(code && state)) {
      logger('warn', [logPrefix, 'Someone called EntraMfaAuth without code and state in body - is someone trying to hack us?'], context)
      return { status: 400, jsonBody: { message: 'Du har glemt state og code i body da' } }
    }

    // Verify type as well, just for extra credits
    if ([code, state].some(param => typeof param !== 'string')) {
      logger('warn', [logPrefix, 'Someone called EntraMfaAuth without code, and state as strings - is someone trying to hack us?'], context)
      return { status: 400, jsonBody: { message: 'Du har glemt at state, og code skal være string...' } }
    }

    // Check that state exist in cache (originates from authorization)
    const checks = stateCache.get(state)
    if (!checks) {
      logger('warn', [logPrefix, 'The state sent by user does not match any state in state cache - is someone trying to be smart?'], context)
      return { status: 500, jsonBody: { message: 'Du har brukt for lang tid, rykk tilbake til start' } }
    }
    try {
      const entraClient = getEntraMfaClient()

      const tokenResponse = await entraClient.acquireTokenByCode({
        redirectUri: ENTRA_MFA.ClIENT_REDIRECT_URI,
        scopes: ['User.Read'],
        code,
        codeVerifier: checks.verifier
      })

      // If tokens are ok - delete state for this request
      stateCache.del(state)

      logPrefix = logPrefix + ` - ${tokenResponse.idTokenClaims.preferred_username}`

      // return { status: 200, jsonBody: tokenResponse.idTokenClaims.roles }
      // Check stats-role
      logger('info', [logPrefix, 'Validating stats role'], context)
      if (!tokenResponse.idTokenClaims.roles || !tokenResponse.idTokenClaims.roles.includes('Stats.Read')) {
        logger('warn', [logPrefix, 'Missing required stats role for this endpoint'], context)
        return { status: 401, jsonBody: { message: 'Du mangler rettigheter for å hente data her. Ta kontakt med systemansvarlig om du trenger data.' } }
      }
      logger('info', [logPrefix, 'stats role validated'], context)

      // User has admin-role
      /*
      Hent data fra mongodb (users-collection) - kvern sammen det Robin vil ha - og returner slik at frontend kan displaye det.
      Hent all statistikk-data som trengs og send til frontend
      */

      return { status: 200, jsonBody: { oki: 'doki' } }
    } catch (error) {
      logger('error', ['Failed when fetching stats', error.response?.data || error.stack || error.toString()], context)
      return { status: 500, jsonBody: { message: 'Failed when fetching stats from db', data: error.response?.data || error.stack || error.toString() } }
    }
  }
})
