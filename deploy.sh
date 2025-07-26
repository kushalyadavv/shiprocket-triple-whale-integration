#!/bin/bash

# DigitalOcean Deployment Script for Shiprocket-Triple Whale Integration
echo "🚀 Starting deployment..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Create application directory
sudo mkdir -p /var/www/shiprocket-integration
sudo chown $USER:$USER /var/www/shiprocket-integration

# Clone your repository
cd /var/www/shiprocket-integration
git clone https://github.com/kushalyadavv/shiprocket-triple-whale-integration.git .

# Install dependencies
npm ci --production

# Create .env file (you'll need to edit this with your credentials)
cp .env.example .env || touch .env

# Create logs directory
mkdir -p logs

# Set proper permissions
sudo chown -R $USER:$USER /var/www/shiprocket-integration
chmod +x scripts/deploy.sh

# Install and configure firewall
sudo ufw allow ssh
sudo ufw allow 3000
sudo ufw --force enable

echo "📝 Please edit the .env file with your API credentials:"
echo "nano .env"
echo ""
echo "Then start the application with:"
echo "pm2 start src/server.js --name shiprocket-integration"
echo "pm2 startup"
echo "pm2 save"
echo ""
echo "🎉 Deployment script completed!"
echo "Your server will be available at: http://YOUR_SERVER_IP:3000" 