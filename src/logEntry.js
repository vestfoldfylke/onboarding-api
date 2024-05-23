const { logger } = require('@vtfk/logger')
const { MONGODB } = require('../config')
const { getMongoClient, closeMongoClient } = require('./mongo-client')

/**
 * @typedef LogEntry
 * @property {boolean} successful
 * @property {("started"|"okey-dokey"|"failed")} status
 * @property {string} message
 * @property {boolean} syncedToUserCollection
 * @property {string} startedTimestamp
 * @property {string} finishedTimestamp
 * @property {number} runtime
 * @property {string} action
 * @property {string} invocationId
 * @property {string} ipAddress
 * @property {string} userAgent
 * @property {string} userType
 * @property {string} result
 * @property {string} userType
 * @property {Object} idPorten
 * @property {Object} entraId
 * @property {Object} mfaLogin
 * @property {Object} [krr]
 * @property {Object} [resetPassword]
 * @property {Object} [sms]
 * @property {Object} [passwordChanged]
 */

/**
 *
 * @param {*} context
 * @param {*} request
 * @param {ansatt | elev} userType
 * @param {("ResetPassword"|"VerifyUser")} action
 * @returns {LogEntry} logEntry
 */

const createLogEntry = (context, request, userType, action) => {
  if (!action) throw new Error('Missing required param "action"')
  const logEntry = {
    successful: false,
    status: 'started',
    message: 'started',
    syncedToUserCollection: false,
    startedTimestamp: new Date().toISOString(),
    finishedTimestamp: null,
    runtime: null,
    action,
    invocationId: context.invocationId,
    ipAddress: request.headers.get('X-Forwarded-For') || 'Ukjent',
    userAgent: request.headers.get('user-agent'),
    userType,
    result: null,
    idPorten: {
      pid: null,
      amr: null,
      acr: null,
      result: {
        status: null,
        message: null
      }
    },
    entraId: {
      userPrincipalName: null,
      displayName: null,
      id: null,
      result: {
        status: null,
        message: null
      }
    },
    mfaLogin: {
      successful: false,
      timestamp: null
    }
  }
  if (action === 'ResetPassword') {
    logEntry.krr = {
      phoneNumber: null,
      result: {
        status: null,
        message: null
      }
    }
    logEntry.resetPassword = {
      result: {
        status: null,
        message: null
      }
    }
    logEntry.sms = {
      phoneNumber: null,
      result: {
        status: null,
        message: null
      }
    }
    logEntry.passwordChanged = {
      successful: false,
      timestamp: null
    }
  }

  return logEntry
}

/**
 *
 * @param {Object} logEntry
 * @returns {import('mongodb').ObjectId}
 */
const insertLogEntry = async (logEntry) => {
  const mongoClient = await getMongoClient()
  try {
    const collection = mongoClient.db(MONGODB.DB_NAME).collection(MONGODB.LOG_COLLECTION)
    const { insertedId } = await collection.insertOne(logEntry)
    return insertedId
  } catch (error) {
    if (error.toString().startsWith('MongoTopologyClosedError')) {
      logger('warn', 'Oh no, topology is closed! Closing client')
      closeMongoClient()
    }
    throw error
  }
}

/**
 *
 * @param {import('mongodb').ObjectId} objectId
 * @param {Object} logEntry
 */
const updateLogEntry = async (objectId, logEntry, context) => {
  try {
    const mongoClient = await getMongoClient()
    const collection = mongoClient.db(MONGODB.DB_NAME).collection(MONGODB.LOG_COLLECTION)
    await collection.findOneAndReplace({ _id: objectId }, logEntry)
    logger('info', ['LogEntry successfully updated (replaced) in mongodb'], context)
  } catch (error) {
    if (error.toString().startsWith('MongoTopologyClosedError')) {
      logger('warn', 'Oh no, topology is closed! Closing client')
      closeMongoClient()
    }
    logger('error', ['Oh no, logEntry was not updated, this will be lost, do not tell anyone...', error.response?.data || error.stack || error.toString()], context)
  }
}

module.exports = { createLogEntry, insertLogEntry, updateLogEntry }
