const config = require('../config');
const logger = require('./logger');

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - The function to retry
 * @param {Object} options - Retry configuration options
 * @returns {Promise} - The result of the function
 */
async function retryRequest(fn, options = {}) {
  const {
    maxAttempts = config.retry.maxAttempts,
    delayMs = config.retry.delayMs,
    backoffFactor = config.retry.backoffFactor,
    shouldRetry = defaultShouldRetry,
    onRetry = defaultOnRetry
  } = options;

  let lastError;
  let attempt = 1;

  while (attempt <= maxAttempts) {
    try {
      const result = await fn();
      
      // Log successful retry if it wasn't the first attempt
      if (attempt > 1) {
        logger.info('Request succeeded after retry', {
          attempt,
          totalAttempts: maxAttempts
        });
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error
      if (!shouldRetry(error, attempt)) {
        logger.error('Request failed, not retrying', error, {
          attempt,
          reason: 'shouldRetry returned false'
        });
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt >= maxAttempts) {
        logger.error('Request failed after all retry attempts', error, {
          attempt,
          maxAttempts
        });
        break;
      }

      // Calculate delay for next attempt
      const delay = delayMs * Math.pow(backoffFactor, attempt - 1);
      const jitteredDelay = addJitter(delay);

      logger.warn('Request failed, retrying', {
        attempt,
        maxAttempts,
        delayMs: jitteredDelay,
        error: error.message
      });

      // Call onRetry callback
      await onRetry(error, attempt);

      // Wait before retrying
      await sleep(jitteredDelay);
      
      attempt++;
    }
  }

  // If we get here, all attempts failed
  throw lastError;
}

/**
 * Default function to determine if a request should be retried
 * @param {Error} error - The error that occurred
 * @param {number} attempt - Current attempt number
 * @returns {boolean} - Whether to retry
 */
function defaultShouldRetry(error, attempt) {
  // Don't retry if we've exceeded max attempts
  if (attempt >= config.retry.maxAttempts) {
    return false;
  }

  // Get status code from error
  const status = error.response?.status;
  
  // Don't retry for client errors (4xx), except for specific cases
  if (status >= 400 && status < 500) {
    // Retry for rate limiting, request timeout, and auth issues
    const retryableClientErrors = [401, 408, 429];
    return retryableClientErrors.includes(status);
  }

  // Retry for server errors (5xx)
  if (status >= 500) {
    return true;
  }

  // Retry for network errors
  if (error.code === 'ECONNRESET' || 
      error.code === 'ENOTFOUND' || 
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT') {
    return true;
  }

  // Don't retry for other errors
  return false;
}

/**
 * Default retry callback
 * @param {Error} error - The error that occurred
 * @param {number} attempt - Current attempt number
 */
async function defaultOnRetry(error, attempt) {
  // Log retry attempt
  logger.debug('Retrying request', {
    attempt,
    error: error.message,
    status: error.response?.status
  });
}

/**
 * Add random jitter to delay to avoid thundering herd
 * @param {number} delay - Base delay in milliseconds
 * @returns {number} - Jittered delay
 */
function addJitter(delay) {
  const jitter = Math.random() * 0.1 * delay; // 10% jitter
  return Math.floor(delay + jitter);
}

/**
 * Sleep for specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry with custom configuration for specific API calls
 */
const retryConfigs = {
  // Critical operations - more aggressive retry
  critical: {
    maxAttempts: 5,
    delayMs: 2000,
    backoffFactor: 2
  },
  
  // Standard operations - default retry
  standard: {
    maxAttempts: config.retry.maxAttempts,
    delayMs: config.retry.delayMs,
    backoffFactor: config.retry.backoffFactor
  },
  
  // Quick operations - less aggressive retry
  quick: {
    maxAttempts: 2,
    delayMs: 500,
    backoffFactor: 1.5
  },
  
  // Read-only operations - more attempts, shorter delays
  readOnly: {
    maxAttempts: 4,
    delayMs: 1000,
    backoffFactor: 1.5
  }
};

/**
 * Retry with predefined configuration
 * @param {Function} fn - Function to retry
 * @param {string} configType - Type of retry configuration
 * @returns {Promise} - Result of the function
 */
async function retryWithConfig(fn, configType = 'standard') {
  const config = retryConfigs[configType];
  if (!config) {
    throw new Error(`Unknown retry config type: ${configType}`);
  }
  
  return retryRequest(fn, config);
}

/**
 * Circuit breaker pattern for API calls
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 120000; // 2 minutes
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.failureCount = 0;
        logger.info('Circuit breaker transitioning to HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN - request blocked');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.successCount++;
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.info('Circuit breaker reset to CLOSED state');
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn('Circuit breaker tripped to OPEN state', {
        failureCount: this.failureCount,
        threshold: this.failureThreshold
      });
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    logger.info('Circuit breaker manually reset');
  }
}

/**
 * Rate limiter for API calls
 */
class RateLimiter {
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 100;
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.requests = [];
  }

  async checkLimit() {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      
      logger.warn('Rate limit exceeded, waiting', {
        currentRequests: this.requests.length,
        maxRequests: this.maxRequests,
        waitTimeMs: waitTime
      });
      
      await sleep(waitTime);
      return this.checkLimit(); // Recursive check after wait
    }
    
    this.requests.push(now);
    return true;
  }

  getStats() {
    const now = Date.now();
    const activeRequests = this.requests.filter(time => now - time < this.windowMs);
    
    return {
      activeRequests: activeRequests.length,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      remainingRequests: this.maxRequests - activeRequests.length
    };
  }
}

module.exports = {
  retryRequest,
  retryWithConfig,
  retryConfigs,
  CircuitBreaker,
  RateLimiter,
  sleep,
  defaultShouldRetry,
  addJitter
}; 