# DeezNote

A local-first, end-to-end encrypted Markdown notes app. Encryption happens in the browser; the API stores only ciphertext.

## Stack

- Bun + Elysia API
- React + Vite web app
- SQLite (Bun's built-in driver, WAL mode) + Drizzle ORM
- Dexie/IndexedDB offline cache
- libsodium Argon2id + XChaCha20-Poly1305
- MinIO locally for the upcoming encrypted attachment flow

## Run locally

Requires Bun. The database is a single SQLite file, created and migrated automatically when the API starts.

```bash
cp .env.example .env
bun install
bun run dev
```

After changing `apps/api/src/db/schema.ts`, run `bun run db:generate` to add a migration.
`docker compose up -d` is only needed for MinIO (the upcoming attachment flow).

Open http://localhost:5173. The API listens on http://localhost:3000.

## Deploy

Pushes to `main` build in GitHub Actions and deploy to the droplet over SSH, with automatic rollback. See [DEPLOY.md](DEPLOY.md).

## Tests

```bash
npm test
npm run test:watch
```

The Bun test suite covers API boundaries, vault encryption, note encryption, embedded image confidentiality, strict note passwords, incorrect-password rejection, and legacy note compatibility.

## Security model

The account password is sent to the API over HTTPS for authentication. The separate vault passphrase never leaves the browser. It derives a key with Argon2id, which unwraps a random vault key. Notes use independent random keys wrapped by that vault key.

Losing the vault passphrase means losing access to the notes. This is an early-stage personal project and has not received a security audit.
