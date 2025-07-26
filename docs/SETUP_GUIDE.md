# Shiprocket to Triple Whale Integration - Setup Guide

This guide will walk you through setting up the real-time integration between Shiprocket and Triple Whale.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Docker
- Shiprocket account with API access
- Triple Whale account with API access
- PostgreSQL database (or use Docker Compose)
- Redis server (or use Docker Compose)

### 1. Clone and Install

```bash
git clone <repository-url>
cd shiprocket-triple-whale-integration
npm install
```

### 2. Environment Configuration

Copy the environment template:

```bash
cp .env.example .env
```

Edit `.env` with your API credentials:

```env
# Shiprocket Configuration
SHIPROCKET_API_KEY=your_shiprocket_email
SHIPROCKET_API_SECRET=your_shiprocket_password
SHIPROCKET_WEBHOOK_SECRET=your_webhook_secret

# Triple Whale Configuration
TRIPLE_WHALE_API_KEY=your_triple_whale_api_key

# Database (if not using Docker)
DATABASE_URL=postgresql://username:password@localhost:5432/integration_db
REDIS_URL=redis://localhost:6379
```

### 3. Quick Deployment with Docker

```bash
# Make the deploy script executable
chmod +x scripts/deploy.sh

# Deploy everything
./scripts/deploy.sh
```

## 📋 Detailed Setup Steps

### Step 1: Get API Credentials

#### Shiprocket API Setup

1. Log into your Shiprocket dashboard
2. Go to `Settings` → `API` → `Generate API Key`
3. Copy your API credentials
4. For webhooks, go to `Settings` → `Webhooks` and add:
   - URL: `https://your-domain.com/webhooks/shiprocket`
   - Secret: Generate a secure random string

#### Triple Whale API Setup

1. Log into Triple Whale
2. Go to `Settings` → `Integrations` → `API Keys`
3. Create a new API key
4. Copy the API key

### Step 2: Database Setup

#### Using Docker (Recommended)

The Docker Compose setup includes PostgreSQL and Redis:

```bash
docker-compose up -d postgres redis
```

#### Manual Database Setup

```sql
CREATE DATABASE integration_db;
CREATE USER integration_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE integration_db TO integration_user;
```

### Step 3: Configuration

Create your environment file:

```env
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Shiprocket API
SHIPROCKET_API_URL=https://apiv2.shiprocket.in/v1
SHIPROCKET_API_KEY=your_email@example.com
SHIPROCKET_API_SECRET=your_password
SHIPROCKET_WEBHOOK_SECRET=your_secure_webhook_secret

# Triple Whale API
TRIPLE_WHALE_API_URL=https://api.triplewhale.com/api/v2
TRIPLE_WHALE_API_KEY=tw_xxxxxxxxxxxx

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/integration_db
REDIS_URL=redis://localhost:6379

# Sync Configuration
ENABLE_REAL_TIME_SYNC=true
SYNC_BATCH_SIZE=50
SYNC_INTERVAL_MINUTES=5

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs/integration.log

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Security
WEBHOOK_VERIFY_SIGNATURE=true
API_REQUEST_TIMEOUT=30000
```

### Step 4: Shiprocket Webhook Configuration

1. In Shiprocket dashboard, go to Settings → Webhooks
2. Add a new webhook with these settings:
   - **URL**: `https://your-domain.com/webhooks/shiprocket`
   - **Events**: Select all order and shipment events
   - **Secret**: Use the same secret from your `.env` file

#### Supported Events

- `order_created` - New order placed
- `order_shipped` - Order shipped
- `order_delivered` - Order delivered
- `order_cancelled` - Order cancelled
- `order_returned` - Order returned/RTO
- `shipment_pickup` - Package picked up
- `in_transit` - Package in transit
- `out_for_delivery` - Out for delivery
- `failed_delivery` - Delivery failed

### Step 5: Deployment Options

#### Option A: Docker Deployment (Recommended)

```bash
# Full deployment with all services
./scripts/deploy.sh

# Development deployment
./scripts/deploy.sh -e development

# Custom deployment
./scripts/deploy.sh --no-build --no-migrations
```

#### Option B: Manual Deployment

```bash
# Install dependencies
npm ci --production

# Run database migrations
npm run db:migrate

# Start the application
npm start
```

#### Option C: Cloud Deployment

**AWS Lambda:**
```bash
npm run deploy:lambda
```

**Heroku:**
```bash
git push heroku main
```

**Docker on AWS ECS/Google Cloud Run:**
```bash
docker build -t shiprocket-integration .
docker push your-registry/shiprocket-integration
```

## 🔧 Configuration Options

### Sync Settings

```env
# Enable real-time webhook processing
ENABLE_REAL_TIME_SYNC=true

# Batch size for manual syncs
SYNC_BATCH_SIZE=50

# Automatic sync interval (minutes)
SYNC_INTERVAL_MINUTES=5
```

### Google Sheets Backup (Optional)

```env
GOOGLE_SHEETS_CREDENTIALS_PATH=./config/google-credentials.json
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SHEETS_BACKUP_ENABLED=true
```

### Security Settings

```env
# Webhook signature verification
WEBHOOK_VERIFY_SIGNATURE=true

# Request timeouts
API_REQUEST_TIMEOUT=30000
WEBHOOK_TIMEOUT_MS=5000

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 📊 Monitoring and Metrics

### Built-in Endpoints

- **Health Check**: `GET /health`
- **Metrics**: `GET /metrics`
- **Test Connections**: `GET /api/test-connections`

### Monitoring Stack (Optional)

The Docker Compose includes Prometheus and Grafana:

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)

### Key Metrics Tracked

- Webhook processing success rate
- API response times
- Data synchronization counts
- Error rates and types
- Circuit breaker states

## 🔄 Data Flow

```
Shiprocket → Webhook → Validation → Transformation → Triple Whale
     ↓              ↓           ↓              ↓
   Events      Processing   Metrics      Analytics
```

### Metrics Generated

**Order Metrics:**
- `shiprocket_orders_created`
- `shiprocket_order_value`
- `shiprocket_products_ordered`

**Shipping Metrics:**
- `shiprocket_shipments_created`
- `shiprocket_shipping_cost`
- `shiprocket_processing_time`

**Delivery Metrics:**
- `shiprocket_deliveries_successful`
- `shiprocket_delivery_time`
- `shiprocket_fulfillment_time`

**Performance Metrics:**
- `shiprocket_rto_orders`
- `shiprocket_returns`
- `shiprocket_failed_deliveries`

## 🛠️ Troubleshooting

### Common Issues

**1. Authentication Errors**
```bash
# Test Shiprocket connection
curl -X GET "http://localhost:3000/api/test-connections"

# Check logs
docker-compose logs shiprocket-integration
```

**2. Webhook Not Receiving Data**
- Verify webhook URL is publicly accessible
- Check webhook secret matches configuration
- Ensure firewall allows incoming connections

**3. Triple Whale API Errors**
- Verify API key is correct
- Check API rate limits
- Ensure proper data format

### Debug Mode

```env
LOG_LEVEL=debug
NODE_ENV=development
```

### Logs Location

- **Docker**: `docker-compose logs -f shiprocket-integration`
- **Local**: `./logs/integration.log`

## 📝 Manual Operations

### Manual Sync

```bash
# Sync orders for date range
curl -X POST http://localhost:3000/api/sync/manual \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "syncType": "orders"
  }'

# Sync all data
curl -X POST http://localhost:3000/api/sync/manual \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "syncType": "all"
  }'
```

### Health Checks

```bash
# Check overall health
curl http://localhost:3000/health

# Check specific service connections
curl http://localhost:3000/api/test-connections

# View metrics
curl http://localhost:3000/metrics
```

## 🔒 Security Best Practices

1. **Use Environment Variables**: Never hardcode API keys
2. **Enable Webhook Verification**: Always verify webhook signatures
3. **Use HTTPS**: Deploy with SSL/TLS certificates
4. **Rate Limiting**: Configure appropriate rate limits
5. **Network Security**: Use firewalls and VPCs
6. **Regular Updates**: Keep dependencies updated
7. **Monitoring**: Set up alerts for failures

## 📈 Scaling Considerations

### High Volume Deployment

For high-volume operations:

1. **Horizontal Scaling**: Deploy multiple instances behind a load balancer
2. **Database Optimization**: Use connection pooling and read replicas
3. **Redis Clustering**: Set up Redis cluster for caching
4. **Queue System**: Implement message queues for webhook processing
5. **CDN**: Use CDN for static assets

### Performance Tuning

```env
# Increase batch sizes
SYNC_BATCH_SIZE=100

# Adjust timeouts
API_REQUEST_TIMEOUT=60000

# Optimize retry settings
MAX_RETRY_ATTEMPTS=5
RETRY_DELAY_MS=2000
```

## 🆘 Support

### Getting Help

1. Check the logs for error messages
2. Review the troubleshooting section
3. Test individual components
4. Verify configuration settings

### Useful Commands

```bash
# View all containers
docker-compose ps

# Check logs
docker-compose logs -f

# Restart services
docker-compose restart

# Update and redeploy
git pull && ./scripts/deploy.sh

# Backup configuration
cp .env .env.backup
```

---

## 🎉 You're Ready!

Your Shiprocket to Triple Whale integration is now set up and running! The system will:

- ✅ Process webhooks in real-time
- ✅ Sync data daily at 12:05 AM IST  
- ✅ Transform shipping data to Triple Whale metrics
- ✅ Provide comprehensive monitoring and logging
- ✅ Handle errors gracefully with retry logic

Monitor the health endpoint and logs to ensure everything is working correctly. 