# Deploying DeezNote

DeezNote runs as a Docker Compose project on a VPS managed by [Dokploy](https://dokploy.com). Dokploy builds
`docker-compose.yml` from `main` on every push; GitHub Actions only typechecks, tests and builds.

```
internet → Traefik (Dokploy, HTTPS) → web (Caddy: PWA + /api proxy) → api (Bun, SQLite in volume `db`)
                                                                     backup (daily snapshot of `db`)
```

| Service | What it does | Volume |
|---|---|---|
| `web` | Serves the built PWA, proxies `/api/*` to `api`, writes access logs (kept 100 days) | `logs` → `/logs` |
| `api` | The API. Not published to the internet; only `web` can reach it | `db` → `/data` |
| `backup` | Snapshots the database once a day, keeps 7 days (`deploy/backup.sh`) | `db`, `backups` → `/backups` |

## One-time setup

1. Dokploy → **Create Project** → **Compose**. Provider: GitHub, this repo, branch `main`, compose path `./docker-compose.yml`.
2. **Environment**: `SITE_URL=https://your.domain` (no trailing slash). It sets the API's allowed origin and the
   link-preview URLs in the web build.
3. **Domains**: add the domain on service `web`, port `80`, HTTPS on (Let's Encrypt). Point the domain's DNS A record
   at the VPS first.
4. **Deploy**, then turn on **Auto Deploy**. Leave **Isolated Deployments** off: `docker-compose.yml` already joins
   `web` to `dokploy-network` itself.

Leave Traefik's access logs ("Requests" in Dokploy) off: Caddy already logs every request.

### Client IPs

Rate limits are per client IP, so the chain must pass the real one through:

- Traefik sets `X-Forwarded-For` to the client's address.
- Caddy trusts private-range peers only (`trusted_proxies private_ranges`, strict, right to left) and sends just the
  resolved client IP to the API.
- The API trusts `X-Forwarded-For` only from `172.16.0.0/12` (`API_TRUSTED_PROXY_IPS` in `docker-compose.yml`), the
  project's private Docker network. Keep `api` unpublished: never add `ports:` to it.

After deploying, check from two networks that you get separate rate buckets and that a spoofed `X-Forwarded-For` does
not change yours.

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

## Day to day

Run these on the VPS. Dokploy names containers `<project>-<service>-1`; `docker ps` shows them.

| Task | Command |
|---|---|
| API logs | `docker logs -f <api container>` (or the Logs tab in Dokploy) |
| Access logs | `docker exec <web container> tail -f /logs/access.log` |
| List backups | `docker exec <backup container> ls -lh /backups` |
| Back up now | restart the `backup` service: it snapshots on start |
| Give an account Pro (until payments exist) | `docker exec <backup container> sqlite3 /data/deeznote.db "UPDATE users SET plan = 'pro' WHERE email = 'someone@example.com';"` (and `'free'` to undo) |
| Change plan limits | Add `FREE_NOTE_BYTES`, `FREE_TOTAL_BYTES`, `PRO_NOTE_BYTES`, `PRO_TOTAL_BYTES` to `api`'s environment, redeploy. |
| Roll back | Dokploy → Deployments → redeploy an earlier commit |

Backups live on the same VPS: they protect against bad migrations, corruption and mistakes, not against losing the
server. Restore: stop `api`, replace `/data/deeznote.db` with `gunzip -c /backups/deeznote-YYYYMMDD-HHMMSS.db.gz`,
delete `deeznote.db-wal` and `deeznote.db-shm`, `chown 1000:1000 /data/deeznote.db`, start `api`.

Rollbacks switch the code, not the database. Migrations only ever add to the schema, so an older release keeps working
against a newer database as long as migrations stay additive (add columns or tables; don't rename or drop them).
