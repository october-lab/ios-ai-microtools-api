#!/bin/bash
git pull
npm install
pm2 restart ecosystem.config.js --env production