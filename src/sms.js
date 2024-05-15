const { default: axios } = require('axios')
const { SMS } = require('../config')

const sendSms = async (phoneNumber, message) => {
  const payload = {
    receivers: [phoneNumber],
    message,
    sender: SMS.SENDER
  }
  const { data } = await axios.post(`${SMS.URL}/SendSMS`, payload, { headers: { 'x-functions-key': SMS.KEY } })
  if (data.logon.toUpperCase() !== 'OK' || data.receivers[phoneNumber].toUpperCase() !== 'OK') {
    throw new Error(`Something went wrong ${JSON.stringify(data)}`)
  }
  return data
}

module.exports = { sendSms }
