const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const config = require('./config');
const logger = require('./utils/logger');
const shiprocketAPI = require('./api/shiprocket');
const tripleWhaleAPI = require('./api/triplewhale');
const shiprocketWebhooks = require('./webhooks/shiprocket-handler');
const { CircuitBreaker, RateLimiter } = require('./utils/retry');

// Initialize Express app
const app = express();

// Circuit breakers for external APIs
const shiprocketCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000
});

const tripleWhaleCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 30000
});

// Rate limiters
const generalRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too many requests',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => config.rateLimit.skipSuccessfulRequests && req.statusCode < 400
});

const webhookRateLimit = rateLimit({
  windowMs: 60000, // 1 minute
  max: 1000, // Higher limit for webhooks
  message: { error: 'Webhook rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false
});

// Global middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Shiprocket-Signature']
}));

app.use(compression());

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Apply rate limiting
app.use('/api/', generalRateLimit);
app.use('/webhooks/', webhookRateLimit);

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: config.server.nodeEnv === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Routes

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.server.nodeEnv,
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      services: {
        shiprocket: 'checking',
        tripleWhale: 'checking'
      }
    };

    // Check external services health
    try {
      const [shiprocketHealth, tripleWhaleHealth] = await Promise.allSettled([
        shiprocketCircuitBreaker.execute(() => shiprocketAPI.healthCheck()),
        tripleWhaleCircuitBreaker.execute(() => tripleWhaleAPI.healthCheck())
      ]);

      health.services.shiprocket = shiprocketHealth.status === 'fulfilled' 
        ? shiprocketHealth.value.status 
        : 'unhealthy';

      health.services.tripleWhale = tripleWhaleHealth.status === 'fulfilled' 
        ? tripleWhaleHealth.value.status 
        : 'unhealthy';

    } catch (error) {
      logger.warn('Health check failed for external services', { error: error.message });
    }

    const overallStatus = Object.values(health.services).every(status => status === 'healthy') 
      ? 'healthy' 
      : 'degraded';

    health.status = overallStatus;

    res.status(overallStatus === 'healthy' ? 200 : 503).json(health);

  } catch (error) {
    logger.error('Health check failed', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      circuitBreakers: {
        shiprocket: shiprocketCircuitBreaker.getState(),
        tripleWhale: tripleWhaleCircuitBreaker.getState()
      },
      process: {
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      },
      integration: {
        webhooksProcessed: global.webhooksProcessed || 0,
        metricssynced: global.metricsSynced || 0,
        lastSyncTime: global.lastSyncTime || null,
        errors: global.integrationErrors || 0
      }
    };

    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get metrics', error);
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

// Webhook endpoints
app.use('/webhooks', shiprocketWebhooks);

// API endpoints for manual operations
app.post('/api/sync/manual', async (req, res) => {
  try {
    const { startDate, endDate, syncType } = req.body;
    
    logger.info('Manual sync requested', { startDate, endDate, syncType });

    let result;
    switch (syncType) {
      case 'orders':
        result = await syncOrders(startDate, endDate);
        break;
      case 'shipments':
        result = await syncShipments(startDate, endDate);
        break;
      case 'all':
        result = await syncAll(startDate, endDate);
        break;
      default:
        return res.status(400).json({ error: 'Invalid sync type' });
    }

    res.json({
      success: true,
      message: 'Manual sync completed',
      result
    });

  } catch (error) {
    logger.error('Manual sync failed', error);
    res.status(500).json({
      success: false,
      error: 'Manual sync failed',
      message: error.message
    });
  }
});

// API endpoint to test connections
app.get('/api/test-connections', async (req, res) => {
  try {
    const results = {};

    // Test Shiprocket connection
    try {
      await shiprocketCircuitBreaker.execute(() => shiprocketAPI.healthCheck());
      results.shiprocket = { status: 'connected', timestamp: new Date().toISOString() };
    } catch (error) {
      results.shiprocket = { status: 'failed', error: error.message, timestamp: new Date().toISOString() };
    }

    // Test Triple Whale connection
    try {
      await tripleWhaleCircuitBreaker.execute(() => tripleWhaleAPI.validateApiKey());
      results.tripleWhale = { status: 'connected', timestamp: new Date().toISOString() };
    } catch (error) {
      results.tripleWhale = { status: 'failed', error: error.message, timestamp: new Date().toISOString() };
    }

    res.json({
      success: true,
      connections: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Connection test failed', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed'
    });
  }
});

// Manual data sync functions
async function syncOrders(startDate, endDate) {
  const orders = await shiprocketAPI.getOrders({
    start_date: startDate,
    end_date: endDate,
    per_page: config.sync.batchSize
  });

  if (orders.data && orders.data.length > 0) {
    await tripleWhaleAPI.pushShiprocketOrderData(orders.data);
    global.metricsSynced = (global.metricsSynced || 0) + orders.data.length;
    global.lastSyncTime = new Date().toISOString();
  }

  return {
    type: 'orders',
    count: orders.data?.length || 0,
    startDate,
    endDate
  };
}

async function syncShipments(startDate, endDate) {
  const shipments = await shiprocketAPI.getShipments({
    start_date: startDate,
    end_date: endDate,
    per_page: config.sync.batchSize
  });

  if (shipments.data && shipments.data.length > 0) {
    await tripleWhaleAPI.pushShiprocketShipmentData(shipments.data);
    global.metricsSynced = (global.metricsSynced || 0) + shipments.data.length;
    global.lastSyncTime = new Date().toISOString();
  }

  return {
    type: 'shipments',
    count: shipments.data?.length || 0,
    startDate,
    endDate
  };
}

async function syncAll(startDate, endDate) {
  const [ordersResult, shipmentsResult] = await Promise.all([
    syncOrders(startDate, endDate),
    syncShipments(startDate, endDate)
  ]);

  return {
    type: 'all',
    orders: ordersResult.count,
    shipments: shipmentsResult.count,
    total: ordersResult.count + shipmentsResult.count,
    startDate,
    endDate
  };
}

// Scheduled sync job
if (config.sync.enableRealTimeSync) {
  // Run daily sync at 12:05 AM as per user preference
  cron.schedule('5 0 * * *', async () => {
    try {
      logger.info('Starting scheduled daily sync');
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const startDate = yesterday.toISOString().split('T')[0];
      const endDate = startDate;

      const result = await syncAll(startDate, endDate);
      
      logger.sync('Scheduled sync completed', 'success', result);
      
    } catch (error) {
      logger.error('Scheduled sync failed', error);
      global.integrationErrors = (global.integrationErrors || 0) + 1;
    }
  }, {
    timezone: "Asia/Kolkata" // Indian timezone
  });

  logger.info('Scheduled daily sync job configured for 12:05 AM IST');
}

// Initialize global metrics
global.webhooksProcessed = 0;
global.metricsSynced = 0;
global.lastSyncTime = null;
global.integrationErrors = 0;

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  global.integrationErrors = (global.integrationErrors || 0) + 1;
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  global.integrationErrors = (global.integrationErrors || 0) + 1;
  
  // Don't exit immediately, give some time for logging
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Start server
const server = app.listen(config.server.port, config.server.host, () => {
  logger.info(`🚀 Shiprocket-Triple Whale Integration Server started`, {
    port: config.server.port,
    host: config.server.host,
    environment: config.server.nodeEnv,
    realTimeSync: config.sync.enableRealTimeSync,
    scheduledSync: '12:05 AM IST daily'
  });
});

// Handle server errors
server.on('error', (error) => {
  logger.error('Server error:', error);
});

module.exports = app; 