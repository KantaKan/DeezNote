#!/usr/bin/env bash
# Runs on the droplet (as the deeznote user) after a release is unpacked into releases/<commit>/.
# Switches `current` to the new release, restarts the API, health-checks it, and rolls back on failure.
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/deeznote}"
SYSTEMCTL="${SYSTEMCTL:-sudo /usr/bin/systemctl}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
HEALTH_URL="${HEALTH_URL:-$(cat "$APP_DIR/health-url")}"

NEW_RELEASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PREVIOUS_RELEASE="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"

point_current_at() {
  # Build the new link beside the old one, then rename over it: the switch is atomic.
  ln -sfn "$1" "$APP_DIR/current.next"
  mv -Tf "$APP_DIR/current.next" "$APP_DIR/current"
}

healthy() {
  for _ in $(seq 1 20); do
    curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

echo "==> Activating $(basename "$NEW_RELEASE")"
# Unpacking keeps the archive's timestamps; stamp the deploy time so "newest releases" pruning is correct.
touch "$NEW_RELEASE"
point_current_at "$NEW_RELEASE"
$SYSTEMCTL restart deeznote-api

if healthy; then
  echo "==> Healthy at $HEALTH_URL"
else
  echo "!!  Health check failed for $(basename "$NEW_RELEASE")" >&2
  if [[ -n "$PREVIOUS_RELEASE" && "$PREVIOUS_RELEASE" != "$NEW_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    echo "!!  Rolling back to $(basename "$PREVIOUS_RELEASE")" >&2
    point_current_at "$PREVIOUS_RELEASE"
    $SYSTEMCTL restart deeznote-api
    healthy && echo "!!  Rollback is healthy" >&2 || echo "!!  Rollback is ALSO unhealthy, check: journalctl -u deeznote-api" >&2
  fi
  exit 1
fi

echo "==> Keeping the newest $KEEP_RELEASES releases"
ACTIVE="$(readlink -f "$APP_DIR/current")"
ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +"$((KEEP_RELEASES + 1))" | while read -r old; do
  old="${old%/}"
  [[ "$(readlink -f "$old")" == "$ACTIVE" ]] || rm -rf "$old"
done
