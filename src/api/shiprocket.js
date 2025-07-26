const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { retryRequest } = require('../utils/retry');

class ShiprocketAPI {
  constructor() {
    this.baseUrl = config.shiprocket.apiUrl;
    this.apiKey = config.shiprocket.apiKey;
    this.apiSecret = config.shiprocket.apiSecret;
    this.token = null;
    this.tokenExpiresAt = null;
    
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.shiprocket.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Shiprocket-TripleWhale-Integration/1.0.0'
      }
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      async (config) => {
        await this.ensureAuthenticated();
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => {
        logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.apiCall(
          'shiprocket',
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
          'shiprocket',
          config.method?.toUpperCase(),
          config.url,
          status,
          duration,
          { error: error.message }
        );

        // Handle token expiration
        if (status === 401 && !config._retry) {
          config._retry = true;
          await this.authenticate();
          return this.client(config);
        }

        return Promise.reject(error);
      }
    );
  }

  // Authentication
  async authenticate() {
    try {
      const response = await axios.post(`${this.baseUrl}/external/auth/login`, {
        email: this.apiKey,
        password: this.apiSecret
      });

      this.token = response.data.token;
      this.tokenExpiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

      logger.info('Shiprocket authentication successful');
      return this.token;
    } catch (error) {
      logger.error('Shiprocket authentication failed', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  async ensureAuthenticated() {
    if (!this.token || (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt)) {
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

  // Order Management
  async getOrders(params = {}) {
    const queryParams = new URLSearchParams({
      page: params.page || 1,
      per_page: params.per_page || 50,
      ...params
    }).toString();

    return this.makeRequest('GET', `/external/orders?${queryParams}`);
  }

  async getOrder(orderId) {
    return this.makeRequest('GET', `/external/orders/show/${orderId}`);
  }

  async createOrder(orderData) {
    return this.makeRequest('POST', '/external/orders/create/adhoc', orderData);
  }

  async updateOrder(orderId, updateData) {
    return this.makeRequest('POST', `/external/orders/update/${orderId}`, updateData);
  }

  async cancelOrder(orderId) {
    return this.makeRequest('POST', `/external/orders/cancel`, { order_id: orderId });
  }

  // Shipment Management
  async getShipments(params = {}) {
    const queryParams = new URLSearchParams({
      page: params.page || 1,
      per_page: params.per_page || 50,
      ...params
    }).toString();

    return this.makeRequest('GET', `/external/courier/track/shipments?${queryParams}`);
  }

  async getShipment(shipmentId) {
    return this.makeRequest('GET', `/external/courier/track/shipment/${shipmentId}`);
  }

  async trackShipment(trackingNumber) {
    return this.makeRequest('GET', `/external/courier/track/${trackingNumber}`);
  }

  async createShipment(shipmentData) {
    return this.makeRequest('POST', '/external/courier/assign/awb', shipmentData);
  }

  async generateLabel(shipmentId) {
    return this.makeRequest('POST', '/external/courier/generate/label', {
      shipment_id: shipmentId
    });
  }

  async generateManifest(shipmentIds) {
    return this.makeRequest('POST', '/external/courier/generate/pickup', {
      shipment_id: shipmentIds
    });
  }

  // Returns Management
  async getReturns(params = {}) {
    const queryParams = new URLSearchParams({
      page: params.page || 1,
      per_page: params.per_page || 50,
      ...params
    }).toString();

    return this.makeRequest('GET', `/external/orders/processing/return?${queryParams}`);
  }

  async createReturn(returnData) {
    return this.makeRequest('POST', '/external/orders/create/return', returnData);
  }

  // Rate Calculation
  async calculateRates(rateData) {
    return this.makeRequest('GET', '/external/courier/serviceability/', rateData);
  }

  // Analytics and Reports
  async getAnalytics(params = {}) {
    const queryParams = new URLSearchParams({
      start_date: params.start_date,
      end_date: params.end_date,
      ...params
    }).toString();

    return this.makeRequest('GET', `/external/orders/analytics?${queryParams}`);
  }

  async getRevenue(params = {}) {
    return this.makeRequest('GET', '/external/orders/revenue', params);
  }

  // Webhook Management
  async getWebhooks() {
    return this.makeRequest('GET', '/external/webhooks');
  }

  async createWebhook(webhookData) {
    return this.makeRequest('POST', '/external/webhooks/create', webhookData);
  }

  async updateWebhook(webhookId, webhookData) {
    return this.makeRequest('PUT', `/external/webhooks/${webhookId}`, webhookData);
  }

  async deleteWebhook(webhookId) {
    return this.makeRequest('DELETE', `/external/webhooks/${webhookId}`);
  }

  // Inventory Management
  async getProducts(params = {}) {
    const queryParams = new URLSearchParams({
      page: params.page || 1,
      per_page: params.per_page || 50,
      ...params
    }).toString();

    return this.makeRequest('GET', `/external/products?${queryParams}`);
  }

  async createProduct(productData) {
    return this.makeRequest('POST', '/external/products/create', productData);
  }

  async updateProduct(productId, productData) {
    return this.makeRequest('POST', `/external/products/update/${productId}`, productData);
  }

  // Address and Pickup Management
  async getPickupLocations() {
    return this.makeRequest('GET', '/external/settings/company/pickup');
  }

  async createPickupLocation(locationData) {
    return this.makeRequest('POST', '/external/settings/company/addpickup', locationData);
  }

  async validateAddress(addressData) {
    return this.makeRequest('POST', '/external/courier/serviceability/address', addressData);
  }

  // Utility Methods
  async checkServiceability(origin, destination, weight, dimensions) {
    return this.makeRequest('GET', '/external/courier/serviceability/', {
      origin,
      destination,
      weight,
      length: dimensions.length,
      breadth: dimensions.breadth,
      height: dimensions.height
    });
  }

  async getCourierPartners() {
    return this.makeRequest('GET', '/external/courier/courierListWithDetails');
  }

  async getChannels() {
    return this.makeRequest('GET', '/external/channels');
  }

  // Bulk Operations
  async bulkCreateOrders(ordersData) {
    return this.makeRequest('POST', '/external/orders/create/bulk', ordersData);
  }

  async bulkUpdateShipments(shipmentsData) {
    return this.makeRequest('POST', '/external/courier/assign/bulk', shipmentsData);
  }

  // Health Check
  async healthCheck() {
    try {
      await this.makeRequest('GET', '/external/channels');
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message, 
        timestamp: new Date().toISOString() 
      };
    }
  }
}

module.exports = new ShiprocketAPI(); 