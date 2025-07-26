const Joi = require('joi');

/**
 * Webhook data validation schema
 */
const webhookSchema = Joi.object({
  event_type: Joi.string().required(),
  data: Joi.object().required(),
  timestamp: Joi.date().optional(),
  webhook_id: Joi.string().optional()
});

/**
 * Order data schema for validation
 */
const orderDataSchema = Joi.object({
  order_id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  order_date: Joi.date().iso().optional(),
  total_amount: Joi.number().positive().optional(),
  channel_name: Joi.string().optional(),
  payment_method: Joi.string().optional(),
  products: Joi.array().items(Joi.object({
    sku: Joi.string().optional(),
    name: Joi.string().optional(),
    quantity: Joi.number().positive().optional(),
    price: Joi.number().positive().optional()
  })).optional()
});

/**
 * Shipment data schema for validation
 */
const shipmentDataSchema = Joi.object({
  shipment_id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  order_id: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  courier_name: Joi.string().optional(),
  tracking_number: Joi.string().optional(),
  shipped_date: Joi.date().iso().optional(),
  delivered_date: Joi.date().iso().optional(),
  shipping_charges: Joi.number().positive().optional(),
  status: Joi.string().optional()
});

/**
 * Triple Whale metrics schema
 */
const metricsSchema = Joi.object({
  metric_name: Joi.string().required(),
  value: Joi.number().required(),
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  dimensions: Joi.object().optional(),
  timestamp: Joi.date().iso().optional()
});

/**
 * Validate webhook data
 */
function validateWebhookData(data) {
  const { error, value } = webhookSchema.validate(data, { 
    allowUnknown: true,
    stripUnknown: false 
  });

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }))
    };
  }

  // Additional validation based on event type
  const eventValidation = validateEventSpecificData(value.event_type, value.data);
  if (!eventValidation.isValid) {
    return eventValidation;
  }

  return { isValid: true, data: value };
}

/**
 * Validate event-specific data
 */
function validateEventSpecificData(eventType, data) {
  let schema;

  switch (eventType) {
    case 'order_created':
    case 'order_placed':
    case 'order_cancelled':
    case 'order_delivered':
      schema = orderDataSchema;
      break;
      
    case 'order_shipped':
    case 'shipment_created':
    case 'in_transit':
    case 'out_for_delivery':
    case 'failed_delivery':
      schema = shipmentDataSchema;
      break;
      
    default:
      // For unknown events, just check for basic structure
      schema = Joi.object({
        order_id: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
        shipment_id: Joi.alternatives().try(Joi.string(), Joi.number()).optional()
      });
  }

  const { error } = schema.validate(data, { allowUnknown: true });

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => ({
        field: `data.${detail.path.join('.')}`,
        message: detail.message,
        value: detail.context?.value
      }))
    };
  }

  return { isValid: true };
}

/**
 * Validate metrics data for Triple Whale
 */
function validateMetrics(metrics) {
  const metricsArray = Array.isArray(metrics) ? metrics : [metrics];
  const errors = [];

  for (let i = 0; i < metricsArray.length; i++) {
    const { error } = metricsSchema.validate(metricsArray[i]);
    
    if (error) {
      errors.push({
        index: i,
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }))
      });
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return { isValid: true, data: metricsArray };
}

/**
 * Validate API configuration
 */
function validateApiConfig(config) {
  const configSchema = Joi.object({
    shiprocket: Joi.object({
      apiUrl: Joi.string().uri().required(),
      apiKey: Joi.string().required(),
      apiSecret: Joi.string().required(),
      webhookSecret: Joi.string().optional()
    }).required(),
    
    tripleWhale: Joi.object({
      apiUrl: Joi.string().uri().required(),
      apiKey: Joi.string().when('clientId', {
        is: Joi.exist(),
        then: Joi.optional(),
        otherwise: Joi.required()
      }),
      clientId: Joi.string().optional(),
      clientSecret: Joi.string().when('clientId', {
        is: Joi.exist(),
        then: Joi.required(),
        otherwise: Joi.optional()
      })
    }).required()
  });

  const { error, value } = configSchema.validate(config, { allowUnknown: true });

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    };
  }

  return { isValid: true, config: value };
}

/**
 * Sanitize data for logging (remove sensitive information)
 */
function sanitizeForLogging(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveFields = [
    'password', 'secret', 'token', 'api_key', 'apiKey',
    'auth', 'authorization', 'signature', 'private_key',
    'credit_card', 'cc_number', 'cvv', 'ssn'
  ];

  const sanitized = { ...data };

  function sanitizeObject(obj) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const lowerKey = key.toLowerCase();
        
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
    }
  }

  sanitizeObject(sanitized);
  return sanitized;
}

/**
 * Validate email addresses
 */
function validateEmail(email) {
  const emailSchema = Joi.string().email().required();
  const { error } = emailSchema.validate(email);
  return !error;
}

/**
 * Validate phone numbers (basic validation)
 */
function validatePhoneNumber(phone) {
  const phoneSchema = Joi.string().pattern(/^[+]?[\d\s\-\(\)]{10,}$/).required();
  const { error } = phoneSchema.validate(phone);
  return !error;
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function validateDate(date) {
  const dateSchema = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required();
  const { error } = dateSchema.validate(date);
  
  if (error) return false;
  
  // Additional check for valid date
  const parsedDate = new Date(date);
  return parsedDate instanceof Date && !isNaN(parsedDate.getTime());
}

/**
 * Validate URL format
 */
function validateUrl(url) {
  const urlSchema = Joi.string().uri().required();
  const { error } = urlSchema.validate(url);
  return !error;
}

/**
 * Validate numeric values
 */
function validateNumeric(value, options = {}) {
  let schema = Joi.number();
  
  if (options.positive) schema = schema.positive();
  if (options.integer) schema = schema.integer();
  if (options.min !== undefined) schema = schema.min(options.min);
  if (options.max !== undefined) schema = schema.max(options.max);
  
  const { error } = schema.validate(value);
  return !error;
}

/**
 * Validate required fields in object
 */
function validateRequiredFields(data, requiredFields) {
  const missing = [];
  
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missing.push(field);
    }
  }
  
  if (missing.length > 0) {
    return {
      isValid: false,
      errors: missing.map(field => ({
        field,
        message: `${field} is required`
      }))
    };
  }
  
  return { isValid: true };
}

/**
 * Custom validation for Shiprocket order data
 */
function validateShiprocketOrder(orderData) {
  const schema = Joi.object({
    order_id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
    order_date: Joi.date().iso().required(),
    billing_customer_name: Joi.string().required(),
    billing_last_name: Joi.string().optional(),
    billing_address: Joi.string().required(),
    billing_city: Joi.string().required(),
    billing_pincode: Joi.string().required(),
    billing_state: Joi.string().required(),
    billing_country: Joi.string().required(),
    billing_email: Joi.string().email().required(),
    billing_phone: Joi.string().required(),
    shipping_is_billing: Joi.boolean().optional(),
    order_items: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      sku: Joi.string().required(),
      units: Joi.number().positive().required(),
      selling_price: Joi.number().positive().required()
    })).min(1).required(),
    payment_method: Joi.string().required(),
    sub_total: Joi.number().positive().required(),
    length: Joi.number().positive().required(),
    breadth: Joi.number().positive().required(),
    height: Joi.number().positive().required(),
    weight: Joi.number().positive().required()
  });

  const { error, value } = schema.validate(orderData);

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }))
    };
  }

  return { isValid: true, data: value };
}

/**
 * Batch validation for multiple items
 */
function validateBatch(items, validator) {
  const results = [];
  let hasErrors = false;

  for (let i = 0; i < items.length; i++) {
    const result = validator(items[i]);
    results.push({
      index: i,
      ...result
    });
    
    if (!result.isValid) {
      hasErrors = true;
    }
  }

  return {
    isValid: !hasErrors,
    results,
    validCount: results.filter(r => r.isValid).length,
    errorCount: results.filter(r => !r.isValid).length
  };
}

module.exports = {
  validateWebhookData,
  validateEventSpecificData,
  validateMetrics,
  validateApiConfig,
  validateShiprocketOrder,
  validateEmail,
  validatePhoneNumber,
  validateDate,
  validateUrl,
  validateNumeric,
  validateRequiredFields,
  validateBatch,
  sanitizeForLogging,
  
  // Export schemas for custom usage
  schemas: {
    webhook: webhookSchema,
    orderData: orderDataSchema,
    shipmentData: shipmentDataSchema,
    metrics: metricsSchema
  }
}; 