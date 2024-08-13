const { app } = require('@azure/functions')
const { getStateCache } = require('../state-cache')
const { logger } = require('@vtfk/logger')
const { getEntraPwdClient } = require('../entra-client')
const { MONGODB, ENTRA_PWD, LOG_IP_AND_USER_AGENT } = require('../../config')
const { getMongoClient } = require('../mongo-client')
const { ObjectId } = require('mongodb')

const stateCache = getStateCache()

app.http('EntraPwdAuth', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    let logPrefix = 'EntraPwdAuth'
    logger('info', [logPrefix, 'New request'], context)
    // Validate request body
    const { code, state } = await request.json()
    if (!(code && state)) {
      logger('warn', [logPrefix, 'Someone called EntraPwdAuth without code and state in body - is someone trying to hack us?'], context)
      return { status: 400, jsonBody: { message: 'Du har glemt state og code i body da' } }
    }

    // Verify type as well, just for extra credits
    if ([code, state].some(param => typeof param !== 'string') || !state.startsWith('pwd')) {
      logger('warn', [logPrefix, 'Someone called EntraPwdAuth without code, and state as strings, or state is not correct - is someone trying to hack us?'], context)
      return { status: 400, jsonBody: { message: 'Du har glemt at state, og code skal være string...' } }
    }

    const logEntryId = state.substring(3)
    logPrefix += ` - logEntryId: ${logEntryId}`

    // Check that state exist in cache (originates from authorization)
    const checks = stateCache.get(state)
    if (!checks) {
      if (LOG_IP_AND_USER_AGENT) {
        logger('warn', [logPrefix, `The state "${state}" (logEntryId) sent by user does not match any state in state cache - user was probs not fast enough?`, `ip: ${request.headers.get('X-Forwarded-For') || 'ukjent'}`, `user-agent: ${request.headers.get('user-agent') || 'ukjent'}`], context)
      } else {
        logger('warn', [logPrefix, `The state "${state}" (logEntryId) sent by user does not match any state in state cache - user was probs not fast enough. CHOO CHOOO!`], context)
      }
      return { status: 500, jsonBody: { message: 'Du har brukt for lang tid, rykk tilbake til start' } }
    }

    try {
      const entraClient = getEntraPwdClient()

      const tokenResponse = await entraClient.acquireTokenByCode({
        redirectUri: ENTRA_PWD.ClIENT_REDIRECT_URI,
        scopes: ['User.Read'],
        code,
        codeVerifier: checks.verifier
      })

      // If tokens are ok - delete state for this request
      stateCache.del(state)

      // Update logEntry with info that user has changed password
      logger('info', [logPrefix, 'Fetching matching logEntry from mongodb'])
      const mongoClient = await getMongoClient()
      const collection = mongoClient.db(MONGODB.DB_NAME).collection(MONGODB.LOG_COLLECTION)

      const logEntry = await collection.findOne({ _id: ObjectId.createFromHexString(logEntryId) })
      if (!logEntry) throw new Error('Could not find a corresponding logEntry for this state, restart the process from the client')
      logger('info', [logPrefix, 'Found corresponding logEntry with state/ObjectId - verifying user, and updating logEntry'])

      if (logEntry.entraId.id === 'DEMO-ID') {
        logger('warn', [logPrefix, 'LogEntry has entraId.id = "DEMO-ID", will skip validation of entra id vs oid'], context)
      } else {
        if (logEntry.entraId.id !== tokenResponse.idTokenClaims.oid) throw new Error(`Logged in user oid does not match logEntry.entraId.id - someone is doing something funky - ObjectId: ${logEntryId}`)
        logger('info', [logPrefix, 'oid from token matched entraId.in logs, updating logEntry'])
      }

      await collection.updateOne({ _id: ObjectId.createFromHexString(logEntryId) }, { $set: { passwordChanged: { successful: true, timestamp: new Date().toISOString() } } })

      logger('info', [logPrefix, `Successfully authenticated user ${tokenResponse.idTokenClaims.preferred_username} by code, and updated logEntry ${logEntryId} with passwordChanged info. responding to user`], context)
      return { status: 200, jsonBody: { displayName: tokenResponse.idTokenClaims.name, userPrincipalName: tokenResponse.idTokenClaims.preferred_username, logEntryId } }
    } catch (error) {
      logger('error', [logPrefix, 'Failed when trying to authenticate entra id user', error.response?.data || error.stack || error.toString()], context)
      return { status: 500, jsonBody: { message: 'Failed when trying to authenticate entra id user', data: error.response?.data || error.stack || error.toString() } }
    }
  }
})
