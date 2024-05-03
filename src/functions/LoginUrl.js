const { app } = require('@azure/functions')
const { getRandomValues, subtle } = require('crypto')
const { getStateCache } = require('../state-cache')
const { getIdPortenClient } = require('../idporten-client')

const stateCache = getStateCache()

const generateRandomBase64String = async (length = 24) => Buffer.from(getRandomValues(new Uint8Array(length))).toString('base64url')

const computeCodeChallengeFromVerifier = async (verifier) => {
  const hashedValue = await subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return Buffer.from(hashedValue).toString('base64url')
}

const isCodeVerifierValid = async (codeVerifier, codeChallenge) => (await computeCodeChallengeFromVerifier(codeVerifier)) === codeChallenge // ID-porten gjør denne jobben

app.http('LoginUrl', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const userType = request.query.get('userType')
        if (!userType || !['ansatt', 'elev'].includes(userType)) {
            return { status: 400, jsonBody: { message: 'Er du ikke ansatt eller elev??' } }
        }

        const idPortenClient = await getIdPortenClient()
        
        const randomState = await generateRandomBase64String()
        const state = `${userType}${randomState}`
        const codeVerifier = await generateRandomBase64String(43) // Must be at least 43 characters
        const codeChallenge = await computeCodeChallengeFromVerifier(codeVerifier)
        const nonce = await generateRandomBase64String()

        console.log(idPortenClient)
        const authUrl = idPortenClient.authorizationUrl({
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            nonce,
            state,
            acr_values: 'idporten-loa-high'
        })


        stateCache.set(state, { codeVerifier, nonce }, 300)

        // Returner onetime pass? Lagre i session storage ellerno i browser (eller httpOnly cookie) valider og send nye for hver request? // Jørgen kan teste på egenhånd
        // Caches sammen med state - 401 dersom det ikke følger med en gyldig onetime pass som finnes i cache?

        return { jsonBody: { loginUrl: authUrl } }
    }
})
