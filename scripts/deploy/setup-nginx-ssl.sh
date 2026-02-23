#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash scripts/deploy/setup-nginx-ssl.sh <domain> <email> [app_port]
# Example:
#   sudo bash scripts/deploy/setup-nginx-ssl.sh portal.example.com admin@example.com 3000

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/deploy/setup-nginx-ssl.sh <domain> <email> [app_port]"
  exit 1
fi

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <domain> <email> [app_port]"
  exit 1
fi

domain="$1"
email="$2"
app_port="${3:-3000}"
server_name="$domain"
site_file="/etc/nginx/sites-available/ts-portal.conf"

apt update
apt install -y nginx certbot python3-certbot-nginx ufw

cat > "$site_file" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $server_name;

    location / {
        proxy_pass http://127.0.0.1:$app_port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -sf "$site_file" /etc/nginx/sites-enabled/ts-portal.conf
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw delete allow "$app_port" >/dev/null 2>&1 || true

certbot --nginx --non-interactive --agree-tos --email "$email" --redirect -d "$domain"
certbot renew --dry-run || true

systemctl reload nginx

echo "HTTPS setup complete."
echo "URL: https://$domain"
