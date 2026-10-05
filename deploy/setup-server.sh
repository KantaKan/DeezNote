#!/usr/bin/env bash
# One-time droplet setup for DeezNote. Safe to re-run.
#
#   sudo bash setup-server.sh <domain> "<deploy ssh public key>"
#   e.g. sudo bash setup-server.sh deeznote.103-253-146-20.sslip.io "ssh-ed25519 AAAA... deeznote-deploy"
#
# Creates:
#   deeznote user           owns the app, receives deploys over SSH, runs the API
#   /srv/deeznote           releases/<commit>/ + current -> active release (mounted read-only into Caddy)
#   /var/lib/deeznote       the SQLite database (outside anything Caddy can see)
#   deeznote-api.service    the Bun API, bound to Docker's bridge IP, memory-capped
set -euo pipefail

DOMAIN="${1:?usage: setup-server.sh <domain> \"<ssh public key>\"}"
DEPLOY_PUBLIC_KEY="${2:?usage: setup-server.sh <domain> \"<ssh public key>\"}"
BUN_VERSION="1.4.2"
APP_USER="deeznote"
APP_DIR="/srv/deeznote"
DATA_DIR="/var/lib/deeznote"
API_PORT="3100"

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi

echo "==> Packages"
apt-get update -qq
apt-get install -y -qq curl unzip ca-certificates iproute2 sudo sqlite3 >/dev/null

echo "==> Bun $BUN_VERSION"
if [[ "$(/usr/local/bin/bun --version 2>/dev/null || true)" != "$BUN_VERSION" ]]; then
  curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v$BUN_VERSION" >/dev/null 2>&1
fi
/usr/local/bin/bun --version

# The API listens only on Docker's default bridge, which containers (Caddy) can reach but the internet can't.
DOCKER_HOST_IP="$(ip -4 -o addr show docker0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 || true)"
DOCKER_HOST_IP="${DOCKER_HOST_IP:-172.17.0.1}"
echo "==> API will listen on $DOCKER_HOST_IP:$API_PORT"

# With ufw active (incoming policy: drop), the Caddy container, which sits on its own compose
# network, can't reach the host. Allow only Docker's private ranges to the API port.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  echo "==> ufw: allow Docker networks to reach the API"
  ufw allow proto tcp from 172.16.0.0/12 to "$DOCKER_HOST_IP" port "$API_PORT" comment "DeezNote API from Docker networks" >/dev/null
fi

echo "==> User and folders"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_DIR" "$APP_DIR/releases"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$DATA_DIR"
echo "http://$DOCKER_HOST_IP:$API_PORT/health" > "$APP_DIR/health-url"
chown "$APP_USER:$APP_USER" "$APP_DIR/health-url"

echo "==> SSH key for GitHub Actions"
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 "$APP_HOME/.ssh"
touch "$APP_HOME/.ssh/authorized_keys"
grep -qxF "$DEPLOY_PUBLIC_KEY" "$APP_HOME/.ssh/authorized_keys" || echo "$DEPLOY_PUBLIC_KEY" >> "$APP_HOME/.ssh/authorized_keys"
chown "$APP_USER:$APP_USER" "$APP_HOME/.ssh/authorized_keys"
chmod 600 "$APP_HOME/.ssh/authorized_keys"

echo "==> systemd service"
cat > /etc/systemd/system/deeznote-api.service <<EOF
[Unit]
Description=DeezNote API
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/current/api
ExecStart=/usr/local/bin/bun $APP_DIR/current/api/dist/index.js
Environment=NODE_ENV=production
Environment=API_HOST=$DOCKER_HOST_IP
Environment=API_PORT=$API_PORT
Environment=DATABASE_PATH=$DATA_DIR/deeznote.db
Environment=WEB_ORIGIN=https://$DOMAIN
Restart=on-failure
RestartSec=2
# Keep the API from starving the other apps on a 1 GB droplet.
MemoryMax=256M
# Hardening: the API can only write to its database folder.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable deeznote-api >/dev/null 2>&1

echo "==> Allow the deploy user to restart only this service"
cat > /etc/sudoers.d/deeznote <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart deeznote-api, /usr/bin/systemctl status deeznote-api
EOF
chmod 440 /etc/sudoers.d/deeznote
visudo -cf /etc/sudoers.d/deeznote >/dev/null

cat <<EOF

Done. Server is ready for the first deploy.

Next, give Caddy (in /opt/exam) access to DeezNote — see DEPLOY.md step 3:
  - mount /srv/deeznote into the caddy service (read-only)
  - add this site to /opt/exam/Caddyfile:

$DOMAIN {
	encode zstd gzip

	handle_path /api/* {
		reverse_proxy $DOCKER_HOST_IP:$API_PORT
	}

	handle {
		root * $APP_DIR/current/web
		try_files {path} /index.html
		file_server
	}
}
EOF
