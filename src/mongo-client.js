const { MongoClient } = require('mongodb')
const { MONGODB } = require('../config')
const { logger } = require('@vestfoldfylke/loglady')

let client = null

/**
 *
 * @returns { import('mongodb').MongoClient }
 */
const getMongoClient = async () => {
  if (!client) {
    logger.info('Client does not exist - creating')
    client = new MongoClient(MONGODB.CONNECTION_STRING)
    logger.info('Client connected')
  }
  return client
}

const closeMongoClient = () => {
  if (client) client.close()
  client = null
}

module.exports = { getMongoClient, closeMongoClient }
