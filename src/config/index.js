require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // Shiprocket API Configuration
  shiprocket: {
    apiUrl: process.env.SHIPROCKET_API_URL || 'https://apiv2.shiprocket.in/v1',
    apiKey: process.env.SHIPROCKET_API_KEY,
    apiSecret: process.env.SHIPROCKET_API_SECRET,
    webhookSecret: process.env.SHIPROCKET_WEBHOOK_SECRET,
    timeout: parseInt(process.env.API_REQUEST_TIMEOUT) || 30000,
  },

  // Triple Whale API Configuration
  tripleWhale: {
    apiUrl: process.env.TRIPLE_WHALE_API_URL || 'https://api.triplewhale.com/api/v2',
    apiKey: process.env.TRIPLE_WHALE_API_KEY,
    clientId: process.env.TRIPLE_WHALE_CLIENT_ID,
    clientSecret: process.env.TRIPLE_WHALE_CLIENT_SECRET,
    timeout: parseInt(process.env.API_REQUEST_TIMEOUT) || 30000,
  },

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL,
    mongoUrl: process.env.MONGODB_URL,
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || './logs/integration.log',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
  },

  // Rate Limiting Configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true',
  },

  // Retry Configuration
  retry: {
    maxAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3,
    delayMs: parseInt(process.env.RETRY_DELAY_MS) || 1000,
    backoffFactor: parseFloat(process.env.RETRY_BACKOFF_FACTOR) || 2,
  },

  // Webhook Configuration
  webhook: {
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 5000,
    verifySignature: process.env.WEBHOOK_VERIFY_SIGNATURE === 'true',
  },

  // Monitoring Configuration
  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    alertEmail: process.env.ALERT_EMAIL,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  },

  // Sync Configuration
  sync: {
    batchSize: parseInt(process.env.SYNC_BATCH_SIZE) || 50,
    intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES) || 5,
    enableRealTimeSync: process.env.ENABLE_REAL_TIME_SYNC === 'true',
  },

  // Google Sheets Configuration
  googleSheets: {
    credentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS_PATH,
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
    backupEnabled: process.env.GOOGLE_SHEETS_BACKUP_ENABLED === 'true',
  },

  // Security Configuration
  security: {
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
  },
};

// Validation function to check required configuration
const validateConfig = () => {
  const required = [
    'shiprocket.apiKey',
    'tripleWhale.apiKey',
  ];

  const missing = required.filter(key => {
    const value = key.split('.').reduce((obj, k) => obj && obj[k], config);
    return !value;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
};

// Validate configuration on startup
if (config.server.nodeEnv === 'production') {
  validateConfig();
}

module.exports = config; 