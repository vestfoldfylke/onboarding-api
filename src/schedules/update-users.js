const { logger } = require('@vtfk/logger')
const { MONGODB } = require('../../config')
const { getAllEmployees, getAllStudents } = require('../call-graph')
const { getMongoClient } = require('../mongo-client')

const repackUser = (entraUser, user, userType) => {
  if (!userType) throw new Error('You forgot to send parameter "userType"')
  if (!['ansatt', 'elev'].includes(userType)) throw new Error(`Parameter userType must be "ansatt" or "elev" - got ${userType}`)
  const extensionAttribute6 = entraUser.onPremisesExtensionAttributes.extensionAttribute6 || null
  // Dont want all extensionAttr
  delete entraUser.onPremisesExtensionAttributes
  return {
    userType,
    ...entraUser,
    extensionAttribute6,
    updatedTimestamp: new Date().toISOString(),
    latestLogEntry: user.latestLogEntry || null
  }
}

const updateUsers = async (context) => {
  // Get all users from last run
  const mongoClient = await getMongoClient()

  logger('info', ['Fetching users collection'], context)
  const usersCollection = mongoClient.db(MONGODB.DB_NAME).collection(MONGODB.USERS_COLLECTION)
  const previousUsers = await usersCollection.find({}).toArray()
  logger('info', [`Got ${previousUsers.length} users from users collection`], context)

  /* En user i previousUsers skal se sånn her ut
  {
    _id (mongo)
    id
    userPrincipalname...
    blabala
    extensionAttribute6
    latestLogEntry: {
      IDPORTEN
      blablabal
    }
  }
  */

  // Get all active users from EntraID that are supposed to have MFA
  logger('info', ['Fetching entraId users'], context)
  const employees = await getAllEmployees()
  const students = await getAllStudents()
  logger('info', ['Got entraId users'], context)

  // Initaite array currentUsers
  const currentUsers = []

  // Go through all employees
  for (const employee of employees.value) {
    // Check if we have employee in previousUsers already
    const user = previousUsers.find(user => user.id === employee.id)
    if (user) {
      // Simply swap entraUser property with latest info
      currentUsers.push(repackUser(employee, user, 'ansatt'))
    } else {
      // User does not exist in previousUsers, add user
      currentUsers.push(repackUser(employee, { latestLogEntry: null }, 'ansatt'))
    }
  }

  // Go through all students
  for (const student of students.value) {
    // Check if we have employee in previousUsers already
    const user = previousUsers.find(user => user.id === student.id)
    if (user) {
      // Simply swap entraUser property with latest info
      currentUsers.push(repackUser(student, user, 'elev'))
    } else {
      // User does not exist in previousUsers, add user
      currentUsers.push(repackUser(student, { latestLogEntry: null }, 'elev'))
    }
  }

  // Swap data in mongodb
  // First get all collectionnames
  const collectionNames = (await mongoClient.db(MONGODB.DB_NAME).listCollections().toArray()).map(coll => coll.name)

  // Setup collection names for easy handling
  const tempCollectionName = `${MONGODB.USERS_COLLECTION}-temp`
  const previousCollectionName = `${MONGODB.USERS_COLLECTION}-previous`

  // Then drop temp-collection if it exists
  const tempCollection = mongoClient.db(MONGODB.DB_NAME).collection(tempCollectionName)
  {
    const dropResult = collectionNames.includes(tempCollectionName) ? await tempCollection.drop() : false
    logger('info', [`First we drop tempCollection if it exists - did it exist? ${dropResult}`], context)
    // Then insert new as temp
    const insertTempResult = await tempCollection.insertMany(currentUsers)
    logger('info', [`Then we insert new data as temp - result: ${insertTempResult}`], context)
  }

  // Then drop previous if it exists
  {
    const previousCollection = mongoClient.db(MONGODB.DB_NAME).collection(previousCollectionName)
    const dropResult = collectionNames.includes(previousCollectionName) ? await previousCollection.drop() : false
    logger('info', [`Then we drop previous-collection - did it exist? ${dropResult}`], context)
  }

  // Then rename current to previous if exist
  {
    const renameResult = collectionNames.includes(MONGODB.USERS_COLLECTION) ? await usersCollection.rename(`${MONGODB.USERS_COLLECTION}-previous`) : 'users collection did not exist, could not rename'
    logger('info', [`Then we rename current users-collection to previous - result: ${renameResult}`], context)
  }

  // Then rename temp to current
  {
    const renameResult = await tempCollection.rename(MONGODB.USERS_COLLECTION)
    logger('info', [`Then we rename temp users-collection with the new data to current - result: ${renameResult}`], context)
  }

  // Then create index on fields we need
  const logCollection = mongoClient.db(MONGODB.DB_NAME).collection(MONGODB.LOG_COLLECTION)
  try {
    await logCollection.createIndex({ successful: 1 }, { background: true })
    await logCollection.createIndex({ syncedToUserCollection: 1 }, { background: true })
    await usersCollection.createIndex({ id: 1 }, { background: true })
  } catch (error) {
    logger('warn', ['Aiaia, index creation failed, you might get bombarded with emails from mongodb'], context)
  }
  return true
}

// En ide om vi trenger
// En funksjon som går gjennom alle users som IKKE har latestLogEntry, og sjekker om det faktisk finnes et latestLogEntry der - bare i tilfelle en bruker har blitt borte, og kommet tilbake igjen. Ikke sikkert det trengs.

module.exports = { updateUsers, repackUser }
