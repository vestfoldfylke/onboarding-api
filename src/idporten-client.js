const { Issuer } = require('openid-client')
const { IDPORTEN } = require('../config')

let idPortenInstance = null

/**
 *
 * @returns {import('openid-client').BaseClient} idPortenClient
 */
const getIdPortenClient = async () => {
  if (idPortenInstance) return idPortenInstance

  const issuer = await Issuer.discover(IDPORTEN.WELL_KNOWN_ENDPOINT)
  const { Client } = issuer

  idPortenInstance = new Client({
    client_id: IDPORTEN.CLIENT_ID,
    client_secret: IDPORTEN.ClIENT_SECRET,
    redirect_uris: [IDPORTEN.ClIENT_REDIRECT_URI],
    post_logout_redirect_uris: [IDPORTEN.CLIENT_POST_LOGOUT_REDIRECT_URI],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post'
  })
  return idPortenInstance
}

module.exports = { getIdPortenClient }
