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
GIT_SHA=$(sudo -u $APP_USER git -C "$REPO_DIR" rev-parse HEAD)
echo "at ${GIT_SHA:0:7}"

# Read by the systemd unit (EnvironmentFile=-, so it's optional) to expose the deployed commit
# at GET /api/version. Plain KEY=VALUE, no export/quoting — same format as the main .env.
echo "GIT_SHA=$GIT_SHA" > "$APP_DIR/version"
chown $APP_USER:$APP_USER "$APP_DIR/version"
chmod 644 "$APP_DIR/version"

# Only workspaces actually run on the host get installed; skip the web app's deps. The bot
# workspace is only installed once its env file exists (see the bot block below) — installing it
# unconditionally would be harmless but wasteful before the site owner has configured the bot.
NPM_WORKSPACES="--workspace apps/api --workspace packages/shared"
BOT_ENABLED=false
if [ -f "$APP_DIR/bot.env" ]; then
  BOT_ENABLED=true
  NPM_WORKSPACES="$NPM_WORKSPACES --workspace apps/bot"
fi
sudo -u $APP_USER bash -c "cd '$REPO_DIR' && npm ci --omit=dev $NPM_WORKSPACES --include-workspace-root --no-audit --no-fund"

install -m 644 "$REPO_DIR/infra/6mansdle-api.service" /etc/systemd/system/6mansdle-api.service
# certbot rewrites this file to add TLS, so only seed it on first deploy.
if [ ! -f /etc/nginx/conf.d/6mansdle-backend.conf ]; then
  install -m 644 "$REPO_DIR/infra/nginx-backend.conf" /etc/nginx/conf.d/6mansdle-backend.conf
fi
nginx -t
systemctl daemon-reload
systemctl enable 6mansdle-api >/dev/null
systemctl restart 6mansdle-api
systemctl reload nginx

# The bot unit only goes in once /opt/6mansdle/app/bot.env exists, so a plain deploy stays safe
# (and this script idempotent) before the site owner has created a bot application and dropped
# its token in. See the README's "Discord bot" section for the one-time setup.
if [ "$BOT_ENABLED" = true ]; then
  echo "bot.env present — installing/restarting 6mansdle-bot"
  install -m 644 "$REPO_DIR/infra/6mansdle-bot.service" /etc/systemd/system/6mansdle-bot.service
  systemctl daemon-reload
  systemctl enable 6mansdle-bot >/dev/null
  systemctl restart 6mansdle-bot
else
  echo "no $APP_DIR/bot.env — skipping the Discord bot (see README: Discord bot)"
fi

for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    echo "health: $(curl -fsS http://127.0.0.1:3001/api/health)"; break
  fi
  sleep 2
  if [ "$i" = 20 ]; then
    echo "API did not become healthy; recent log:"
    journalctl -u 6mansdle-api -n 40 --no-pager
    exit 1
  fi
done

if [ "$BOT_ENABLED" = true ] && ! systemctl is-active --quiet 6mansdle-bot; then
  echo "6mansdle-bot did not stay up; recent log:"
  journalctl -u 6mansdle-bot -n 40 --no-pager
  exit 1
fi
