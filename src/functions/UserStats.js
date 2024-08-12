const { app } = require('@azure/functions')
const { getStateCache } = require('../state-cache')
const { logger } = require('@vtfk/logger')
const { getStatisticsClient } = require('../entra-client')
const { MONGODB, ENTRA_MFA, GRAPH } = require('../../config')
const { getMongoClient, closeMongoClient } = require('../mongo-client')

const stateCache = getStateCache()

app.http('UserStats', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    let logPrefix = 'UserStats'
    logger('info', [logPrefix, 'New request'], context)

    // Validate request body
    const { code, state } = await request.json()
    if (!(code && state)) {
      logger('warn', [logPrefix, 'Someone called UserStats without code and state in body - is someone trying to hack us?'], context)
      return { status: 400, jsonBody: { message: 'Du har glemt state og code i body da' } }
    }

    // Verify type as well, just for extra credits
    if ([code, state].some(param => typeof param !== 'string')) {
      logger('warn', [logPrefix, 'Someone called UserStats without code, and state as strings - is someone trying to hack us?'], context)
      return { status: 400, jsonBody: { message: 'Du har glemt at state, og code skal være string...' } }
    }

    // Check that state exist in cache (originates from authorization)
    const checks = stateCache.get(state)
    if (!checks) {
      logger('warn', [logPrefix, 'The state sent by user does not match any state in state cache - is someone trying to be smart?'], context)
      return { status: 500, jsonBody: { message: 'Du har brukt for lang tid, rykk tilbake til start' } }
    }
    try {
      const entraClient = getStatisticsClient()

      const tokenResponse = await entraClient.acquireTokenByCode({
        redirectUri: ENTRA_MFA.ClIENT_REDIRECT_URI,
        scopes: ['User.Read'],
        code,
        codeVerifier: checks.verifier
      })

      // If tokens are ok - delete state for this request
      stateCache.del(state)

      logPrefix = logPrefix + ` - ${tokenResponse.idTokenClaims.preferred_username}`

      // Check stats-role
      logger('info', [logPrefix, 'Validating stats role'], context)
      if (!tokenResponse.idTokenClaims.roles || !tokenResponse.idTokenClaims.roles.includes('Stats.Read')) {
        logger('warn', [logPrefix, 'Missing required stats role for this endpoint'], context)
        return { status: 401, jsonBody: { message: 'Du mangler rettigheter for å hente data her. Ta kontakt med systemansvarlig om du trenger data.' } }
      }
      logger('info', [logPrefix, 'stats role validated'], context)

      // User has admin-role
      /*
      Hent all statistikk-data som trengs og send til frontend
      */

      const mongoClient = await getMongoClient()
      let users
      try {
        logger('info', ['Fetching users collection'], context)
        const usersCollection = mongoClient.db(MONGODB.DB_NAME).collection(MONGODB.USERS_COLLECTION)
        users = await usersCollection.find({}).toArray()
        logger('info', [`Got ${users.length} users from users collection`], context)
      } catch (error) {
        if (error.toString().startsWith('MongoTopologyClosedError')) {
          logger('warn', 'Oh no, topology is closed! Closing client')
          closeMongoClient()
        }
        throw error
      }

      const schoolStats = []
      const administrationStats = []

      // Manual tweaks
      const verstfoldSchoolStates = [
        { state: 'OPT-FRV', companyName: 'Færder videregående skole' },
        { state: 'OPT-GRV', companyName: 'Greveskogen videregående skole' },
        { state: 'OPT-HOLV', companyName: 'Holmestrand videregående skole' },
        { state: 'OPT-HORV', companyName: 'Horten videregående skole' },
        { state: 'OPT-KB', companyName: 'Kompetansebyggeren' },
        { state: 'OPT-MEV', companyName: 'Melsom videregående skole' },
        { state: 'OPT-NTV', companyName: 'Nøtterøy videregående skole' },
        { state: 'OPT-OP', companyName: 'Seksjon OT og PPT' },
        { state: 'OPT-REV', companyName: 'Re videregående skole' },
        { state: 'OPT-SANV', companyName: 'Sande videregående skole' },
        { state: 'OPT-SFH', companyName: 'Sandefjord folkehøyskole' },
        { state: 'OPT-SFV', companyName: 'Sandefjord videregående skole' },
        { state: 'OPT-SMI', companyName: 'Skolen for sosialmedisinske institusjoner' },
        { state: 'OPT-THV', companyName: 'Thor Heyerdahl videregående skole' }
      ]
      const feleknarkSchoolStates = [
        { state: 'UT-BAV', companyName: 'Bamble videregående skole' },
        { state: 'UT-BOV', companyName: 'Bø vidaregåande skule' },
        { state: 'UT-FAGS', companyName: 'Fagskolen Vestfold og Telemark' },
        { state: 'UT-HJV', companyName: 'Hjalmar Johansen videregående skole' },
        { state: 'UT-KRV', companyName: 'Kragerø videregående skole' },
        { state: 'UT-NOMV', companyName: 'Nome videregående skole' },
        { state: 'UT-NOV', companyName: 'Notodden videregående skole' },
        { state: 'UT-POV', companyName: 'Porsgrunn videregående skole' },
        { state: 'UT-POA', companyName: 'Seksjon PPT, OT og alternative opplæringsarenaer' },
        { state: 'UT-RJV', companyName: 'Rjukan videregående skole' },
        { state: 'UT-SKIV', companyName: 'Skien videregående skole' },
        { state: 'UT-SKOV', companyName: 'Skogmo videregående skole' },
        { state: 'UT-VTV', companyName: 'Vest-Telemark vidaregåande skule' }
      ]

      const allSchoolStates = [...verstfoldSchoolStates, ...feleknarkSchoolStates]

      users.forEach(user => {
        // Check if we just can skip the user
        if (!user.accountEnabled) return
        if (GRAPH.EMPLOYEE_UPN_SUFFIX.endsWith('vestfoldfylke.no') && feleknarkSchoolStates.some(state => state === user.state || (user.userType === 'elev' && state.companyName === user.companyName))) return
        if (GRAPH.EMPLOYEE_UPN_SUFFIX.endsWith('telemarkfylke.no') && verstfoldSchoolStates.some(state => state === user.state || (user.userType === 'elev' && state.companyName === user.companyName))) return
        if (user.companyName === 'Vestfold og Telemark fylkeskommune - Lærling') return
        if (user.companyName === 'Vestfold og Telemark fylkeskommune - OT Ungdom') return
        if (!user.companyName) return

        // Check if is school employee (state is OPT-blabla) or student in school (comanyName is school name and type is student)
        const schoolState = allSchoolStates.find(school => school.state === user.state || (user.userType === 'elev' && school.companyName === user.companyName))
        if (schoolState) { // User belongs to a school
          if (!schoolStats.some(stat => stat.navn === schoolState.companyName)) {
            schoolStats.push({ // Check if stats for company is there already, if not, add it
              ansatt: {
                antall: 0,
                max: 0,
                fullføringsgrad: null
              },
              elev: {
                antall: 0,
                max: 0,
                fullføringsgrad: null
              },
              navn: schoolState.companyName
            })
          }
          const schoolStat = schoolStats.find(stat => stat.navn === schoolState.companyName)
          if (user.userType === 'ansatt') {
            schoolStat.ansatt.max++
            if (user.latestLogEntry) {
              schoolStat.ansatt.antall++
            }
          } else if (user.userType === 'elev') {
            schoolStat.elev.max++
            if (user.latestLogEntry) {
              schoolStat.elev.antall++
            }
          }
          // Finished with school user, can continue (to avoid double count ;))
          return
        }
        // Regular user, does not belong to school
        if (!administrationStats.some(stat => stat.navn === user.companyName)) {
          administrationStats.push({ // Check if stats for company is there already, if not, add it
            ansatt: {
              antall: 0,
              max: 0,
              fullføringsgrad: null
            },
            elev: {
              antall: 0,
              max: 0,
              fullføringsgrad: null
            },
            navn: user.companyName
          })
        }
        const administrationStat = administrationStats.find(stat => stat.navn === user.companyName)
        if (user.userType === 'ansatt') {
          administrationStat.ansatt.max++
          if (user.latestLogEntry) {
            administrationStat.ansatt.antall++
          }
        }
        if (user.userType === 'elev') {
          administrationStat.elev.max++
          if (user.latestLogEntry) {
            administrationStat.elev.antall++
          }
        }
      })

      // Calculate percentage for all stats, and wipe unecessary data (where students is 0)
      administrationStats.forEach(stat => {
        stat.ansatt.fullføringsgrad = Number(((stat.ansatt.antall / stat.ansatt.max) * 100).toFixed(2))
        stat.elev.fullføringsgrad = Number(((stat.elev.antall / stat.elev.max) * 100).toFixed(2))
        if (stat.elev.max === 0) stat.elev = null // don't need it
      })
      schoolStats.forEach(stat => {
        stat.ansatt.fullføringsgrad = Number(((stat.ansatt.antall / stat.ansatt.max) * 100).toFixed(2))
        stat.elev.fullføringsgrad = Number(((stat.elev.antall / stat.elev.max) * 100).toFixed(2))
        if (stat.elev.max === 0) stat.elev = null // don't need it
      })

      // Create csv data source
      const csvUsers = users.map(user => {
        user.onboardedTimestamp = user.latestLogEntry?.finishedTimestamp || null
        const csvUser = { ...user }
        delete csvUser.latestLogEntry
        return csvUser
      })

      return {
        status: 200,
        jsonBody: {
          fullStats: [...schoolStats, ...administrationStats],
          schoolStats,
          administrationStats,
          csvUsers
        }
      }
    } catch (error) {
      logger('error', ['Failed when fetching stats', error.response?.data || error.stack || error.toString()], context)
      return { status: 500, jsonBody: { message: 'Failed when fetching stats from db', data: error.response?.data || error.stack || error.toString() } }
    }
  }
})
