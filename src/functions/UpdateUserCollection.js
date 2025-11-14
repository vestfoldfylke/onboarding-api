const { app } = require('@azure/functions')
const { logger } = require('@vestfoldfylke/loglady')
const { updateUsers } = require('../schedules/update-users')

app.timer('UpdateUserCollection', {
  schedule: '0 2 * * *', // Kl 02:00 om natta
  handler: async (myTimer, _) => {
    logger.info('UpdateUserCollection - new run')
    try {
      const updateResult = await updateUsers()
      logger.info('UpdateUserCollection - finished running - UpdateResult: {UpdateResult}', updateResult)
    } catch (error) {
      logger.errorException(error, 'UpdateUserCollection - failed when updating user collection. Error: {@Error}', error.response?.data || error.stack || error.toString())
    }
  }
})
