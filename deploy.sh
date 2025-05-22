#!/bin/bash
git pull
npm install

# Check if PM2 is installed globally, install if not
if ! command -v pm2 &> /dev/null; then
    echo "PM2 not found, installing globally..."
    npm install -g pm2
fi

# Start/restart the application with PM2
pm2 restart ecosystem.config.js --env production