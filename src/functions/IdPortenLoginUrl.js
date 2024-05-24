const { app } = require('@azure/functions')
const { getRandomValues, subtle } = require('crypto')
const { getStateCache } = require('../state-cache')
const { getIdPortenClient } = require('../idporten-client')
const { logger } = require('@vtfk/logger')

const stateCache = getStateCache()

const generateRandomBase64String = async (length = 24) => Buffer.from(getRandomValues(new Uint8Array(length))).toString('base64url')

const computeCodeChallengeFromVerifier = async (verifier) => {
  const hashedValue = await subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return Buffer.from(hashedValue).toString('base64url')
}

app.http('IdPortenLoginUrl', {
  methods: ['GET'],
  authLevel: 'function',
  handler: async (request, context) => {
    logger('info', ['New request for loginurl'], context)
    const userType = request.query.get('user_type')
    if (!userType || !['ansatt', 'elev'].includes(userType)) {
      logger('warn', ['Request does not contain query param user_type with "ansatt" eller "elev" :O'])
      return { status: 400, jsonBody: { message: 'Er du ikke ansatt eller elev??' } }
    }
    const action = request.query.get('action')
    if (!action || !['resetpassword', 'verifyuser'].includes(action)) {
      logger('warn', ['Request does not contain query param action with "resetpassword" eller "verifyuser" :O'])
      return { status: 400, jsonBody: { message: 'Du har glemt å slenge med "action" i query params' } }
    }
    try {
      const idPortenClient = await getIdPortenClient()

      const randomState = await generateRandomBase64String()
      const state = `${userType}${action}${randomState}`
      const codeVerifier = await generateRandomBase64String(43) // Must be at least 43 characters
      const codeChallenge = await computeCodeChallengeFromVerifier(codeVerifier)
      const nonce = await generateRandomBase64String()

      const authUrl = idPortenClient.authorizationUrl({
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        nonce,
        state,
        prompt: 'login',
        acr_values: userType === 'elev' ? 'idporten-loa-substantial' : 'idporten-loa-substantial' // idporten-loa-high for kun BankID og commfides
      })

      stateCache.set(state, { codeVerifier, nonce }, 600)

      logger('info', ['Successfully got id-porten auth url, responding to user'])
      return { status: 200, jsonBody: { loginUrl: authUrl } }
    } catch (error) {
      logger('error', ['Failed when trying to get id-porten auth url', error.response?.data || error.stack || error.toString()])
      return { status: 500, jsonBody: { message: 'Failed when trying to get id-porten auth url', data: error.response?.data || error.stack || error.toString() } }
    }
  }
})
