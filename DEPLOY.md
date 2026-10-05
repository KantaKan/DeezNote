# Deploying DeezNote

Every push to `main` builds and tests the app in GitHub Actions, then ships it to the droplet:

```
push to main → typecheck + tests + build (GitHub) → upload release over SSH
            → switch /srv/deeznote/current → restart API → health check
            → unhealthy? automatic rollback to the previous release
```

Nothing is built on the droplet. The API runs as the `deeznote-api` systemd service (Bun, ~40–60 MB, capped at 256 MB),
bound to Docker's bridge IP so only the Caddy container can reach it. The database is one SQLite file in `/var/lib/deeznote`.

Address used below: `deeznote.103-253-146-20.sslip.io` (free, points at the droplet's IP). To use a real domain later,
change that one line in the Caddyfile and the `WEB_ORIGIN` line in the service (re-run the setup script with the new domain).

## One-time setup

### 1. Create a deploy key (on your Mac)

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deeznote_deploy -N "" -C deeznote-deploy
cat ~/.ssh/deeznote_deploy.pub     # public half: goes on the droplet (step 2)
```

The private half (`~/.ssh/deeznote_deploy`) goes into GitHub (step 4). It only grants access to the `deeznote` user,
which can restart the DeezNote API and nothing else.

### 2. Prepare the droplet (as root)

```bash
scp deploy/setup-server.sh root@103.253.146.20:/root/
ssh root@103.253.146.20
bash /root/setup-server.sh deeznote.103-253-146-20.sslip.io "PASTE THE .pub LINE FROM STEP 1"
```

It installs Bun, creates the `deeznote` user, `/srv/deeznote`, `/var/lib/deeznote` and the `deeznote-api` service, and
prints the Caddy site block for step 3. Safe to re-run.

### 3. Let your existing Caddy serve DeezNote

Caddy runs in the `/opt/exam` compose project. Two changes, then one restart of the Caddy container
(the exam site blips for a few seconds).

First check which compose file and project name it uses, so you edit the right file and don't create a second project:

```bash
docker inspect exam-prod-caddy-1 --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}'
```

**a) Mount the app into the Caddy container.** In that compose file, under the `caddy` service's `volumes:`, add:

```yaml
      - /srv/deeznote:/srv/deeznote:ro
```

**b) Add the site.** Back up first, then append the block the setup script printed:

```bash
cp /opt/exam/Caddyfile /opt/exam/Caddyfile.bak
cat >> /opt/exam/Caddyfile <<'EOF'

deeznote.103-253-146-20.sslip.io {
	encode zstd gzip

	handle_path /api/* {
		reverse_proxy 172.17.0.1:3100
	}

	handle {
		root * /srv/deeznote/current/web
		try_files {path} /index.html
		file_server
	}
}
EOF
```

Use the IP the setup script printed if it isn't `172.17.0.1`. Append with `cat >>` (or `nano`), not `sed -i` or `vim`:
the Caddyfile is mounted as a single file, and editors that replace the file leave the container reading the old one.

**c) Check, then apply:**

```bash
docker run --rm -v /opt/exam/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
cd /opt/exam && docker compose -p exam-prod up -d caddy
```

If anything goes wrong: `cp /opt/exam/Caddyfile.bak /opt/exam/Caddyfile`, remove the volume line, run the same `up -d caddy`.

### 4. Add the GitHub secrets

GitHub → the repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | `103.253.146.20` |
| `DEPLOY_SSH_KEY` | the whole private key: `cat ~/.ssh/deeznote_deploy` (including the BEGIN/END lines) |
| `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 103.253.146.20` (run on your Mac) |

`DEPLOY_KNOWN_HOSTS` stops a fake server from receiving your deploys. To double-check it, compare the fingerprint of
`ssh-keyscan -t ed25519 103.253.146.20 | ssh-keygen -lf -` (Mac) with `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` (droplet).

### 5. Deploy

Push to `main` (or **Actions → Build and deploy → Run workflow**). When it's green, open
https://deeznote.103-253-146-20.sslip.io. The first visit can take a few seconds while Caddy gets the HTTPS certificate.

## Day to day

| Task | Command (on the droplet) |
|---|---|
| API logs | `journalctl -u deeznote-api -f` |
| API status / memory | `systemctl status deeznote-api` |
| Which release is live | `readlink /srv/deeznote/current` |
| Roll back by hand | `ln -sfn /srv/deeznote/releases/<older-sha> /srv/deeznote/current && systemctl restart deeznote-api` |
| Back up the database | `sqlite3 /var/lib/deeznote/deeznote.db ".backup /root/deeznote-$(date +%F).db"` |

Rollbacks switch the code, not the database. Migrations only ever add to the schema, so an older release keeps working
against a newer database as long as migrations stay additive (add columns or tables; don't rename or drop them).
