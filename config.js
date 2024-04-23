module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  MONGODB: {
    CONNECTION_STRING: process.env.MONGODB_CONNECTION_STRING,
    DB_NAME: process.env.MONGODB_DB_NAME
  },
  APPREG: {
    CLIENT_ID: process.env.APPREG_CLIENT_ID,
    CLIENT_SECRET: process.env.APPREG_CLIENT_SECRET,
    TENANT_ID: process.env.APPREG_TENANT_ID
  },
  GRAPH: {
    SCOPE: process.env.GRAPH_SCOPE || 'https://graph.microsoft.com/.default',
    URL: process.env.GRAPH_URL || 'https://graph.microsoft.com'
  }
}
