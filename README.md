# Shiprocket to Triple Whale Real-Time Integration

A robust real-time data synchronization system that automatically syncs shipping and logistics data from Shiprocket to Triple Whale for enhanced analytics and attribution.

## 🚀 Features

- **Real-time sync** via Shiprocket webhooks
- **Bi-directional API integration** with error handling
- **Data transformation** and mapping
- **Retry logic** for failed requests
- **Comprehensive logging** and monitoring
- **Rate limiting** and API quota management
- **Scalable architecture** for high-volume operations

## 📋 Prerequisites

- Node.js 18+ or Python 3.9+
- Shiprocket API credentials
- Triple Whale API credentials
- Redis (for caching and rate limiting)
- PostgreSQL/MongoDB (for logging and state management)

## 🏗️ Architecture Overview

```
┌─────────────┐    Webhooks    ┌─────────────────┐    API Calls    ┌─────────────┐
│  Shiprocket │ ──────────────► │  Integration    │ ──────────────► │ Triple Whale│
│             │                │  Service        │                │             │
└─────────────┘                └─────────────────┘                └─────────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │   Database      │
                               │   (Logs/State)  │
                               └─────────────────┘
```

## 📁 Project Structure

```
shiprocket-triple-whale-integration/
├── src/
│   ├── api/
│   │   ├── shiprocket.js
│   │   └── triplewhale.js
│   ├── webhooks/
│   │   ├── shiprocket-handler.js
│   │   └── middleware.js
│   ├── transformers/
│   │   ├── order-transformer.js
│   │   ├── shipment-transformer.js
│   │   └── analytics-transformer.js
│   ├── utils/
│   │   ├── logger.js
│   │   ├── retry.js
│   │   └── validators.js
│   ├── config/
│   │   └── index.js
│   └── server.js
├── tests/
├── docker/
├── docs/
├── scripts/
└── package.json
```

## 🔧 Setup Instructions

1. **Clone and Install**
   ```bash
   git clone <repo-url>
   cd shiprocket-triple-whale-integration
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your API credentials
   ```

3. **Database Setup**
   ```bash
   npm run db:migrate
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

## 📡 API Endpoints

- `POST /webhooks/shiprocket` - Shiprocket webhook handler
- `GET /health` - Health check endpoint
- `POST /sync/manual` - Manual sync trigger
- `GET /metrics` - Integration metrics

## 🔄 Data Flow

1. **Webhook Reception**: Shiprocket sends real-time events
2. **Data Validation**: Validate incoming webhook data
3. **Data Transformation**: Map Shiprocket data to Triple Whale format
4. **API Calls**: Send transformed data to Triple Whale
5. **Error Handling**: Retry failed requests with exponential backoff
6. **Logging**: Track all operations for monitoring

## 🚀 Deployment

Deploy using Docker, AWS Lambda, or your preferred hosting platform.

```bash
# Docker deployment
docker-compose up -d

# Or deploy to AWS Lambda
npm run deploy:lambda
```

## 📊 Monitoring

- Health checks via `/health` endpoint
- Metrics dashboard via `/metrics`
- Log aggregation with structured logging
- Alert notifications for failures

## 🔐 Security

- API key rotation support
- Request signature verification
- Rate limiting protection
- Input validation and sanitization

## 📚 Documentation

- [API Documentation](docs/api.md)
- [Webhook Setup Guide](docs/webhooks.md)
- [Deployment Guide](docs/deployment.md)
- [Troubleshooting](docs/troubleshooting.md) 