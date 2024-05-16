const { logger } = require('@vtfk/logger')
const { MONGODB } = require('../config')
const { getMongoClient, closeMongoClient } = require('./mongo-client')

/**
 * @typedef LogEntry
 * @property {boolean} successful
 * @property {boolean} passwordChanged
 * @property {("running"|"okey-dokey"|"failed")} status
 * @property {string} message
 * @property {string} startedTimestamp
 * @property {string} finishedTimestamp
 * @property {string} action
 * @property {string} invocationId
 * @property {string} ipAddress
 * @property {string} userAgent
 * @property {string} userType
 * @property {string} result
 * @property {string} userType
 * @property {Object} idPorten
 * @property {Object} entraId
 * @property {Object} krr
 * @property {Object} resetPassword
 * @property {Object} sms
 * @property {Object[]} authenticationMethods
 */

/**
 *
 * @param {*} context
 * @param {*} request
 * @param {ansatt | elev} userType
 * @returns {LogEntry} logEntry
 */

const createLogEntry = (context, request, userType) => {
  return {
    successful: false,
    passwordChanged: false,
    status: 'running',
    message: 'running',
    startedTimestamp: new Date().toISOString(),
    finishedTimestamp: null,
    action: 'ResetPassword',
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
    krr: {
      phoneNumber: null,
      result: {
        status: null,
        message: null
      }
    },
    resetPassword: {
      result: {
        status: null,
        message: null
      }
    },
    sms: {
      phoneNumber: null,
      result: {
        status: null,
        message: null
      }
    },
    authenticationMethods: []
  }
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
