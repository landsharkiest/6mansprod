#!/bin/bash
# Deploy or update the 6mansdle API on the EC2 host. Run as root (via SSM or sudo).
# Idempotent: first run clones and installs; later runs pull and restart.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/landsharkiest/6mansprod.git}"
BRANCH="${BRANCH:-master}"
APP_DIR=/opt/6mansdle/app
REPO_DIR=$APP_DIR/repo
APP_USER=sixmansdle

[ -f "$APP_DIR/.env" ] || { echo "missing $APP_DIR/.env (run db-setup first)"; exit 1; }

if [ ! -d "$REPO_DIR/.git" ]; then
  sudo -u $APP_USER git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$REPO_DIR"
else
  sudo -u $APP_USER git -C "$REPO_DIR" fetch --depth 1 origin "$BRANCH"
  sudo -u $APP_USER git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
fi
echo "at $(git -C "$REPO_DIR" rev-parse --short HEAD)"

# Only the API and shared packages are needed on the host; skip the web app's deps.
sudo -u $APP_USER bash -c "cd '$REPO_DIR' && npm ci --omit=dev --workspace apps/api --workspace packages/shared --include-workspace-root --no-audit --no-fund"

install -m 644 "$REPO_DIR/infra/6mansdle-api.service" /etc/systemd/system/6mansdle-api.service
install -m 644 "$REPO_DIR/infra/nginx-backend.conf" /etc/nginx/conf.d/6mansdle-backend.conf
nginx -t
systemctl daemon-reload
systemctl enable 6mansdle-api >/dev/null
systemctl restart 6mansdle-api
systemctl reload nginx

for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    echo "health: $(curl -fsS http://127.0.0.1:3001/api/health)"; exit 0
  fi
  sleep 2
done
echo "API did not become healthy; recent log:"
journalctl -u 6mansdle-api -n 40 --no-pager
exit 1
