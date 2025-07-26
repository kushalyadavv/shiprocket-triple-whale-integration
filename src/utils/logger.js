const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const config = require('../config');

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.simple(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
  })
);

// Create transports
const transports = [];

// Console transport
if (config.server.nodeEnv === 'development') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level
    })
  );
}

// File transport with rotation
transports.push(
  new DailyRotateFile({
    filename: config.logging.filePath.replace('.log', '-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: config.logging.maxSize,
    maxFiles: config.logging.maxFiles,
    format: logFormat,
    level: config.logging.level
  })
);

// Error file transport
transports.push(
  new DailyRotateFile({
    filename: config.logging.filePath.replace('.log', '-error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: config.logging.maxSize,
    maxFiles: config.logging.maxFiles,
    format: logFormat,
    level: 'error'
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { 
    service: 'shiprocket-triple-whale-integration',
    environment: config.server.nodeEnv
  },
  transports,
  exitOnError: false
});

// Helper methods for structured logging
const loggerWrapper = {
  info: (message, meta = {}) => {
    logger.info(message, { ...meta, timestamp: new Date().toISOString() });
  },

  error: (message, error = null, meta = {}) => {
    const errorMeta = error ? {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    } : {};
    
    logger.error(message, { 
      ...meta, 
      ...errorMeta, 
      timestamp: new Date().toISOString() 
    });
  },

  warn: (message, meta = {}) => {
    logger.warn(message, { ...meta, timestamp: new Date().toISOString() });
  },

  debug: (message, meta = {}) => {
    logger.debug(message, { ...meta, timestamp: new Date().toISOString() });
  },

  // Special method for API calls
  apiCall: (service, method, url, statusCode, duration, meta = {}) => {
    const level = statusCode >= 400 ? 'error' : 'info';
    logger[level]('API Call', {
      service,
      method,
      url,
      statusCode,
      duration,
      ...meta,
      timestamp: new Date().toISOString()
    });
  },

  // Special method for webhook events
  webhook: (event, source, data, meta = {}) => {
    logger.info('Webhook Event', {
      event,
      source,
      data,
      ...meta,
      timestamp: new Date().toISOString()
    });
  },

  // Special method for sync operations
  sync: (operation, status, details, meta = {}) => {
    const level = status === 'success' ? 'info' : 'error';
    logger[level]('Sync Operation', {
      operation,
      status,
      details,
      ...meta,
      timestamp: new Date().toISOString()
    });
  },

  // Performance logging
  performance: (operation, duration, details = {}) => {
    logger.info('Performance Metric', {
      operation,
      duration,
      details,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = loggerWrapper; 