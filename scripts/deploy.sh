#!/bin/bash

# Shiprocket-Triple Whale Integration Deployment Script
# This script helps deploy the integration service to various environments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="production"
BUILD_IMAGE=true
RUN_MIGRATIONS=true
START_SERVICES=true

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment   Environment to deploy to (development|staging|production)"
    echo "  -n, --no-build      Skip building Docker image"
    echo "  -m, --no-migrations Skip running database migrations"
    echo "  -s, --no-start      Skip starting services"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                 # Deploy to production with all steps"
    echo "  $0 -e development                 # Deploy to development environment"
    echo "  $0 --no-build --no-migrations     # Deploy without building or migrating"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -n|--no-build)
            BUILD_IMAGE=false
            shift
            ;;
        -m|--no-migrations)
            RUN_MIGRATIONS=false
            shift
            ;;
        -s|--no-start)
            START_SERVICES=false
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT"
    print_error "Valid environments: development, staging, production"
    exit 1
fi

print_status "Starting deployment for environment: $ENVIRONMENT"

# Check if required files exist
REQUIRED_FILES=("package.json" "src/server.js" "Dockerfile")
for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        print_error "Required file not found: $file"
        exit 1
    fi
done

# Check if Docker is installed and running
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not in PATH"
    exit 1
fi

if ! docker info &> /dev/null; then
    print_error "Docker daemon is not running"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed or not in PATH"
    exit 1
fi

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p logs config monitoring/grafana/{dashboards,datasources} monitoring/prometheus nginx/ssl

# Load environment variables
ENV_FILE=".env"
if [[ "$ENVIRONMENT" != "production" ]]; then
    ENV_FILE=".env.$ENVIRONMENT"
fi

if [[ -f "$ENV_FILE" ]]; then
    print_status "Loading environment variables from $ENV_FILE"
    export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
else
    print_warning "Environment file $ENV_FILE not found"
    if [[ "$ENVIRONMENT" == "production" ]]; then
        print_error "Production environment file is required"
        exit 1
    fi
fi

# Build Docker image
if [[ "$BUILD_IMAGE" == true ]]; then
    print_status "Building Docker image..."
    docker build -t shiprocket-triple-whale-integration:latest . || {
        print_error "Failed to build Docker image"
        exit 1
    }
    print_success "Docker image built successfully"
fi

# Stop existing services
print_status "Stopping existing services..."
docker-compose down --remove-orphans || true

# Run database migrations
if [[ "$RUN_MIGRATIONS" == true ]]; then
    print_status "Running database migrations..."
    
    # Start only the database for migrations
    docker-compose up -d postgres redis
    
    # Wait for database to be ready
    print_status "Waiting for database to be ready..."
    sleep 10
    
    # Run migrations (if migration script exists)
    if [[ -f "scripts/migrate.js" ]]; then
        docker-compose run --rm shiprocket-integration node scripts/migrate.js || {
            print_warning "Migration failed or no migrations to run"
        }
    fi
    
    print_success "Database migrations completed"
fi

# Start services
if [[ "$START_SERVICES" == true ]]; then
    print_status "Starting services..."
    
    # Start all services
    docker-compose up -d || {
        print_error "Failed to start services"
        exit 1
    }
    
    # Wait for services to be healthy
    print_status "Waiting for services to be healthy..."
    sleep 30
    
    # Check health
    HEALTH_URL="http://localhost:3000/health"
    MAX_RETRIES=12
    RETRY_COUNT=0
    
    while [[ $RETRY_COUNT -lt $MAX_RETRIES ]]; do
        if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
            print_success "Services are healthy and ready"
            break
        else
            print_status "Waiting for services to be ready... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
            sleep 5
            ((RETRY_COUNT++))
        fi
    done
    
    if [[ $RETRY_COUNT -eq $MAX_RETRIES ]]; then
        print_error "Services failed to become healthy within timeout"
        print_status "Checking service logs..."
        docker-compose logs --tail=50 shiprocket-integration
        exit 1
    fi
fi

# Show deployment summary
print_success "Deployment completed successfully!"
echo ""
echo "Services running:"
docker-compose ps

echo ""
echo "Useful URLs:"
echo "  - Health Check: http://localhost:3000/health"
echo "  - Metrics: http://localhost:3000/metrics"
echo "  - Webhook Endpoint: http://localhost:3000/webhooks/shiprocket"

if docker-compose ps | grep -q grafana; then
    echo "  - Grafana Dashboard: http://localhost:3001 (admin/admin)"
fi

if docker-compose ps | grep -q prometheus; then
    echo "  - Prometheus: http://localhost:9090"
fi

echo ""
echo "To view logs:"
echo "  docker-compose logs -f shiprocket-integration"
echo ""
echo "To stop services:"
echo "  docker-compose down"

print_success "Deployment script completed!" 