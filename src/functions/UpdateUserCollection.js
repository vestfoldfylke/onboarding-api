const { app } = require('@azure/functions')
const { logger } = require('@vtfk/logger')
const { updateUsers } = require('../schedules/update-users')

app.timer('UpdateUserCollection', {
  schedule: '0 0 2 ? * * *', // Kl 02:00 om natta
  handler: async (myTimer, context) => {
    logger('info', ['UpdateUserCollection - new run'], context)
    try {
      const updateResult = await updateUsers(context)
      logger('info', [`UpdateUserCollection - finished running - result - ${updateResult}`], context)
    } catch (error) {
      logger('error', ['UpdateUserCollection - failed when updating user collection', error.response?.data || error.stack || error.toString()], context)
    }
  }
})
