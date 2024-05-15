const { app } = require('@azure/functions')
const { resetPassword, getUserByExtensionAttributeSsn, getUserByCustomSecurityAttributeSsn } = require('../call-graph')
const { logger, logConfig } = require('@vtfk/logger')
const { getStateCache } = require('../state-cache')
const { getIdPortenClient } = require('../idporten-client')
const { IDPORTEN, DEMO_MODE } = require('../../config')
const { getKrrPerson } = require('../krr')
const { sendSms } = require('../sms')
const { createLogEntry, insertLogEntry, updateLogEntry } = require('../logEntry')
const { createStat } = require('../stats')

const maskSsn = (ssn) => {
  return `${ssn.substring(0, 6)}*****` // 123456*****
}

const maskPhoneNumber = (phoneNumber) => {
  return `+${phoneNumber.substring(0, 2)} *****${phoneNumber.substring(7)}` // +47 *****682
}

const fixPhoneNumber = (phoneNumber) => {
  let fixedPhoneNumber = phoneNumber
  if (fixedPhoneNumber.startsWith('+')) fixedPhoneNumber = fixedPhoneNumber.substring(1)
  if (fixedPhoneNumber.length === 12 && fixedPhoneNumber.startsWith('00')) fixedPhoneNumber = fixedPhoneNumber.substring(2)
  if (fixedPhoneNumber.length !== 10) throw new Error(`We cannot send sms to this phonenumber, wrong format: ${phoneNumber}`)
  return fixedPhoneNumber
}

/**
 *
 * @param {Object} error
 * @param {('idPorten'|'entraId'|'krr'|'resetPassword'|'sms'|'logout'|'changedPassword'|'mfa')} error.jobName
 * @param {string} [error.message]
 * @param {string} [error.status]
 * @param {string} error.jobName
 * @param {Object} error.logEntry
 * @param {import('mongodb').ObjectId} error.logEntryId
 * @param {Error} error.error
 *
 * @returns
 */
const handleError = async (error, context) => {
  if (!error.error) throw new Error('Missing required parameter "error.error"')
  if (!error.logEntry) throw new Error('Missing required parameter "error.logEntry"')
  if (!error.logEntryId) throw new Error('Missing required parameter "error.logEntryId"')
  if (!error.jobName) throw new Error('Missing required parameter "error.jobName"')
  if (!error.status) error.status = 500
  if (!error.message) error.message = `Failed when running job "${error.jobName}"`
  const errorData = error.error.response?.data || error.error.stack || error.error.toString()
  logger('error', [error.message, errorData], context)
  error.logEntry.status = 'failed'
  error.logEntry.finishedTimestamp = new Date().toISOString()
  error.logEntry.result = error.message
  error.logEntry.message = error.message
  error.logEntry[error.jobName].result = {
    status: 'failed',
    message: errorData
  }
  await updateLogEntry(error.logEntryId, error.logEntry)
  return { status: error.status, jsonBody: { message: error.message, data: errorData } }
}

const stateCache = getStateCache()

app.http('ResetPassword', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    // Validate request body
    const { code, iss, state } = await request.json()
    if (!(code && iss && state)) {
      logger('warn', ['Someone called ResetPassword without code, iss, and state in body - is someone trying to hack us?'], context)
      return { status: 400, jsonBody: { message: 'Du har glemt state og iss og code i body da' } }
    }

    // Verify type as well, just for extra credits
    if ([code, iss, state].some(param => typeof param !== 'string')) {
      logger('warn', ['Someone called ResetPassword without code, iss, and state as strings - is someone trying to hack us?'], context)
      return { status: 400, jsonBody: { message: 'Du har glemt at state, iss, og code skal være string...' } }
    }

    // Check that state exist in cache (originates from authorization)
    const checks = stateCache.get(state)
    if (!checks) {
      logger('warn', ['The state sent by user does not match any state in state cache - is someone trying to be smart?'], context)
      return { status: 500, jsonBody: { message: 'Fant ingen startet pålogging med denne staten - har du venta for lenge?' } }
    }

    // Check state param for userType (startswith)
    const userType = state.startsWith('ansatt') ? 'ansatt' : state.startsWith('elev') ? 'elev' : null
    if (!userType) {
      logger('warn', ['The state sent by user does not start with "ansatt" or "elev", either someone is klussing, or we developers are idiots (we are anyways..)'], context)
      return { status: 400, jsonBody: { message: 'Hva slags state er det du har fått til å sende inn? Den er ikke gyldig hvertfall' } }
    }

    const user = {
      userType,
      ssn: null,
      maskedSsn: null,
      id: null,
      userPrincipalName: null,
      displayName: null,
      phoneNumber: null,
      newPassword: null,
      logoutUrl: null
    }

    logger('info', ['"state" is ok, "code" and "iss" is present in body, creating log entry in db'], context)

    const logEntry = createLogEntry(context, request, userType)

    let logEntryId
    try {
      logEntryId = await insertLogEntry(logEntry)
    } catch (error) {
      logger('error', ['Failed when trying to create logEntry in mongodb', error.response?.data || error.stack || error.toString()], context)
      return { status: 500, jsonBody: { message: 'Failed when trying to save logEntry in database', data: error.response?.data || error.stack || error.toString() } }
    }

    logger('info', ['Log entry successfully created, continuing to fetch tokens from ID-porten'], context)

    // Run callback for authorization - fetches tokens for user, validates the authentication
    let idPortenClient
    let tokens
    try {
      // Get idPorten client
      idPortenClient = await getIdPortenClient()

      // Fetch tokens. Verifies code_verifier, state, and nonce
      tokens = await idPortenClient.callback(IDPORTEN.ClIENT_REDIRECT_URI, { code, iss, state }, { code_verifier: checks.codeVerifier, nonce: checks.nonce, state })

      // Get id token claims
      const idTokenClaims = tokens.claims()

      // Set user ssn as pid from id token (if not demo)
      if (DEMO_MODE.ENABLED && DEMO_MODE.SSN) {
        logger('warn', ['DEMO_MODE is enabled, and DEMO_MODE_SSN is set, setting user.ssn to DEMO_MODE_SSN'], context)
        user.ssn = DEMO_MODE.SSN
      } else {
        user.ssn = idTokenClaims.pid // pid in id-token is identity number of user
      }

      // Set masked ssn for logging
      user.maskedSsn = maskSsn(user.ssn)

      // If tokens are ok - delete state for this request
      stateCache.del(state)

      // Set log entry properties
      logEntry.idPorten = {
        pid: idTokenClaims.pid,
        acr: idTokenClaims.acr,
        amr: idTokenClaims.amr,
        result: {
          status: 'okey-dokey',
          message: 'Logged in with id-porten'
        }
      }
    } catch (error) {
      const { status, jsonBody } = await handleError({ error, jobName: 'idPorten', logEntry, logEntryId, message: 'Failed when trying to get tokens from ID-porten', status: 500 }, context)
      return { status, jsonBody }
    }

    // Have ssn - set masked ssn as log prefix
    logConfig({
      prefix: `${user.userType} - ${user.maskedSsn} - logEntryId: ${logEntryId}`
    })

    // Fetch user from EntraId
    logger('info', ['ID-porten is okey dokey, trying to fetch user from Entra ID'], context)
    try {
      let entraUser
      if (user.userType === 'ansatt') {
        entraUser = await getUserByExtensionAttributeSsn(user.ssn)
      } else if (user.userType === 'elev') {
        entraUser = await getUserByCustomSecurityAttributeSsn(user.ssn)
      }
      // Hvis ingen bruker returner vi tidlig med beskjed
      if (!entraUser.id) {
        await handleError({ error: 'Could not find entraID user on ssn', jobName: 'entraId', logEntry, logEntryId, message: 'Could not find entraID user on ssn.', status: 500 }, context)
        return { status: 200, jsonBody: { hasError: true, message: 'Fant ingen bruker hos oss med ditt fødselsnummer, ta kontakt med servicedesk eller din leder dersom du mener dette er feil.' } }
      }
      if (DEMO_MODE.ENABLED && DEMO_MODE.UPN) {
        logger('warn', ['DEMO_MODE is enabled, and DEMO_MODE_UPN is set, setting user.userPrincipalName to DEMO_MODE_UPN'], context)
        user.id = 'DEMO-ID'
        user.userPrincipalName = DEMO_MODE.UPN
        user.displayName = 'DEMO-BRUKER'
      } else {
        user.id = entraUser.id
        user.userPrincipalName = entraUser.userPrincipalName
        user.displayName = entraUser.displayName
      }
      logEntry.entraId = {
        userPrincipalName: user.userPrincipalName,
        displayName: user.displayName,
        id: user.id,
        result: {
          status: 'okey-dokey',
          message: 'Successfully found user in entraId'
        }
      }
    } catch (error) {
      const { status, jsonBody } = await handleError({ error, jobName: 'entraId', logEntry, logEntryId, message: 'Feilet ved henting av bruker - prøv igjen senere, eller kontakt servicesk', status: 500 }, context)
      return { status, jsonBody }
    }

    // Have upn - set masked ssn and upn as log prefix
    logConfig({
      prefix: `${user.userType} - ${user.maskedSsn} - logEntryId: ${logEntryId} - ${user.userPrincipalName}`
    })

    logger('info', ['Entra ID is okey dokey, trying to fetch user from KRR'], context)
    // Get user from KRR (kontakt og reservasjonsregisteret)
    try {
      const krrPerson = await getKrrPerson(user.ssn)
      if (!krrPerson.kontaktinformasjon?.mobiltelefonnummer) {
        await handleError({ error: 'Found person in KRR, but person has not registered any phone number :( cannot help it', jobName: 'entraId', logEntry, logEntryId, message: 'Found person in KRR, but person has not registered any phone number :( cannot help it', status: 500 }, context)
        return { status: 200, jsonBody: { hasError: true, message: 'Fant ikke telefonnummeret ditt i kontakt- og reservasjonsregisteret, så vi får ikke sendt noe sms :( Ta kontakt med servicedesk.' } }
      }
      if (DEMO_MODE.ENABLED && DEMO_MODE.PHONE_NUMBER) {
        logger('warn', ['DEMO_MODE is enabled, and DEMO_MODE_PHONE_NUMBER is set, setting user.phoneNumber to DEMO_MODE_PHONE_NUMBER'], context)
        user.phoneNumber = DEMO_MODE.PHONE_NUMBER
      } else {
        user.phoneNumber = krrPerson.kontaktinformasjon.mobiltelefonnummer
      }
      logEntry.krr = {
        phoneNumber: user.phoneNumber,
        result: {
          status: 'okey-dokey',
          message: 'Successfully found person and phonenumber in KRR'
        }
      }
    } catch (error) {
      const { status, jsonBody } = await handleError({ error, jobName: 'krr', logEntry, logEntryId, message: 'Failed when fetching KRR info for person', status: 500 }, context)
      return { status, jsonBody }
    }

    logger('info', ['KRR is okey dokey, trying to reset password for user'], context)
    // Reset password for user
    try {
      if (DEMO_MODE.ENABLED && DEMO_MODE.MOCK_RESET_PASSWORD) {
        logger('warn', ['DEMO_MODE is enabled, and DEMO_MODE_MOCK_RESET_PASSWORD is true, will not reset password, simply pretend to do it'], context)
        user.newPassword = 'Bare et mocke-passord 123, funker itj nogon stans'
      } else {
        const { newPassword } = await resetPassword(user.userPrincipalName)
        user.newPassword = newPassword
      }
      logEntry.resetPassword = {
        result: {
          status: 'okey-dokey',
          message: 'Successfully reset password for user'
        }
      }
    } catch (error) {
      const { status, jsonBody } = await handleError({ error, jobName: 'resetPassword', logEntry, logEntryId, message: 'Failed when resetting password', status: 500 }, context)
      return { status, jsonBody }
    }

    logger('info', ['Reset password is okey dokey, sending sms to user'], context)
    // Send password on sms
    try {
      const message = user.newPassword
      user.phoneNumber = fixPhoneNumber(user.phoneNumber)
      await sendSms(user.phoneNumber, message)
      logEntry.sms = {
        phoneNumber: user.phoneNumber,
        result: {
          status: 'okey-dokey',
          message: 'Successfully sent sms'
        }
      }
      logger('info', ['Sent new password on sms to', maskPhoneNumber(user.phoneNumber)], context)
    } catch (error) {
      const { status, jsonBody } = await handleError({ error, jobName: 'sms', logEntry, logEntryId, message: 'Failed when sending sms', status: 500 }, context)
      return { status, jsonBody }
    }

    logger('info', ['Send sms is okey dokey, sending sms to user'], context)
    // Set logEntry values and save
    logEntry.successful = true
    logEntry.finishedTimestamp = new Date().toISOString()
    logEntry.message = 'Successfully reset password'
    logEntry.status = 'okey-dokey'
    logEntry.result = 'Successfully logged in with IO-porten and reset password in Entra ID'
    try {
      await updateLogEntry(logEntryId, logEntry)
    } catch (error) {
      logger('warn', ['Aiaiaia, failed when saving logEntry to mongodb - this one will be lost...', error.response?.data || error.stack || error.toString()], context)
    }

    // Lagre et statistikk element for det som går bra??
    try {
      await createStat(user.id, logEntryId.toString())
    } catch (error) {
      logger('warn', ['Aiaiaia, failed when creating statistics element - this one will be lost...', error.response?.data || error.stack || error.toString()], context)
    }

    const response = {
      displayName: user.displayName,
      userPrincipalName: user.userPrincipalName,
      maskedPhoneNumber: maskPhoneNumber(user.phoneNumber)
    }

    return { status: 200, jsonBody: response }

    // Hvis vi har en knapp for LOGG ut av id-porten - som bare returnerer den lenka man trenger, så er vi jo good?

    // Skal vi logge ut brukeren uansett hvordan det gikk eller, får det itj til - kan evt sende de rett til utlogging etter ferdig - med en state, som kan hente litt stæsj?
  }
})
