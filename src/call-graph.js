const { getMsalToken } = require('./get-msal-token')
const { GRAPH, AUTHENTICATION_ADMINISTRATOR } = require('../config')
const { default: axios } = require('axios')
const { getMsalUserToken } = require('./get-msal-user-token')
const { generatePassword } = require('./generate-password')
const { logger } = require('@vtfk/logger')

const aninopel = 'hahaha, nørd'

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const callGraphUserContext = async () => {
  const accessToken = await getMsalUserToken({ scope: AUTHENTICATION_ADMINISTRATOR.SCOPE })
  return accessToken
}

const resetPassword = async (userId) => {
  const accessToken = await getMsalUserToken({ scope: AUTHENTICATION_ADMINISTRATOR.SCOPE })
  const url = `${GRAPH.URL}/v1.0/users/${userId}/authentication/methods/28c10230-6103-485e-b985-444c60001490/resetPassword`
  const passwordBody = {
    newPassword: generatePassword()
  }
  const { headers } = await axios.post(url, passwordBody, { headers: { Authorization: `Bearer ${accessToken}` } })

  let numberOfTries = 5
  let intervalMs = 5000
  for (let i=0; i<numberOfTries; i++) {
    await sleep(intervalMs)
    const { data } = await axios.get(headers.location, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (data.status === 'succeeded') {
      return { newPassword: passwordBody.newPassword }
    }
    if (!['notStarted', 'running'].includes(data.status)) {
      logger('error', ['Failed when resetting password', data])
      throw new Error(data.statusDetail || 'Feilet ved resetting av passord')
    }
  }
  throw new Error('Brukte for lang tid på resetting av passord, prøv igjen senere')
}

/**
 * @typedef SimpleEntraUser
 * @property {string} id
 * @property {string} userPrincipalName
 * @property {string} displayName
 * 
 */

/**
 * 
 * @param {string} ssn 
 * @returns {SimpleEntraUser} simpleEntraUser
 */
const getUserByCustomSecurityAttributeSsn = async (ssn) => {
  const accessToken = await getMsalToken({ scope: GRAPH.SCOPE })
  const url = `${GRAPH.URL}/v1.0/users/?$count=true&$select=id,displayName,userPrincipalName,customSecurityAttributes&$filter=customSecurityAttributes/IDM/SSN eq '${ssn}'`
  const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}`, ConsistencyLevel: 'eventual' } })
  if (data.value.length > 1) {
    throw new Error('Found more than one user on ssn, glitch in the matrix. Delete one of the clones.')
  }
  if (data.value.length === 0) {
    return {
      id: null,
      userPrincipalName: null,
      displayName: null
    }
  }
  return data.value[0]
}

/**
 * 
 * @param {string} ssn 
 * @returns {SimpleEntraUser} simpleEntraUser
 */
const getUserByExtensionAttributeSsn = async (ssn) => {
  const accessToken = await getMsalToken({ scope: GRAPH.SCOPE })
  const url = `${GRAPH.URL}/v1.0/users/?$filter=(${GRAPH.SSN_EXTENSION_ATTRIBUTE}+eq+'${ssn}')&$select=id,displayName,userPrincipalName`
  const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (data.value.length > 1) {
    throw new Error('Found more than one user on ssn, glitch in the matrix. Delete one of the clones.')
  }
  if (data.value.length === 0) {
    return {
      id: null,
      userPrincipalName: null,
      displayName: null
    }
  }
  return data.value[0]
}

const createTAP = async (userId) => {
  const accessToken = await getMsalToken({ scope: GRAPH.SCOPE })
  const url = `${GRAPH.URL}/v1.0/users/${userId}/authentication/temporaryAccessPassMethods`
  const tapBody = {
    lifetimeInMinutes: 480,
    isUsableOnce: false
  }
  const { data } = await axios.post(url, tapBody, { headers: { Authorization: `Bearer ${accessToken}` } })
  return data
}

const getTAP = async (userId) => {
  const accessToken = await getMsalToken({ scope: GRAPH.SCOPE })
  const url = `${GRAPH.URL}/v1.0/users/${userId}/authentication/temporaryAccessPassMethods`
  const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  return data
}

const deleteTAP = async (userId) => {
  const accessToken = await getMsalToken({ scope: GRAPH.SCOPE })
  const url = `${GRAPH.URL}/v1.0/users/${userId}/authentication/temporaryAccessPassMethods`
  const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (data.value && data.value.length > 0) {
    const url = `${GRAPH.URL}/v1.0/users/${userId}/authentication/temporaryAccessPassMethods/${data.value[0].id}`
    const { status } = await axios.delete(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    return status
  }
  return 204
}

const updatePassword = async (userId, password) => {
  const accessToken = await getMsalToken({ scope: GRAPH.SCOPE })
  const url = `${GRAPH.URL}/v1.0/users/${userId}`
  const passwordBody = {
    passwordProfile: {
      forceChangePasswordNextSignIn: true
      //password
    }
  }
  const { status } = await axios.patch(url, passwordBody, { headers: { Authorization: `Bearer ${accessToken}` } })
  return status
}

const callGraph = async (method, resource, body) => {
  const validMethods = ['get', 'post', 'patch']
  if (!validMethods.includes(method.toLowerCase())) throw new Error(`Method must be one of: ${validMethods.join(', ')}`)
  const accessToken = await getMsalToken({ scope: GRAPH.SCOPE })
  if (body) {
    const { data } = await axios[method.toLowerCase()](`${GRAPH.URL}/${resource}`, body, { headers: { Authorization: `Bearer ${accessToken}` } })
    return data
  }
  const { data } = await axios[method.toLowerCase()](`${GRAPH.URL}/${resource}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  return data
}

module.exports = { callGraph, getUserByCustomSecurityAttributeSsn, getUserByExtensionAttributeSsn, createTAP, updatePassword, getTAP, deleteTAP, callGraphUserContext, resetPassword }
