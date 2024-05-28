const { app } = require('@azure/functions')
const { checkNewLogEntries } = require('../schedules/check-new-log-entries')
const { logger } = require('@vtfk/logger')

app.timer('CheckNewLogEntries', {
  schedule: '*/20 * * * *', // Hvert 20 minutt
  handler: async (myTimer, context) => {
    logger('info', ['CheckNewLogEntries - new run', context])
    try {
      const updateResult = await checkNewLogEntries(context)
      logger('info', [`CheckNewLogEntries - finished running - result - ${updateResult}`, context])
    } catch (error) {
      logger('error', ['CheckNewLogEntries - failed when updating user collection', error.response?.data || error.stack || error.toString()])
    }
  }
})
