const { app } = require('@azure/functions')
const { callGraph, getUserBySsn, createTAP, updatePassword, getTAP, deleteTAP } = require('../call-graph')
const { logger } = require('@vtfk/logger')
const { writeFileSync } = require('fs')

const testUserUpn = 'test.person@domene.no'
const testUserSsn = '11111111111'

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

app.http('ResetPassword', {
  methods: ['POST', 'PATCH'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    // const user = await getUserBySsn(testUserSsn)
    
    // Slett TAP om den finnes
    // const deletedTap = await deleteTAP(testUserUpn)
    /*
    logger('info', ['Sover i 2 sek'])
    await sleep(2000)
    logger('info', ['Våknet etter 2 sek'])

    // Hent TAP for brukeren
    const tap = await createTAP(testUserUpn)

    // Sov litt før du oppdaterer passord
    logger('info', ['Sover i 2 sek'])
    await sleep(2000)
    logger('info', ['Våknet etter 2 sek'])
    */
    // Sett mottatt TAP som brukerens passord
    let updatedPassword
    try {
      updatedPassword = await updatePassword(testUserUpn, 'Et skikkelig bra passord')
    } catch (error) {
        console.log(error)
        logger('error', [error.response?.headers || error.stack || error.toString()])
      logger('error', [error.response?.data || error.stack || error.toString()])
    }

    const name = request.query.get('name') || await request.text() || 'world'

    // const user = await getUserBySsn(testUserSsn)

    // const user = await callGraph('get', `v1.0/users/${testUserUpn}?$select=customSecurityAttributes`)
    return { status: 200, jsonBody: { updatedPassword } }
    //return { status: 200, jsonBody: { deletedTap, tap, updatedPassword } }
  }
})
