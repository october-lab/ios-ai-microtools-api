#!/bin/bash
git pull
npm install
pm2 start server.js --name "ios-ai-server"