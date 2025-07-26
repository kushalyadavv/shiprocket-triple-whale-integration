# Use official Node.js LTS (Long Term Support) image
FROM node:18-alpine

# Set environment variables
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn

# Create app directory
WORKDIR /usr/src/app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Create logs directory
RUN mkdir -p logs

# Copy application code
COPY src/ ./src/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S shiprocket -u 1001

# Change ownership of the app directory to nodejs user
RUN chown -R shiprocket:nodejs /usr/src/app

# Switch to non-root user
USER shiprocket

# Expose port (should match PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { \
        console.log(res.statusCode); \
        process.exit(res.statusCode === 200 ? 0 : 1); \
    }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "src/server.js"] 