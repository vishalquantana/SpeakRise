#!/bin/bash
set -e

echo "=== SpeakRise VPS Setup ==="

# System packages
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx python3-venv python3-pip git curl

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Clone repo
mkdir -p /opt/speakrise
cd /opt/speakrise
if [ ! -d .git ]; then
    git clone https://github.com/vishalquantana/SpeakRise.git .
else
    git pull
fi

# Python venv for AI service
python3 -m venv venv
source venv/bin/activate
pip install -r ai-service/requirements.txt

# Download model files if not present
if [ ! -f kokoro-v1.0.onnx ]; then
    echo "Downloading Kokoro model..."
    curl -L -o kokoro-v1.0.onnx https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx
    curl -L -o voices-v1.0.bin https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin
fi

# Build Next.js
cd web
npm ci
npm run build
cd ..

# Install systemd services
cp deploy/speakrise-web.service /etc/systemd/system/
cp deploy/speakrise-ai.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable speakrise-web speakrise-ai
systemctl restart speakrise-ai
systemctl restart speakrise-web

# Nginx
cp deploy/nginx.conf /etc/nginx/sites-available/speakrise
ln -sf /etc/nginx/sites-available/speakrise /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# SSL (skip if already configured)
if [ ! -d /etc/letsencrypt/live/speakrise.quantana.top ]; then
    certbot --nginx -d speakrise.quantana.top --non-interactive --agree-tos -m admin@quantana.top
fi

nginx -t && systemctl restart nginx

echo "=== Setup complete ==="
echo "Visit https://speakrise.quantana.top"
