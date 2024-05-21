const { app } = require('@azure/functions')
const { getStateCache } = require('../state-cache')
const { logger } = require('@vtfk/logger')
const { getEntraClient } = require('../entra-client')
const { ENTRA } = require('../../config')

const stateCache = getStateCache()

app.http('EntraAuth', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    logger('info', ['New request for entraAuth'], context)
    // Validate request body
    const { code, state } = await request.json()
    if (!(code && state)) {
      logger('warn', ['Someone called ResetPassword without code, iss, and state in body - is someone trying to hack us?'], context)
      return { status: 400, jsonBody: { message: 'Du har glemt state og code i body da' } }
    }

    // Verify type as well, just for extra credits
    if ([code, state].some(param => typeof param !== 'string')) {
      logger('warn', ['Someone called ResetPassword without code, and state as strings - is someone trying to hack us?'], context)
      return { status: 400, jsonBody: { message: 'Du har glemt at state, og code skal være string...' } }
    }

    // Check that state exist in cache (originates from authorization)
    const checks = stateCache.get(state)
    if (!checks) {
      logger('warn', ['The state sent by user does not match any state in state cache - is someone trying to be smart?'], context)
      return { status: 500, jsonBody: { message: 'Fant ingen startet pålogging med denne staten - har du venta for lenge?' } }
    }
    try {
      const entraClient = getEntraClient()

      const tokenResponse = await entraClient.acquireTokenByCode({
        redirectUri: ENTRA.ClIENT_REDIRECT_URI,
        scopes: ['User.Read'],
        code,
        codeVerifier: checks.verifier
      })

      // If tokens are ok - delete state for this request
      stateCache.del(state)

      logger('info', [`Successfully authenticated user ${tokenResponse.idTokenClaims.preferred_username} by code, responding to user`], context)
      return { status: 200, jsonBody: { displayName: tokenResponse.idTokenClaims.name, userPrincipalName: tokenResponse.idTokenClaims.preferred_username } }
    } catch (error) {
      logger('error', ['Failed when trying to authenticate entra id user', error.response?.data || error.stack || error.toString()], context)
      return { status: 500, jsonBody: { message: 'Failed when trying to authenticate entra id user', data: error.response?.data || error.stack || error.toString() } }
    }
  }
})
