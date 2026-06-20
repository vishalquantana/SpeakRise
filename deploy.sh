#!/bin/bash
set -e

VPS_HOST="root@65.20.72.27"
VPS_PASS='dS-2ff3))CxAiq*{'
VPS_PATH="/opt/speakrise"

echo "=== Deploying SpeakRise ==="

# 1. Rsync (exclude local artifacts that would break the server)
echo "Syncing files..."
sshpass -p "$VPS_PASS" rsync -avz \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude __pycache__ \
  --exclude '*.pyc' \
  --exclude venv \
  --exclude '.env' \
  -e 'ssh -o StrictHostKeyChecking=no' \
  ./ "$VPS_HOST:$VPS_PATH/"

# 2. Install deps + build on VPS
echo "Installing dependencies and building on VPS..."
sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no "$VPS_HOST" \
  "cd $VPS_PATH/web && npm install && npm run build"

# 3. Restart services
echo "Restarting services..."
sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no "$VPS_HOST" \
  "systemctl restart speakrise-web speakrise-ai"

echo "=== Deploy complete ==="
echo "https://speakrise.quantana.top"
