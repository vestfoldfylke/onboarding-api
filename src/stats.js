const { default: axios } = require('axios')
const { STATISTICS } = require('../config')
const { name, version } = require('../package.json')

/**
 * @param {string} entraIdObjectId
 * 
 */
const createStat = async (entraIdObjectId, mongodbObjectId) => {
  if (!(entraIdObjectId && mongodbObjectId)) throw new Error('Missing required parameters: entraIdObjectId, mongodbObjectId')
  const payload = {
    system: 'onbaording',
    engine: `${name} ${version}`,
    company: 'IT',
    description: 'En bruker som har logget på med ID-porten og resatt passordet sitt i EntraId',
    type: 'ResetPassword',
    externalId: mongodbObjectId,
    entraIdObjectId
  }
  const { data } = await axios.post(`${STATISTICS.URL}/Stats`, payload, { headers: { 'x-functions-key': STATISTICS.KEY } })
  return data
}

module.exports = { createStat }
