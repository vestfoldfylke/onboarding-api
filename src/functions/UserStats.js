const { app } = require('@azure/functions')
const { getStateCache } = require('../state-cache')
const { logger } = require('@vtfk/logger')
const { getStatisticsClient } = require('../entra-client')
const { MONGODB, ENTRA_MFA, EXCLUDED_COMPANIES } = require('../../config')
const { getMongoClient, closeMongoClient } = require('../mongo-client')
const { ObjectId } = require('mongodb')
const { createMfaStat } = require('../stats')

const stateCache = getStateCache()

app.http('UserStats', {
  methods: ['POST'],
  authLevel: 'function',
  handler: async (request, context) => {
    let logPrefix = 'UserStats'
    logger('info', [logPrefix, 'New request'], context)
    // Validate request body
    const { code, state, onlyStats } = await request.json()
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

      // Hent ut alle unike companyNames fra users
      const companyNames = [...new Set(users.map(user => user.companyName))]
      // Finn alle brukere som har samme tilhørighet
      const usersRepacked = {}
      let userStats = {}
      if (onlyStats === true) {
        companyNames.forEach(companyName => {
          let notFinished = 0
          let finished = 0
          let notFinishedStudent = 0
          let finishedStudent = 0

          // If companyName is Vestfold og Telemark fylkeskommune - Lærling or Vestfold og Telemark fylkeskommune - OT Ungdom, remove them from stats
          if ((companyName === 'Vestfold og Telemark fylkeskommune - Lærling') || (companyName ==='Vestfold og Telemark fylkeskommune - OT Ungdom')) {
            return null
          }

          // Remove any companyNames that are null
          if (companyName === null) {
            return null
          }

          // Remove any companyNames that are empty
          if (companyName === '') {
            return null
          }

          // Remove any companyNames that are undefined
          if (companyName === undefined) {
            return null
          }

          // Remove any companyNames that is found in the EXCLUDED_COMPANIES array. Removes all companies that belongs to the other county
          
          if (EXCLUDED_COMPANIES.some(excluded => companyName.toLowerCase().includes(excluded))) {
            return null
          }
         
          usersRepacked[companyName] = users.filter(user => user.companyName === companyName).map(users => {
            // if (!users.companyName?.includes(['skole'])) {
            if (['skole', 'kompetansebyggeren', 'skule', 'skolen'].some(school => !users.companyName?.includes(school))) {
              if (users.latestLogEntry === null) {
                notFinished += 1
              } else {
                finished += 1
              }
            }
            if (users.userType === 'elev' && ['skole', 'kompetansebyggeren', 'skule', 'skolen'].some(school => !users.companyName?.includes(school))) {
              if (users.latestLogEntry === null) {
                notFinishedStudent += 1
              } else {
                finishedStudent += 1
              }
            } else {
              if (users.latestLogEntry === null) {
                notFinished += 1
              } else {
                finished += 1
              }
            }
            userStats = {
              ansatt: {
                antall: finished,
                max: finished + notFinished,
                fullføringsgrad: Number(((finished / (finished + notFinished)) * 100).toFixed(2))
              },
              elev: {
                antall: finished,
                max: finished + notFinishedStudent,
                fullføringsgrad: Number(((finishedStudent / (finishedStudent + notFinishedStudent)) * 100).toFixed(2))
              }
            }
          })
          return usersRepacked[companyName] = { ...userStats }
        })
        const usersStats = []
        for (const [companyName, companyStats] of Object.entries(usersRepacked)) {
          if (companyStats.elev.max === 0) {
            companyStats.elev = null
          }
          companyStats.navn = companyName
          usersStats.push({ ...companyStats })
        }
        // Sorter etter navn
        userStats = usersStats.sort((a, b) => a.navn.localeCompare(b.navn))
        return { status: 200, jsonBody: usersStats }
      } else {
        const csvUsers = users.map(user => {
          user.onboardedTimestamp = user.latestLogEntry?.finishedTimestamp || null
          const csvUser = { ...user }
          delete csvUser.latestLogEntry
          return csvUser
        })
        return { status: 200, jsonBody: csvUsers }
      }
    } catch (error) {
      logger('error', ['Failed when fetching stats', error.response?.data || error.stack || error.toString()], context)
      return { status: 500, jsonBody: { message: 'Failed when fetching stats from db', data: error.response?.data || error.stack || error.toString() } }
    }
  }
})
