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
prints the Caddy site block for step 3. Safe to re-run. The optional third argument is a comma-separated
allowlist of Caddy's internal source IPs (see **Security configuration** below); re-running without it resets
that generated service setting to trust no proxy.

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
		header {
			X-Content-Type-Options nosniff
			Referrer-Policy no-referrer
			X-Frame-Options DENY
			Permissions-Policy "camera=(), microphone=(), geolocation=()"
			Content-Security-Policy "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
		}
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

## Security configuration

The API now enforces these defaults (adjust environment variables only after considering server capacity):

| Control | Default | Environment variable |
|---|---|---|
| All requests per client IP | 120/minute | `API_REQUESTS_PER_MINUTE` |
| Login + registration attempts per client IP | 10/minute | `API_AUTH_PER_MINUTE` |
| Registration attempts per client IP | 5/hour | `API_REGISTRATIONS_PER_HOUR` |
| Login attempts per normalized email | 20/15 minutes | `API_LOGINS_PER_ACCOUNT_WINDOW` |
| Simultaneous password hashes/verifications | 2 | `API_MAX_CONCURRENT_HASHES` |
| Request body | 8 MiB | `API_MAX_BODY_BYTES` |
| Auth and vault request body | 4 KiB (or the lower general cap) | `API_MAX_AUTH_BODY_BYTES` |
| Aggregate request headers | 16 KiB | `API_MAX_HEADER_BYTES` |
| Individual header value | 8 KiB | `API_MAX_HEADER_VALUE_BYTES` |
| Active limiter keys | 10,000 | `API_MAX_RATE_LIMIT_KEYS` |
| Note saves + deletions per authenticated account | 90/minute | `API_NOTE_WRITES_PER_MINUTE` |
| Note-upload request bytes per authenticated account | 20 MiB/minute | `API_NOTE_UPLOAD_BYTES_PER_MINUTE` |
| Stored notes per account (Free and Pro) | 1,000 | `API_MAX_NOTES_PER_ACCOUNT` |

Requests exceeding rates receive `429` and `Retry-After`; exhausted hashing capacity returns `503` and
`Retry-After`. Limits count attempts, including successful logins. Windows expire without blocked requests
extending them. Shared NAT addresses share an IP allowance. Rate state is bounded, in memory, per process,
and resets on restart. At key capacity, new keys are temporarily rejected rather than evicting active limits.
Use a shared limiter/edge protection before scaling to multiple API processes. This is not volumetric DDoS protection.

Bodies are checked against declared length and actual streamed bytes before JSON parsing. Compressed request
bodies and non-JSON bodies are not supported. URLs are capped at 2,048 bytes. Header checks happen after the HTTP
server parses headers; transport-level header limits and slow-client protection remain Bun/Caddy's responsibility.
Per-account note budgets use the authenticated user ID, so changing IP or session does not reset them.
Valid-schema save/delete attempts consume the write budget even if they later conflict or fail a quota check.
Upload budgets count actual UTF-8 JSON stream bytes, including metadata and unknown fields, without trusting
`Content-Length`. Account limits are checked after authentication/parsing; the IP/body protections still
apply before then. Fixed windows can permit bursts near a window boundary.

Existing Free/Pro ciphertext storage quotas remain in force, now checked atomically with each save using
an IMMEDIATE SQLite transaction. Stored ciphertext is measured in UTF-8 bytes, not Unicode characters;
updates replace the old note's usage rather than adding a second copy. Envelope fields are bounded
(128 characters for the encrypted note key; 64 each for the nonces) to prevent hiding large payloads
outside the ciphertext quota. They are not full cryptographic validation. Note-count and storage
violations return `413` with a machine-readable error code; note replacements at the count limit and
deletions are allowed. Physical database size, logs and SQLite overhead are not included in plan quotas.
Changing these defaults requires updating the published Terms in both languages to match.

### Configure Caddy trust before public launch

By default, `X-Forwarded-For` and `X-Real-IP` are ignored. With a reverse proxy this means clients share the
proxy's IP allowance until you configure `API_TRUSTED_PROXY_IPS` with **Caddy's socket-peer IPs or their range**.
The API bind address (`172.17.0.1`) is usually NOT Caddy's source IP.

The setup script defaults to `172.16.0.0/12` (Docker's private range). That survives Caddy being recreated with a
new container IP, and is safe here because the API listens only on the Docker bridge and ufw admits only Docker
networks to its port. To pin an exact IP instead, find Caddy's address:

```bash
docker inspect exam-prod-caddy-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{"\\n"}}{{end}}'
```

and supply it as the setup script's third argument, or add a systemd override with `sudo systemctl edit deeznote-api`:

```ini
[Service]
Environment="API_TRUSTED_PROXY_IPS=172.16.0.0/12"
```

After changing it, run `sudo systemctl daemon-reload` and
`sudo systemctl restart deeznote-api`. For allowlisted peers only, the API uses the rightmost valid
`X-Forwarded-For` IP appended by Caddy. Keep Caddy's default behavior of rebuilding/appending this header;
do not configure it to pass through a client-supplied value unchanged. Additional upstream proxies require
reviewing the trust chain before changing this policy. Keep the API bound privately and firewall access
restricted to the proxy. With an exact IP, update the allowlist whenever Caddy's IP changes.

Apply the web security-header block in step 3 to an existing Caddy site too; deploying the API alone does not
change Caddy configuration. The web CSP above blocks framing, objects, and foreign base URLs, but is NOT a strict
script-policy/XSS defense. The API separately returns `no-store`, `nosniff`, `no-referrer`, and a restrictive CSP
for its JSON responses. HTTPS/HSTS policy is managed at the proxy, not by an HTTP-only internal API.

After deployment, verify headers and rate responses through Caddy in a controlled test, and confirm that different
clients get different rate buckets and spoofed forwarded headers do not bypass limits.

## Day to day

| Task | Command (on the droplet) |
|---|---|
| API logs | `journalctl -u deeznote-api -f` |
| API status / memory | `systemctl status deeznote-api` |
| Which release is live | `readlink /srv/deeznote/current` |
| Roll back by hand | `ln -sfn /srv/deeznote/releases/<older-sha> /srv/deeznote/current && systemctl restart deeznote-api` |
| `/api` returns 502 | Caddy can't reach the API. With ufw on, it needs: `ufw allow proto tcp from 172.16.0.0/12 to 172.17.0.1 port 3100` (the setup script adds this) |
| Give an account Pro (until payments exist) | `sudo -u deeznote sqlite3 /var/lib/deeznote/deeznote.db "UPDATE users SET plan = 'pro' WHERE email = 'someone@example.com';"` (and `'free'` to undo) |
| Change plan limits | Set `FREE_NOTE_BYTES`, `FREE_TOTAL_BYTES`, `PRO_NOTE_BYTES`, `PRO_TOTAL_BYTES` with `sudo systemctl edit deeznote-api`, then restart. Update the numbers in the Terms (`apps/web/src/legal/content.tsx`) to match. |
| Back up the database | `sqlite3 /var/lib/deeznote/deeznote.db ".backup /root/deeznote-$(date +%F).db"` |

Rollbacks switch the code, not the database. Migrations only ever add to the schema, so an older release keeps working
against a newer database as long as migrations stay additive (add columns or tables; don't rename or drop them).
