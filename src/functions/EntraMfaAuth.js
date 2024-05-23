const { app } = require('@azure/functions')
const { getStateCache } = require('../state-cache')
const { logger } = require('@vtfk/logger')
const { getEntraMfaClient } = require('../entra-client')
const { MONGODB, ENTRA_MFA } = require('../../config')
const { getMongoClient } = require('../mongo-client')
const { ObjectId } = require('mongodb')
const { createMfaStat } = require('../stats')

const stateCache = getStateCache()

app.http('EntraMfaAuth', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    const logPrefix = 'EntraMfaAuth'
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
      return { status: 500, jsonBody: { message: 'Fant ingen startet pålogging med denne staten - har du venta for lenge?' } }
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

      // Update logEntry with info that user has logged in with MFA
      logger('info', [logPrefix, 'Fetching matching logEntry from mongodb'])
      const mongoClient = await getMongoClient()
      const collection = mongoClient.db(MONGODB.DB_NAME).collection(MONGODB.LOG_COLLECTION)

      const logEntryId = state
      const logEntry = await collection.findOne({ _id: ObjectId.createFromHexString(logEntryId) })
      if (!logEntry) throw new Error('Could not find a corresponding logEntry for this state, restart the process from the client')
      logger('info', [logPrefix, 'Found corresponding logEntry with state/ObjectId - verifying user, and updating logEntry'])

      if (logEntry.entraId.id === 'DEMO-ID') {
        logger('warn', [logPrefix, 'LogEntry has entraId.id = "DEMO-ID", will skip validation of entra id vs oid'], context)
      } else {
        if (logEntry.entraId.id !== tokenResponse.idTokenClaims.oid) throw new Error(`Logged in user oid does not match logEntry.entraId.id - someone is doing something funky - ObjectId: ${logEntryId}`)
        logger('info', [logPrefix, 'oid from token matched entraId.in logs, updating logEntry'])
      }

      const finishedTimestamp = new Date()
      const runtime = finishedTimestamp - new Date(logEntry.startedTimestamp)
      await collection.updateOne({ _id: ObjectId.createFromHexString(logEntryId) }, { $set: { successful: true, status: 'okey-dokey', message: 'finished - user has logged in with both ID-porten and EntraID', finishedTimestamp: finishedTimestamp.toISOString(), runtime, result: 'Verified user', mfaLogin: { successful: true, timestamp: new Date().toISOString() } } })

      logger('info', [logPrefix, 'Creating stats element for bragging purposes'])
      try {
        await createMfaStat(tokenResponse.idTokenClaims.oid, logEntryId)
        logger('info', [logPrefix, 'Succesfully created stats element for bragging purposes'])
      } catch (error) {
        logger('warn', [logPrefix, `Whops, failed when creating stats element... This one will not be counted (logEntryId - ${logEntryId})`, error.response?.data || error.stack || error.toString()])
      }
      logger('info', [logPrefix, `Successfully authenticated user ${tokenResponse.idTokenClaims.preferred_username} by code, and updated logEntry ${logEntryId} with mfaLogin info. All is good responding to user`], context)
      return { status: 200, jsonBody: { displayName: tokenResponse.idTokenClaims.name, userPrincipalName: tokenResponse.idTokenClaims.preferred_username, logEntryId } }
    } catch (error) {
      logger('error', [logPrefix, 'Failed when trying to authenticate entra id user', error.response?.data || error.stack || error.toString()], context)
      return { status: 500, jsonBody: { message: 'Failed when trying to authenticate entra id user', data: error.response?.data || error.stack || error.toString() } }
    }
  }
})
