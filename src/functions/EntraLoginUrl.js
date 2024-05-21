const { app } = require('@azure/functions')
const { getRandomValues } = require('crypto')
const { getStateCache } = require('../state-cache')
const { logger } = require('@vtfk/logger')
const { getEntraClient } = require('../entra-client')
const { CryptoProvider } = require('@azure/msal-node')
const { ENTRA } = require('../../config')

const stateCache = getStateCache()

const generateRandomBase64String = async (length = 24) => Buffer.from(getRandomValues(new Uint8Array(length))).toString('base64url')

const cryptoProvider = new CryptoProvider()

app.http('EntraLoginUrl', {
  methods: ['GET'],
  authLevel: 'function',
  handler: async (request, context) => {
    logger('info', ['New request for loginurl'])
    const queryLoginHint = request.query.get('login_hint')
    try {
      const entraClient = getEntraClient()

      const state = await generateRandomBase64String()

      const { verifier, challenge } = await cryptoProvider.generatePkceCodes()

      const authUrl = await entraClient.getAuthCodeUrl({
        state,
        redirectUri: ENTRA.ClIENT_REDIRECT_URI,
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        // responseMode: ResponseMode.FORM_POST,
        loginHint: queryLoginHint || undefined
      })

      stateCache.set(state, { verifier }, 300)

      logger('info', ['Successfully got entra auth url, responding to user'], context)
      return { status: 200, jsonBody: { loginUrl: authUrl } }
    } catch (error) {
      logger('error', ['Failed when trying to get entra auth url', error.response?.data || error.stack || error.toString()], context)
      return { status: 500, jsonBody: { message: 'Failed when trying to get entra auth url', data: error.response?.data || error.stack || error.toString() } }
    }
  }
})
