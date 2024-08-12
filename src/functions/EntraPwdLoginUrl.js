const { app } = require('@azure/functions')
const { getStateCache } = require('../state-cache')
const { logger } = require('@vtfk/logger')
const { getEntraPwdClient } = require('../entra-client')
const { CryptoProvider } = require('@azure/msal-node')
const { ENTRA_PWD } = require('../../config')

const stateCache = getStateCache()

const cryptoProvider = new CryptoProvider()

app.http('EntraPwdLoginUrl', {
  methods: ['GET'],
  authLevel: 'function',
  handler: async (request, context) => {
    const logPrefix = 'EntraPwdLoginUrl'
    logger('info', [logPrefix, 'New request'], context)
    const logEntryId = request.query.get('log_entry_id')
    if (!logEntryId) {
      logger('warn', [logPrefix, 'No log_entry_id in query params, no no, not allowed'])
      return { status: 400, jsonBody: { message: 'Missing log_entry_id query param', data: null } }
    }
    const queryLoginHint = request.query.get('login_hint')
    try {
      const entraClient = getEntraPwdClient()

      const state = logEntryId

      const { verifier, challenge } = await cryptoProvider.generatePkceCodes()

      const authUrl = await entraClient.getAuthCodeUrl({
        state,
        redirectUri: ENTRA_PWD.ClIENT_REDIRECT_URI,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        prompt: 'login',
        // responseMode: ResponseMode.FORM_POST,
        loginHint: queryLoginHint || undefined
      })

      stateCache.set(state, { verifier }, 1200)

      logger('info', [logPrefix, 'Successfully got entra auth url, responding to user'], context)
      return { status: 200, jsonBody: { loginUrl: authUrl } }
    } catch (error) {
      logger('error', [logPrefix, 'Failed when trying to get entra auth url', error.response?.data || error.stack || error.toString()], context)
      return { status: 500, jsonBody: { message: 'Failed when trying to get entra auth url', data: error.response?.data || error.stack || error.toString() } }
    }
  }
})
