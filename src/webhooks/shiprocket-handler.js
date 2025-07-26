const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const tripleWhaleAPI = require('../api/triplewhale');
const { validateWebhookData } = require('../utils/validators');

const router = express.Router();

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!config.webhook.verifySignature) {
    return true; // Skip verification if disabled
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const receivedSignature = signature.replace('sha256=', '');
  
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(receivedSignature, 'hex')
  );
}

/**
 * Process webhook events and transform data for Triple Whale
 */
async function processWebhookEvent(eventType, data) {
  const startTime = Date.now();
  
  try {
    logger.webhook('Processing webhook event', 'shiprocket', {
      eventType,
      orderId: data.order_id,
      shipmentId: data.shipment_id
    });

    let metrics = [];
    
    switch (eventType) {
      case 'order_created':
      case 'order_placed':
        metrics = await processOrderCreated(data);
        break;
        
      case 'order_shipped':
      case 'shipment_created':
        metrics = await processOrderShipped(data);
        break;
        
      case 'order_delivered':
      case 'delivered':
        metrics = await processOrderDelivered(data);
        break;
        
      case 'order_cancelled':
      case 'cancelled':
        metrics = await processOrderCancelled(data);
        break;
        
      case 'order_returned':
      case 'rto':
        metrics = await processOrderReturned(data);
        break;
        
      case 'shipment_pickup':
        metrics = await processShipmentPickup(data);
        break;
        
      case 'in_transit':
        metrics = await processInTransit(data);
        break;
        
      case 'out_for_delivery':
        metrics = await processOutForDelivery(data);
        break;
        
      case 'failed_delivery':
      case 'delivery_failed':
        metrics = await processFailedDelivery(data);
        break;
        
      default:
        logger.warn('Unknown webhook event type', { eventType, data });
        return { success: false, reason: 'Unknown event type' };
    }

    // Push metrics to Triple Whale if any were generated
    if (metrics.length > 0) {
      await tripleWhaleAPI.pushCustomMetrics(metrics);
      
      logger.sync('Webhook data synced to Triple Whale', 'success', {
        eventType,
        metricsCount: metrics.length,
        duration: Date.now() - startTime
      });
    }

    return { 
      success: true, 
      metricsGenerated: metrics.length,
      processingTime: Date.now() - startTime
    };

  } catch (error) {
    logger.error('Failed to process webhook event', error, {
      eventType,
      data,
      duration: Date.now() - startTime
    });
    
    throw error;
  }
}

/**
 * Process order created events
 */
async function processOrderCreated(data) {
  const metrics = [];
  const date = data.order_date ? data.order_date.split('T')[0] : new Date().toISOString().split('T')[0];

  // Order count metric
  metrics.push({
    metric_name: 'shiprocket_orders_created',
    value: 1,
    date,
    dimensions: {
      source: 'shiprocket',
      event: 'order_created',
      order_id: data.order_id,
      channel: data.channel_name || 'unknown',
      payment_method: data.payment_method || 'unknown'
    }
  });

  // Order value metric
  if (data.total_amount) {
    metrics.push({
      metric_name: 'shiprocket_order_value',
      value: parseFloat(data.total_amount),
      date,
      dimensions: {
        source: 'shiprocket',
        event: 'order_created',
        order_id: data.order_id,
        channel: data.channel_name || 'unknown',
        currency: 'INR'
      }
    });
  }

  // Product metrics
  if (data.products && Array.isArray(data.products)) {
    metrics.push({
      metric_name: 'shiprocket_products_ordered',
      value: data.products.length,
      date,
      dimensions: {
        source: 'shiprocket',
        event: 'order_created',
        order_id: data.order_id
      }
    });

    // Calculate total quantity
    const totalQuantity = data.products.reduce((sum, product) => sum + (product.quantity || 1), 0);
    metrics.push({
      metric_name: 'shiprocket_items_ordered',
      value: totalQuantity,
      date,
      dimensions: {
        source: 'shiprocket',
        event: 'order_created',
        order_id: data.order_id
      }
    });
  }

  return metrics;
}

/**
 * Process order shipped events
 */
async function processOrderShipped(data) {
  const metrics = [];
  const date = data.shipped_date ? data.shipped_date.split('T')[0] : new Date().toISOString().split('T')[0];

  // Shipment created metric
  metrics.push({
    metric_name: 'shiprocket_shipments_created',
    value: 1,
    date,
    dimensions: {
      source: 'shiprocket',
      event: 'order_shipped',
      order_id: data.order_id,
      shipment_id: data.shipment_id,
      courier: data.courier_name || 'unknown'
    }
  });

  // Shipping cost metric
  if (data.shipping_charges) {
    metrics.push({
      metric_name: 'shiprocket_shipping_cost',
      value: parseFloat(data.shipping_charges),
      date,
      dimensions: {
        source: 'shiprocket',
        event: 'order_shipped',
        order_id: data.order_id,
        shipment_id: data.shipment_id,
        courier: data.courier_name || 'unknown',
        currency: 'INR'
      }
    });
  }

  // Processing time metric (if order creation time is available)
  if (data.order_created_date && data.shipped_date) {
    const createdTime = new Date(data.order_created_date);
    const shippedTime = new Date(data.shipped_date);
    const processingHours = (shippedTime - createdTime) / (1000 * 60 * 60);

    metrics.push({
      metric_name: 'shiprocket_processing_time',
      value: processingHours,
      date,
      dimensions: {
        source: 'shiprocket',
        event: 'order_shipped',
        order_id: data.order_id,
        unit: 'hours'
      }
    });
  }

  return metrics;
}

/**
 * Process order delivered events
 */
async function processOrderDelivered(data) {
  const metrics = [];
  const date = data.delivered_date ? data.delivered_date.split('T')[0] : new Date().toISOString().split('T')[0];

  // Delivery success metric
  metrics.push({
    metric_name: 'shiprocket_deliveries_successful',
    value: 1,
    date,
    dimensions: {
      source: 'shiprocket',
      event: 'order_delivered',
      order_id: data.order_id,
      shipment_id: data.shipment_id,
      courier: data.courier_name || 'unknown'
    }
  });

  // Calculate delivery time
  if (data.shipped_date && data.delivered_date) {
    const shippedTime = new Date(data.shipped_date);
    const deliveredTime = new Date(data.delivered_date);
    const deliveryHours = (deliveredTime - shippedTime) / (1000 * 60 * 60);

    metrics.push({
      metric_name: 'shiprocket_delivery_time',
      value: deliveryHours,
      date,
      dimensions: {
        source: 'shiprocket',
        event: 'order_delivered',
        order_id: data.order_id,
        courier: data.courier_name || 'unknown',
        unit: 'hours'
      }
    });
  }

  // Total fulfillment time (order to delivery)
  if (data.order_created_date && data.delivered_date) {
    const createdTime = new Date(data.order_created_date);
    const deliveredTime = new Date(data.delivered_date);
    const fulfillmentHours = (deliveredTime - createdTime) / (1000 * 60 * 60);

    metrics.push({
      metric_name: 'shiprocket_fulfillment_time',
      value: fulfillmentHours,
      date,
      dimensions: {
        source: 'shiprocket',
        event: 'order_delivered',
        order_id: data.order_id,
        unit: 'hours'
      }
    });
  }

  return metrics;
}

/**
 * Process order cancelled events
 */
async function processOrderCancelled(data) {
  const metrics = [];
  const date = data.cancelled_date ? data.cancelled_date.split('T')[0] : new Date().toISOString().split('T')[0];

  metrics.push({
    metric_name: 'shiprocket_orders_cancelled',
    value: 1,
    date,
    dimensions: {
      source: 'shiprocket',
      event: 'order_cancelled',
      order_id: data.order_id,
      reason: data.cancellation_reason || 'unknown'
    }
  });

  // Lost revenue metric
  if (data.total_amount) {
    metrics.push({
      metric_name: 'shiprocket_revenue_lost',
      value: parseFloat(data.total_amount),
      date,
      dimensions: {
        source: 'shiprocket',
        event: 'order_cancelled',
        order_id: data.order_id,
        currency: 'INR'
      }
    });
  }

  return metrics;
}

/**
 * Process order returned/RTO events
 */
async function processOrderReturned(data) {
  const metrics = [];
  const date = data.returned_date || data.rto_date ? 
    (data.returned_date || data.rto_date).split('T')[0] : 
    new Date().toISOString().split('T')[0];

  const isRTO = data.event_type === 'rto' || data.return_type === 'rto';

  metrics.push({
    metric_name: isRTO ? 'shiprocket_rto_orders' : 'shiprocket_returns',
    value: 1,
    date,
    dimensions: {
      source: 'shiprocket',
      event: isRTO ? 'rto' : 'return',
      order_id: data.order_id,
      shipment_id: data.shipment_id,
      reason: data.return_reason || 'unknown'
    }
  });

  // Return cost metric
  if (data.return_charges) {
    metrics.push({
      metric_name: 'shiprocket_return_cost',
      value: parseFloat(data.return_charges),
      date,
      dimensions: {
        source: 'shiprocket',
        event: isRTO ? 'rto' : 'return',
        order_id: data.order_id,
        currency: 'INR'
      }
    });
  }

  return metrics;
}

/**
 * Process other shipment events
 */
async function processShipmentPickup(data) {
  return [{
    metric_name: 'shiprocket_pickups',
    value: 1,
    date: data.pickup_date ? data.pickup_date.split('T')[0] : new Date().toISOString().split('T')[0],
    dimensions: {
      source: 'shiprocket',
      event: 'pickup',
      shipment_id: data.shipment_id,
      courier: data.courier_name || 'unknown'
    }
  }];
}

async function processInTransit(data) {
  return [{
    metric_name: 'shiprocket_in_transit',
    value: 1,
    date: new Date().toISOString().split('T')[0],
    dimensions: {
      source: 'shiprocket',
      event: 'in_transit',
      shipment_id: data.shipment_id,
      order_id: data.order_id
    }
  }];
}

async function processOutForDelivery(data) {
  return [{
    metric_name: 'shiprocket_out_for_delivery',
    value: 1,
    date: new Date().toISOString().split('T')[0],
    dimensions: {
      source: 'shiprocket',
      event: 'out_for_delivery',
      shipment_id: data.shipment_id,
      order_id: data.order_id
    }
  }];
}

async function processFailedDelivery(data) {
  return [{
    metric_name: 'shiprocket_failed_deliveries',
    value: 1,
    date: new Date().toISOString().split('T')[0],
    dimensions: {
      source: 'shiprocket',
      event: 'failed_delivery',
      shipment_id: data.shipment_id,
      order_id: data.order_id,
      reason: data.failure_reason || 'unknown'
    }
  }];
}

/**
 * Main webhook endpoint
 */
router.post('/shiprocket', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Get raw body for signature verification
    const payload = JSON.stringify(req.body);
    const signature = req.headers['x-shiprocket-signature'] || req.headers['authorization'];
    
    // Verify webhook signature
    if (config.webhook.verifySignature && signature) {
      const isValid = verifyWebhookSignature(payload, signature, config.shiprocket.webhookSecret);
      if (!isValid) {
        logger.warn('Invalid webhook signature', {
          signature,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Validate webhook data structure
    const validationResult = validateWebhookData(req.body);
    if (!validationResult.isValid) {
      logger.warn('Invalid webhook data', {
        errors: validationResult.errors,
        data: req.body
      });
      return res.status(400).json({ 
        error: 'Invalid webhook data',
        details: validationResult.errors
      });
    }

    const { event_type, data } = req.body;
    
    // Process the webhook event
    const result = await processWebhookEvent(event_type, data);
    
    const duration = Date.now() - startTime;
    
    logger.info('Webhook processed successfully', {
      eventType: event_type,
      orderId: data.order_id,
      shipmentId: data.shipment_id,
      metricsGenerated: result.metricsGenerated,
      duration
    });

    // Respond quickly to avoid timeouts
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      metricsGenerated: result.metricsGenerated,
      processingTime: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Webhook processing failed', error, {
      body: req.body,
      headers: req.headers,
      duration
    });

    // Still return 200 to avoid webhook retries for application errors
    res.status(200).json({
      success: false,
      error: 'Internal processing error',
      message: 'Webhook received but processing failed'
    });
  }
});

/**
 * Health check endpoint for webhook
 */
router.get('/shiprocket/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'shiprocket-webhook-handler'
  });
});

module.exports = router; 