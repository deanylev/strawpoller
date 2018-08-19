const CONFIG_VARS = {
  PORT: 8080,
  QUERY_LIMIT: 1000,
  MASTER_PASS: null,
  ENABLE_API: false
};

Object.keys(CONFIG_VARS).forEach((configVar) => module.exports[configVar] = process.env[configVar] || CONFIG_VARS[configVar]);

module.exports.DB_CREDS = Object.freeze({
  connectionLimit: 5,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'strawpoller'
});

module.exports.LOGGER = Object.freeze({
  colours: {
    log: 'blue',
    warn: 'yellow',
    error: 'red'
  },
  levels: [
    'log',
    'warn',
    'error'
  ]
});

module.exports.REJECTION_REASONS = {
  params: 'Invalid params.',
  password: 'Password incorrect.',
  existence: 'Poll not found.',
  auth: 'Unauthorised.',
  password: 'Password incorrect.',
  listener: 'No listener.'
};

module.exports.HANDSHAKE_WAIT_TIME = 10000;
module.exports.MAXIMUM_UNLOCK_AT = Date.now() + 1728000000; // 20 days from now
