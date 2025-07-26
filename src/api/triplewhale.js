const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { retryRequest } = require('../utils/retry');

class TripleWhaleAPI {
  constructor() {
    this.baseUrl = config.tripleWhale.apiUrl;
    this.apiKey = config.tripleWhale.apiKey;
    this.clientId = config.tripleWhale.clientId;
    this.clientSecret = config.tripleWhale.clientSecret;
    this.accessToken = null;
    this.tokenExpiresAt = null;
    
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.tripleWhale.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Shiprocket-TripleWhale-Integration/1.0.0'
      }
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      async (config) => {
        await this.ensureAuthenticated();
        
        // Add authentication header
        if (this.apiKey) {
          config.headers['x-api-key'] = this.apiKey;
        } else if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        
        return config;
      },
      (error) => {
        logger.error('Triple Whale request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.apiCall(
          'triple-whale',
          response.config.method.toUpperCase(),
          response.config.url,
          response.status,
          Date.now() - response.config.metadata?.startTime
        );
        return response;
      },
      async (error) => {
        const config = error.config;
        const status = error.response?.status;
        const duration = Date.now() - (config.metadata?.startTime || Date.now());

        logger.apiCall(
          'triple-whale',
          config.method?.toUpperCase(),
          config.url,
          status,
          duration,
          { error: error.message }
        );

        // Handle token expiration for OAuth
        if (status === 401 && this.clientId && !config._retry) {
          config._retry = true;
          await this.refreshToken();
          return this.client(config);
        }

        return Promise.reject(error);
      }
    );
  }

  // OAuth2 Authentication
  async authenticate() {
    if (!this.clientId || !this.clientSecret) {
      logger.info('Using API key authentication for Triple Whale');
      return;
    }

    try {
      const response = await axios.post(`${this.baseUrl}/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);

      logger.info('Triple Whale OAuth authentication successful');
      return this.accessToken;
    } catch (error) {
      logger.error('Triple Whale OAuth authentication failed', error);
      throw new Error(`OAuth authentication failed: ${error.message}`);
    }
  }

  async refreshToken() {
    return this.authenticate();
  }

  async ensureAuthenticated() {
    if (this.clientId && (!this.accessToken || (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt))) {
      await this.authenticate();
    }
  }

  // Helper method for making requests with retry logic
  async makeRequest(method, endpoint, data = null, options = {}) {
    const startTime = Date.now();
    
    return retryRequest(async () => {
      const config = {
        method,
        url: endpoint,
        metadata: { startTime },
        ...options
      };

      if (data) {
        config.data = data;
      }

      const response = await this.client(config);
      return response.data;
    });
  }

  // Summary Page Data
  async getSummaryData(params = {}) {
    const requestData = {
      start_date: params.start_date || this.getDefaultStartDate(),
      end_date: params.end_date || this.getDefaultEndDate(),
      granularity: params.granularity || 'day',
      ...params
    };

    return this.makeRequest('POST', '/summary-page/get-data', requestData);
  }

  // Custom Metrics Management
  async pushCustomMetrics(metricsData) {
    const formattedData = {
      metrics: Array.isArray(metricsData) ? metricsData : [metricsData],
      timestamp: new Date().toISOString()
    };

    return this.makeRequest('POST', '/tw-metrics/metrics', formattedData);
  }

  async getCustomMetrics(params = {}) {
    const queryParams = new URLSearchParams({
      start_date: params.start_date || this.getDefaultStartDate(),
      end_date: params.end_date || this.getDefaultEndDate(),
      ...params
    }).toString();

    return this.makeRequest('GET', `/tw-metrics/metrics-data?${queryParams}`);
  }

  // Attribution Data
  async getAttributionData(params = {}) {
    const requestData = {
      start_date: params.start_date || this.getDefaultStartDate(),
      end_date: params.end_date || this.getDefaultEndDate(),
      limit: params.limit || 1000,
      ...params
    };

    return this.makeRequest('POST', '/attribution/get-orders-with-journeys-v2', requestData);
  }

  // Shipping and Logistics Metrics
  async pushShippingMetrics(shippingData) {
    const metrics = this.transformShippingDataToMetrics(shippingData);
    return this.pushCustomMetrics(metrics);
  }

  async pushDeliveryMetrics(deliveryData) {
    const metrics = this.transformDeliveryDataToMetrics(deliveryData);
    return this.pushCustomMetrics(metrics);
  }

  async pushReturnMetrics(returnData) {
    const metrics = this.transformReturnDataToMetrics(returnData);
    return this.pushCustomMetrics(metrics);
  }

  // Data Transformation Methods
  transformShippingDataToMetrics(shippingData) {
    const metrics = [];

    // Basic shipping metrics
    metrics.push({
      metric_name: 'shipping_orders_created',
      value: shippingData.orders_created || 0,
      date: shippingData.date || new Date().toISOString().split('T')[0],
      dimensions: {
        source: 'shiprocket',
        type: 'shipping'
      }
    });

    metrics.push({
      metric_name: 'shipping_cost_total',
      value: shippingData.total_shipping_cost || 0,
      date: shippingData.date || new Date().toISOString().split('T')[0],
      dimensions: {
        source: 'shiprocket',
        type: 'cost',
        currency: 'INR'
      }
    });

    metrics.push({
      metric_name: 'average_shipping_time',
      value: shippingData.average_shipping_time || 0,
      date: shippingData.date || new Date().toISOString().split('T')[0],
      dimensions: {
        source: 'shiprocket',
        type: 'performance',
        unit: 'hours'
      }
    });

    return metrics;
  }

  transformDeliveryDataToMetrics(deliveryData) {
    const metrics = [];

    metrics.push({
      metric_name: 'deliveries_completed',
      value: deliveryData.successful_deliveries || 0,
      date: deliveryData.date || new Date().toISOString().split('T')[0],
      dimensions: {
        source: 'shiprocket',
        type: 'delivery',
        status: 'success'
      }
    });

    metrics.push({
      metric_name: 'delivery_success_rate',
      value: deliveryData.success_rate || 0,
      date: deliveryData.date || new Date().toISOString().split('T')[0],
      dimensions: {
        source: 'shiprocket',
        type: 'performance',
        unit: 'percentage'
      }
    });

    metrics.push({
      metric_name: 'failed_deliveries',
      value: deliveryData.failed_deliveries || 0,
      date: deliveryData.date || new Date().toISOString().split('T')[0],
      dimensions: {
        source: 'shiprocket',
        type: 'delivery',
        status: 'failed'
      }
    });

    return metrics;
  }

  transformReturnDataToMetrics(returnData) {
    const metrics = [];

    metrics.push({
      metric_name: 'returns_initiated',
      value: returnData.returns_count || 0,
      date: returnData.date || new Date().toISOString().split('T')[0],
      dimensions: {
        source: 'shiprocket',
        type: 'returns'
      }
    });

    metrics.push({
      metric_name: 'return_rate',
      value: returnData.return_rate || 0,
      date: returnData.date || new Date().toISOString().split('T')[0],
      dimensions: {
        source: 'shiprocket',
        type: 'performance',
        unit: 'percentage'
      }
    });

    metrics.push({
      metric_name: 'rto_orders',
      value: returnData.rto_count || 0,
      date: returnData.date || new Date().toISOString().split('T')[0],
      dimensions: {
        source: 'shiprocket',
        type: 'rto'
      }
    });

    return metrics;
  }

  // Batch Operations
  async pushBatchMetrics(batchData) {
    const batches = this.chunkArray(batchData, 100); // Process in chunks of 100
    const results = [];

    for (const batch of batches) {
      try {
        const result = await this.pushCustomMetrics(batch);
        results.push(result);
        logger.info(`Pushed batch of ${batch.length} metrics to Triple Whale`);
      } catch (error) {
        logger.error(`Failed to push batch metrics`, error);
        throw error;
      }
    }

    return results;
  }

  // User and Account Management
  async getCurrentUser() {
    return this.makeRequest('GET', '/users/api-keys/me');
  }

  async getAccountInfo() {
    return this.makeRequest('GET', '/account/info');
  }

  // Data Export
  async exportData(params = {}) {
    const requestData = {
      start_date: params.start_date || this.getDefaultStartDate(),
      end_date: params.end_date || this.getDefaultEndDate(),
      format: params.format || 'json',
      ...params
    };

    return this.makeRequest('POST', '/export/data', requestData);
  }

  // Health Check and Validation
  async healthCheck() {
    try {
      await this.getCurrentUser();
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message, 
        timestamp: new Date().toISOString() 
      };
    }
  }

  async validateApiKey() {
    try {
      const response = await this.getCurrentUser();
      logger.info('Triple Whale API key validation successful', { user: response });
      return true;
    } catch (error) {
      logger.error('Triple Whale API key validation failed', error);
      return false;
    }
  }

  // Utility Methods
  getDefaultStartDate() {
    const date = new Date();
    date.setDate(date.getDate() - 30); // 30 days ago
    return date.toISOString().split('T')[0];
  }

  getDefaultEndDate() {
    return new Date().toISOString().split('T')[0];
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Specific Shiprocket Integration Methods
  async pushShiprocketOrderData(orders) {
    const metrics = orders.flatMap(order => this.transformOrderToMetrics(order));
    return this.pushCustomMetrics(metrics);
  }

  async pushShiprocketShipmentData(shipments) {
    const metrics = shipments.flatMap(shipment => this.transformShipmentToMetrics(shipment));
    return this.pushCustomMetrics(metrics);
  }

  transformOrderToMetrics(order) {
    const metrics = [];
    const date = order.order_date ? order.order_date.split('T')[0] : new Date().toISOString().split('T')[0];

    metrics.push({
      metric_name: 'shiprocket_order_value',
      value: parseFloat(order.total_amount || 0),
      date,
      dimensions: {
        source: 'shiprocket',
        order_id: order.order_id,
        status: order.status,
        channel: order.channel_name
      }
    });

    return metrics;
  }

  transformShipmentToMetrics(shipment) {
    const metrics = [];
    const date = shipment.created_at ? shipment.created_at.split('T')[0] : new Date().toISOString().split('T')[0];

    metrics.push({
      metric_name: 'shiprocket_shipment_cost',
      value: parseFloat(shipment.shipping_charges || 0),
      date,
      dimensions: {
        source: 'shiprocket',
        shipment_id: shipment.shipment_id,
        courier: shipment.courier_name,
        status: shipment.status
      }
    });

    return metrics;
  }
}

module.exports = new TripleWhaleAPI(); 