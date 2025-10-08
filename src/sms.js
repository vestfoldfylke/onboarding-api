const axios = require('axios')
const { SMS } = require('../config')

const sendSms = async (phoneNumber, message) => {
  const payload = {
    receivers: [phoneNumber],
    message,
    sender: SMS.SENDER
  }
  const { data } = await axios.post(`${SMS.URL}/SendSMS`, payload, { headers: { 'x-functions-key': SMS.KEY } })
  return data
}

module.exports = { sendSms }
