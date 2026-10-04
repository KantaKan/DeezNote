# DeezNote

A local-first, end-to-end encrypted Markdown notes app. Encryption happens in the browser; the API stores only ciphertext.

## Stack

- Bun + Elysia API
- React + Vite web app
- PostgreSQL + Drizzle ORM
- Dexie/IndexedDB offline cache
- libsodium Argon2id + XChaCha20-Poly1305
- MinIO locally for the upcoming encrypted attachment flow

## Run locally

Requires Bun and Docker.

```bash
cp .env.example .env
docker compose up -d
bun install
bun run db:migrate
bun run dev
```

Open http://localhost:5173. The API listens on http://localhost:3000.

## Tests

```bash
npm test
npm run test:watch
```

The Bun test suite covers API boundaries, vault encryption, note encryption, embedded image confidentiality, strict note passwords, incorrect-password rejection, and legacy note compatibility.

## Security model

The account password is sent to the API over HTTPS for authentication. The separate vault passphrase never leaves the browser. It derives a key with Argon2id, which unwraps a random vault key. Notes use independent random keys wrapped by that vault key.

Losing the vault passphrase means losing access to the notes. This is an early-stage personal project and has not received a security audit.
