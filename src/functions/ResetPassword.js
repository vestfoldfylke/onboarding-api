const { app } = require('@azure/functions')
const { resetPassword, getUserByExtensionAttributeSsn } = require('../call-graph')
const { logger, logConfig } = require('@vtfk/logger')
const { getStateCache } = require('../state-cache')
const { getIdPortenClient } = require('../idporten-client')
const { IDPORTEN, DEMO_MODE } = require('../../config')
const { getKrrPerson } = require('../krr')
const { default: axios } = require('axios')
const { sendSms } = require('../sms')

const maskSsn = (ssn) => {
  return `${ssn.substring(0,6)}*****` // 123456*****
}

const fixPhoneNumber = (phoneNumber) => {
  let fixedPhoneNumber = phoneNumber
  if (fixedPhoneNumber.startsWith('+')) fixedPhoneNumber = fixedPhoneNumber.substring(1)
  if (fixedPhoneNumber.length === 12 && fixedPhoneNumber.startsWith('00')) fixedPhoneNumber = fixedPhoneNumber.substring(2)
  if (fixedPhoneNumber.length !== 10) throw new Error(`We cannot send sms to this phonenumber, wrong format: ${phoneNumber}`)
  return fixedPhoneNumber
}

const stateCache = getStateCache()

app.http('ResetPassword', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    // Validate request body
    const { code, iss, state } = await request.json()
    if (!(code && iss && state)) {
      logger('warn', ['Someone called ResetPassword without code, iss, and state in body - is someone trying to hack us?'])
      return { status: 400, jsonBody: { message: 'Du har glemt state og iss og code i body da' } }
    }

    // Verify type as well, just for extra credits
    if ([code, iss, state].some(param => typeof param !== 'string')) {
      logger('warn', ['Someone called ResetPassword without code, iss, and state as strings - is someone trying to hack us?'])
      return { status: 400, jsonBody: { message: 'Du har glemt at state, iss, og code skal være string...' } }
    }

    // Check that state exist in cache (originates from authorization)
    const checks = stateCache.get(state)
    if (!checks) {
      logger('warn', ['The state sent by user does not match any state in state cache - is someone trying to be smart?'])
      return { status: 500, jsonBody: { message: 'Fant ingen startet pålogging med denne staten - har du venta for lenge?' } }
    }

    // Check state param for userType (startswith)
    const userType = state.startsWith('ansatt') ? 'ansatt' : state.startsWith('elev') ? 'elev' : null
    if (!userType) {
      logger('warn', ['The state sent by user does not start with "ansatt" or "elev", either someone is klussing, or we developers are idiots (we are anyways..)'])
      return { status: 400, jsonBody: { message: 'Hva slags state er det du har fått til å sende inn? Den er ikke gyldig hvertfall' } }
    }

    const user = {
      userType,
      ssn: null,
      maskedSsn: null,
      userPrincipalName: null,
      displayName: null,
      phoneNumber: null,
      newPassword: null,
      logoutUrl: null
    }

    logger('info', ['"state" is ok, "code" and "iss" is present in body, continuing to fetch tokens from ID-porten'])

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

      console.log(idTokenClaims)

      // Set user ssn as pid from id token (if not demo)
      if (DEMO_MODE.ENABLED && DEMO_MODE.SSN) {
        logger('warn', ['DEMO_MODE is enabled, and DEMO_MODE_SSN is set, setting user.ssn to DEMO_MODE_SSN'])
        user.ssn = DEMO_MODE.SSN
      } else {
        user.ssn = idTokenClaims.pid // pid in id-token is identity number of user
      }

      // Set masked ssn for logging
      user.maskedSsn = maskSsn(user.ssn)

      // If tokens are ok - delete state for this request
      stateCache.del(state)
    } catch (error) {
      logger('error', ['Failed when trying to get tokens from ID-porten', error.response?.data || error.stack || error.toString()])
      return { status: 500, jsonBody: { message: 'Failed when trying to get tokens from ID-porten', data: error.response?.data || error.stack || error.toString() } }
    }

    // Have ssn - set masked ssn as log prefix
    logConfig({
      prefix: user.maskedSsn
    })

    // Fetch user from EntraId
    logger('info', ['ID-porten is okey dokey, trying to fetch user from Entra ID', ])
    if (user.userType === 'ansatt') {
      try {
        const entraUser = await getUserByExtensionAttributeSsn(user.ssn)
        if (DEMO_MODE.ENABLED && DEMO_MODE.UPN) {
          logger('warn', ['DEMO_MODE is enabled, and DEMO_MODE_UPN is set, setting user.userPrincipalName to DEMO_MODE_UPN'])
          user.userPrincipalName = DEMO_MODE.UPN
          user.displayName = 'DEMO-BRUKER'
        } else {
          user.userPrincipalName = entraUser.userPrincipalName
          user.displayName = entraUser.displayName
        }
      } catch (error) {
        logger('error', ['Failed when fetching user from Entra ID', error.response?.data || error.stack])
        return { status: 500, jsonBody: { message: 'Failed when fetching user from Entra ID', data: error.response?.data || error.stack } }
      }
    }

    if (userType === 'elev') {
      console.log('elev - har ikke gjort no enda')
    }

    // Have upn - set masked ssn and upn as log prefix
    logConfig({
      prefix: `${user.maskedSsn} - ${user.userPrincipalName}`
    })

    logger('info', ['Entra ID is okey dokey, trying to fetch user from KRR'])
    // Get user from KRR (kontakt og reservasjonsregisteret)
    try {
      const krrPerson = await getKrrPerson(user.ssn)
      if (!krrPerson.kontaktinformasjon?.mobiltelefonnummer) throw new Error('Found person in KRR, but person has not registered any phone number :(')
      if (DEMO_MODE.ENABLED && DEMO_MODE.PHONE_NUMBER) {
        logger('warn', ['DEMO_MODE is enabled, and DEMO_MODE_PHONE_NUMBER is set, setting user.phoneNumber to DEMO_MODE_PHONE_NUMBER'])
        user.phoneNumber = DEMO_MODE.PHONE_NUMBER
      } else {
        user.phoneNumber = krrPerson.kontaktinformasjon.mobiltelefonnummer
      }
    } catch (error) {
      logger('error', ['Failed when fetching KRR info for person', error.response?.data || error.stack])
      return { status: 500, jsonBody: { message: 'Failed when fetching KRR info for person', data: error.response?.data || error.stack } }
    }

    logger('info', [`KRR is okey dokey, trying to reset password for user`])
    // Reset password for user
    try {
      if (DEMO_MODE.ENABLED && DEMO_MODE.MOCK_RESET_PASSWORD) {
        logger('warn', ['DEMO_MODE is enabled, and DEMO_MODE_MOCK_RESET_PASSWORD is true, will not reset password, simply pretend to do it'])
        user.newPassword = 'Bare et mocke-passord 123, funker itj nogon stans'
      } else {
        const { resetPasswordResponse, newPassword } = await resetPassword(user.userPrincipalName)
        if (resetPasswordResponse.status !== 'succeeded') {
          logger('error', ['Failed when resetting password', resetPasswordResponse])
          return { status: 500, jsonBody: resetPasswordResponse }
        }
        user.newPassword = newPassword
      }
    } catch (error) {
      logger('error', ['Failed when resetting password', error.response?.data || error.stack || error.toString()])
      return { status: error.response?.status || 500, jsonBody: error.response?.data || error.stack || error.toString() }
    }

    logger('info', [`Reset password is okey dokey, sending sms to user`])
    // Send password on sms
    try {
      const message = user.newPassword
      const phoneNumber = fixPhoneNumber(user.phoneNumber)
      await sendSms(phoneNumber, message)
      logger('info', ['Sent new password on sms to', `****${phoneNumber.substring(6)}`])
    } catch (error) {
      logger('error', [`Failed when sending sms`, error.response?.data || error.stack])
      return { status: 500, jsonBody: { message: 'Failed when sending sms', data: error.response?.data || error.stack } }
    }

    // Lagre alt mulig til mongodb - harSatt2faktor: false, byttaPassord: false - nattlig synk som går gjennom og sjekker, og oppdaterer om det trengs

    // Lagre et statistikk element for det som går bra

    // Hvor mange har vært inne å satt passordet - per skole, per userType

    // Hvordan får vi opprettet et element som sier at de BÅDE har satt to faktor, passord, OG logget inn via ID-porten
    
    // Logout user from id-porten
    // Run callback for authorization - fetches tokens for user, validates the authentication
    try {
      // Get idPorten client
      const logoutUrl = idPortenClient.endSessionUrl({ state })

      console.log(logoutUrl)
      user.logoutUrl = logoutUrl
      // const { data } = await axios.get(logoutUrl) // Dette fungerer ikke....
      //console.log(data)
    } catch (error) {
      logger('error', ['Failed when trying logout user from ID-porten', error.response?.data || error.stack || error.toString()])
      return { status: 500, jsonBody: { message: 'Failed when trying logout user from ID-porten', data: error.response?.data || error.stack || error.toString() } }
    }

    return { status: 200, jsonBody: user }

    // Skal vi logge ut brukeren uansett hvordan det gikk eller?
  }
})
