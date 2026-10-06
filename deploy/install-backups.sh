#!/usr/bin/env bash
# Installs daily database backups for DeezNote. Run once as root, from your machine:
#
#   ssh root@SERVER 'bash -s' < deploy/install-backups.sh
#
# What it does: every night a systemd timer takes a consistent SQLite snapshot (safe while the API
# is running), checks it with PRAGMA integrity_check, gzips it into /var/backups/deeznote and deletes
# snapshots older than KEEP_DAYS. The Privacy Policy states this retention; change both together.
#
# These copies live on the same server: they protect against bad migrations, corruption and mistakes,
# not against losing the server itself. Copy them off the server for that.
#
# Restore (stops the API, keeps the current database aside, then swaps in a snapshot):
#   systemctl stop deeznote-api
#   mv /var/lib/deeznote/deeznote.db /var/lib/deeznote/deeznote.db.before-restore
#   rm -f /var/lib/deeznote/deeznote.db-wal /var/lib/deeznote/deeznote.db-shm
#   gunzip -c /var/backups/deeznote/deeznote-YYYYMMDD-HHMMSS.db.gz > /var/lib/deeznote/deeznote.db
#   chown deeznote:deeznote /var/lib/deeznote/deeznote.db && chmod 600 /var/lib/deeznote/deeznote.db
#   systemctl start deeznote-api
set -euo pipefail

KEEP_DAYS=14
SERVICE_USER=deeznote
DATABASE=/var/lib/deeznote/deeznote.db
BACKUP_DIR=/var/backups/deeznote

[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
command -v sqlite3 >/dev/null || apt-get install -y -qq sqlite3 >/dev/null
[[ -f $DATABASE ]] || { echo "No database at $DATABASE." >&2; exit 1; }

install -d -m 700 -o "$SERVICE_USER" -g "$SERVICE_USER" "$BACKUP_DIR"

cat > /usr/local/bin/deeznote-backup <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
umask 077
stamp=\$(date -u +%Y%m%d-%H%M%S)
tmp="$BACKUP_DIR/.deeznote-\$stamp.db"
trap 'rm -f "\$tmp"' EXIT
sqlite3 "$DATABASE" ".timeout 10000" ".backup '\$tmp'"
result=\$(sqlite3 "\$tmp" "PRAGMA integrity_check;")
[[ \$result == ok ]] || { echo "integrity check failed: \$result" >&2; exit 1; }
gzip -9 -c "\$tmp" > "$BACKUP_DIR/deeznote-\$stamp.db.gz.part"
mv "$BACKUP_DIR/deeznote-\$stamp.db.gz.part" "$BACKUP_DIR/deeznote-\$stamp.db.gz"
find "$BACKUP_DIR" -name 'deeznote-*.db.gz' -mtime +$((KEEP_DAYS - 1)) -delete
echo "backup ok: deeznote-\$stamp.db.gz (\$(du -h "$BACKUP_DIR/deeznote-\$stamp.db.gz" | cut -f1))"
SCRIPT
chmod 755 /usr/local/bin/deeznote-backup

cat > /etc/systemd/system/deeznote-backup.service <<UNIT
[Unit]
Description=DeezNote database backup

[Service]
Type=oneshot
User=$SERVICE_USER
ExecStart=/usr/local/bin/deeznote-backup
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=$BACKUP_DIR /var/lib/deeznote
UNIT

cat > /etc/systemd/system/deeznote-backup.timer <<UNIT
[Unit]
Description=Daily DeezNote database backup

[Timer]
OnCalendar=*-*-* 20:30:00 UTC
RandomizedDelaySec=15min
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now deeznote-backup.timer
systemctl start deeznote-backup.service
journalctl -u deeznote-backup.service -n 1 --no-pager -o cat
systemctl list-timers deeznote-backup.timer --no-pager | head -2
