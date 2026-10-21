#!/bin/sh
# Daily database backups for the Dokploy setup (the `backup` service in docker-compose.yml). Takes a
# consistent SQLite snapshot (safe while the API runs), checks it, gzips it into /backups and deletes
# snapshots older than KEEP_DAYS.
#
# These copies live on the same server: they protect against bad migrations, corruption and mistakes,
# not against losing the server. Restore: stop `api`, then in the db volume replace deeznote.db with
# `gunzip -c deeznote-YYYYMMDD-HHMMSS.db.gz`, delete deeznote.db-wal and -shm, `chown 1000:1000` it, start `api`.
set -eu
KEEP_DAYS=7
DATABASE=/data/deeznote.db
umask 077

backup() {
  [ -f "$DATABASE" ] || { echo "no database yet"; return; }
  stamp=$(date -u +%Y%m%d-%H%M%S)
  tmp="/backups/.deeznote-$stamp.db"
  sqlite3 "$DATABASE" ".timeout 10000" ".backup '$tmp'"
  result=$(sqlite3 "$tmp" "PRAGMA integrity_check;")
  if [ "$result" != ok ]; then echo "integrity check failed: $result" >&2; rm -f "$tmp"; return 1; fi
  gzip -9 -c "$tmp" > "/backups/deeznote-$stamp.db.gz.part" && rm -f "$tmp"
  mv "/backups/deeznote-$stamp.db.gz.part" "/backups/deeznote-$stamp.db.gz"
  find /backups -name 'deeznote-*.db.gz' -mtime +$((KEEP_DAYS - 1)) -delete
  echo "backup ok: deeznote-$stamp.db.gz"
}

# ponytail: every 24h from container start, not a fixed clock time; a restart takes an extra snapshot.
while true; do backup || true; sleep 86400; done
