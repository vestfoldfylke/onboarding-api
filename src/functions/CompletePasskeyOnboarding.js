const { app } = require('@azure/functions')
const { getStateCache } = require('../state-cache')
const { logger } = require('@vestfoldfylke/loglady')
const { MONGODB, DEMO_MODE } = require('../../config')
const { getMongoClient } = require('../mongo-client')
const { hasRegisteredPasskey } = require('../authentication-methods')
const { ObjectId } = require('mongodb')

const stateCache = getStateCache()

app.http('CompletePasskeyOnboarding', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, _) => {
    let logPrefix = 'CompletePasskeyOnboarding'
    logger.info('{LogPrefix} - New request', logPrefix)
    // Validate request body
    const { logEntryId } = await request.json()
    if (!logEntryId || typeof logEntryId !== 'string') {
      logger.warn('{LogPrefix} - Someone called CompletePasskeyOnboarding without logEntryId as string in body - is someone trying to hack us?', logPrefix)
      return { status: 400, jsonBody: { message: 'Du har glemt logEntryId i body da' } }
    }

    logPrefix += ` - logEntryId: ${logEntryId}`

    // Check that completion state exist in cache (originates from StartPasskeyOnboarding)
    const checks = stateCache.get(`passkeycomplete${logEntryId}`)
    if (!checks) {
      logger.warn('{LogPrefix} - The logEntryId sent by user does not match any completion state in state cache - user was probs not fast enough. CHOO CHOOO!', logPrefix)
      return { status: 500, jsonBody: { message: 'Du har brukt for lang tid, rykk tilbake til start' } }
    }

    try {
      logger.info('{LogPrefix} - Fetching matching logEntry from mongodb', logPrefix)
      const mongoClient = await getMongoClient()
      const collection = mongoClient.db(MONGODB.DB_NAME).collection(MONGODB.LOG_COLLECTION)

      const logEntry = await collection.findOne({ _id: ObjectId.createFromHexString(logEntryId) })
      if (!logEntry) {
        throw new Error('Could not find a corresponding logEntry for this completion state, restart the process from the client')
      }
      if (logEntry.action !== 'PasskeyOnboarding') {
        logger.warn('{LogPrefix} - LogEntry action is not "PasskeyOnboarding", someone is mixing flows - is someone trying to be smart?', logPrefix)
        return { status: 400, jsonBody: { message: 'Denne oppføringen tilhører ikke passkey-flyten, rykk tilbake til start' } }
      }
      logger.info('{LogPrefix} - Found corresponding logEntry - checking if user has registered a passkey', logPrefix)

      // Check if we have DEMO_USER_OVERRIDE for the pid that started the flow
      const DEMO_USER_OVERRIDE = (DEMO_MODE.ENABLED && DEMO_MODE.DEMO_USERS && DEMO_MODE.DEMO_USERS[logEntry.idPorten.pid]) || null

      let passkeyRegistered
      if (DEMO_MODE.ENABLED && DEMO_USER_OVERRIDE?.MOCK_PASSKEY_REGISTERED !== undefined && DEMO_USER_OVERRIDE?.MOCK_PASSKEY_REGISTERED !== null) {
        logger.warn('{LogPrefix} - DEMO_MODE is enabled, and DEMO_USER_OVERRIDE.MOCK_PASSKEY_REGISTERED is present, will not check Graph, simply pretend to do it', logPrefix)
        passkeyRegistered = DEMO_USER_OVERRIDE.MOCK_PASSKEY_REGISTERED === 'true'
      } else if (DEMO_MODE.ENABLED && !DEMO_USER_OVERRIDE && DEMO_MODE.GLOBAL_MOCK_PASSKEY_ONBOARDING) {
        logger.warn('{LogPrefix} - DEMO_MODE is enabled, and DEMO_MODE.GLOBAL_MOCK_PASSKEY_ONBOARDING is true, will not check Graph, simply pretend user has registered a passkey', logPrefix)
        passkeyRegistered = true
      } else {
        passkeyRegistered = await hasRegisteredPasskey(logEntry.entraId.userPrincipalName)
      }

      if (!passkeyRegistered) {
        logger.info('{LogPrefix} - User has not registered a passkey yet, responding with completed false so user can try again', logPrefix)
        return { status: 200, jsonBody: { completed: false, message: 'Fant ingen registrert passkey ennå - fullfør registreringen og prøv igjen' } }
      }

      const finishedTimestamp = new Date().toISOString()
      await collection.updateOne({ _id: ObjectId.createFromHexString(logEntryId) }, {
        $set: {
          successful: true,
          status: 'okey-dokey',
          message: 'finished - user has logged in with ID-porten and registered a passkey',
          finishedTimestamp,
          runtime: new Date(finishedTimestamp) - new Date(logEntry.startedTimestamp),
          result: 'Passkey registered',
          'passkeyOnboarding.passkeyRegisteredAt': finishedTimestamp,
          'passkeyOnboarding.result': {
            status: 'okey-dokey',
            message: 'Passkey registered'
          }
        }
      })

      // Completion state is used up
      stateCache.del(`passkeycomplete${logEntryId}`)

      logger.info('{LogPrefix} - User {UserPrincipalName} has registered a passkey, updated logEntry, responding to user', logPrefix, logEntry.entraId.userPrincipalName)
      return { status: 200, jsonBody: { completed: true, displayName: logEntry.entraId.displayName, userPrincipalName: logEntry.entraId.userPrincipalName, logEntryId } }
    } catch (error) {
      logger.errorException(error, '{LogPrefix} - Failed when trying to complete passkey onboarding. Error: {@Error}', logPrefix, error.response?.data || error.stack || error.toString())
      return { status: 500, jsonBody: { message: 'Failed when trying to complete passkey onboarding', data: error.response?.data || error.stack || error.toString() } }
    }
  }
})
