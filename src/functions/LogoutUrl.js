const { app } = require('@azure/functions')
const { getIdPortenClient } = require('../idporten-client')

// LOGGER??

app.http('LogoutUrl', {
    methods: ['GET'],
    authLevel: 'function',
    handler: async (request, context) => {
        try {
            const idPortenClient = await getIdPortenClient()
            const logoutUrl = idPortenClient.endSessionUrl()
            return { status: 200, jsonBody: { logoutUrl } }
        } catch (error) {
            logger('error', ['Failed when trying to get id-porten logout url', error.response?.data || error.stack || error.toString()])
            return { status: 500, jsonBody: { message: 'Failed when trying to get id-porten logoout url', data: error.response?.data || error.stack || error.toString() } }
        }
    }
})
