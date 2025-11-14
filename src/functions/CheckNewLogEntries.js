const { app } = require('@azure/functions')
const { checkNewLogEntries } = require('../schedules/check-new-log-entries')
const { logger } = require('@vestfoldfylke/loglady')

app.timer('CheckNewLogEntries', {
  schedule: '*/20 * * * *', // Hvert 20 minutt
  handler: async (myTimer, context) => {
    logger.info('CheckNewLogEntries - new run')
    try {
      // TODO: Huh? Jørgen. Why get and log result when method is void?
      const updateResult = await checkNewLogEntries()
      logger.info('CheckNewLogEntries - finished running - result - {UpdateResult}', updateResult)
    } catch (error) {
      logger.errorException(error, 'CheckNewLogEntries - failed when updating user collection: {@Error}', error.response?.data || error.stack || error.toString())
    }
  }
})
