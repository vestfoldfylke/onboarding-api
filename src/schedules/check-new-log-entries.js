/*
Hent alle log-entries som er successful men ikke har fått sjekka om mfa og sånt er satt
Gå gjennom hver eneste og oppdater om de har satt passord og mfa
Oppdater også i den store fine users-collection
*/

const { logger } = require('@vestfoldfylke/loglady')
const { getMongoClient } = require('../mongo-client')
const { getAuthenticationMethods, getEntraUser } = require('../call-graph')
const { MONGODB, GRAPH } = require('../../config')
const { repackUser } = require('./update-users')

const checkNewLogEntries = async (context) => {
  const mongoClient = await getMongoClient()
  const logCollection = mongoClient.db(MONGODB.DB_NAME).collection(MONGODB.LOG_COLLECTION)
  const userCollection = mongoClient.db(MONGODB.DB_NAME).collection(MONGODB.USERS_COLLECTION)
  // const tenMinutesAgo = new Date(Date.now() - (1000 * 60 * 10)) // finishedTimestamp: { $lt: tenMinutesAgo.toISOString() } if you want to wait a bit

  /**
   * @type {import('../logEntry').LogEntry[]}
   */
  const successfulLogEntries = await logCollection.find({ successful: true, syncedToUserCollection: false }).toArray()
  logger.info('Found {LogEntryLength} new successful log entries to handle', successfulLogEntries.length)

  const checkedUsers = []
  for (const logEntry of successfulLogEntries) {
    if (checkedUsers.includes(logEntry.entraId.id)) continue // Already checked
    const entraUser = logEntry.entraId

    const logPrefix = `CheckNewLogEntries - ${entraUser.userPrincipalName}`

    logger.info('{LogPrefix} - Checking user', logPrefix)
    // Get all new entries for this user
    const userLogEntries = successfulLogEntries.filter(entry => entry.entraId.id === entraUser.id).sort((a, b) => new Date(b.finishedTimestamp) - new Date(a.finishedTimestamp)) // newest first
    const latestLogEntry = userLogEntries[0]

    /*
    // If we want authentication methods for user in reports
    logger.info('{LogPrefix} - Fetching authentication methods', logPrefix)
    const authenticationMethods = await getAuthenticationMethods(entraUser.id)
    logger.info('{LogPrefix} - Found {AuthenticationMethodLength} authentication methods', logPrefix, authenticationMethods.value.length)

    // Check if we have passwordmethod
    const passwordMethod = authenticationMethods.value.find(method => method['@odata.type'] === '#microsoft.graph.passwordAuthenticationMethod')
    if (!passwordMethod) {
      // Password not there yet
      checkedUsers.push(entraUser.id)
      logger.info('{LogPrefix} - have not changed password yet, continuing to next', logPrefix)
      continue
    }
    // Check if password is set AFTER latest logEntry was created
    const passwordChanged = new Date(passwordMethod.createdDateTime) > new Date(latestLogEntry.finishedTimestamp)
    if (!passwordChanged) {
      // Password not changed yet
      logger.info('{LogPrefix} - have not changed password yet, continuing to next', logPrefix)
      checkedUsers.push(entraUser.id)
      continue
    }
    const mfaMethods = authenticationMethods.value.filter(method => method['@odata.type'] !== '#microsoft.graph.passwordAuthenticationMethod')
    if (mfaMethods.length === 0) {
      // MFA not setup yet
      logger.info('{LogPrefix} - have not setup mfa yet, continuing to next', logPrefix)
      checkedUsers.push(entraUser.id)
      continue
    }

    // Now we know that the user have changed password, and have mfa methods, we can save stuff
    latestLogEntry.passwordChanged = true
    latestLogEntry.authenticationMethods = authenticationMethods

    logger.info('{LogPrefix} - have changed password and setup mfa, saving data to logEntry and to users collection', logPrefix)
    */

    logger.info('{LogPrefix} - LogEntry is ok, saving status to logEntry and latestLogEntry to users collection', logPrefix)

    // Save latestLogEntry to userObject in users, first check that the user exists
    const user = await userCollection.findOne({ id: entraUser.id })
    if (user) {
      const updateUserResult = await userCollection.updateOne({ _id: user._id }, { $set: { latestLogEntry } })
      logger.info('{LogPrefix} - Successfully updated user object. UpdateUserResult: {@UpdateUserResult}', logPrefix, updateUserResult)
    } else {
      // User was created after user-sync
      logger.warn('{LogPrefix} - EntraUser {UserPrincipalName} did not exist in users-collection, was it created today? Fetching some data before saving', logPrefix, entraUser.userPrincipalName)
      const entraResult = await getEntraUser(entraUser.id)
      const userType = entraUser.userPrincipalName.endsWith(GRAPH.EMPLOYEE_UPN_SUFFIX) ? 'ansatt' : 'elev'
      const repacked = repackUser(entraResult, { latestLogEntry }, userType)
      const createResult = await userCollection.insertOne(repacked)
      logger.info('{LogPrefix} - Successfully created user object for {UserPrincipalName}. CreateResult: {@CreateResult}', logPrefix, entraUser.userPrincipalName, createResult)
    }

    // Update logEntries
    logger.info('{LogPrefix} - All good in users-collection, updating {UserLogEntryLength} relevant logEntries in log-collection', logPrefix, userLogEntries.length)
    for (const userLogEntry of userLogEntries) {
      await logCollection.updateOne({ _id: userLogEntry._id }, { $set: { syncedToUserCollection: true } })
    }
    logger.info('{LogPrefix} - Updated {UserLogEntryLength} relevant logEntries in log-collection', logPrefix, userLogEntries.length)
  }
}

module.exports = { checkNewLogEntries }
