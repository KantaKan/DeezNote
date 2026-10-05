# DeezNote: notes for agents

End-to-end encrypted Markdown notes. Bun monorepo: `apps/web` (React + Vite PWA), `apps/api` (Bun + Elysia + SQLite via Drizzle), `packages/shared` (types). Deploys to a 1 GB droplet; see DEPLOY.md.

## Keep the Privacy Policy and Terms true

`/privacy` and `/terms` (`apps/web/src/legal/content.tsx`, English and Thai) describe exactly what DeezNote collects, stores, logs, shares and how long it keeps it. They must stay true after every change.

- Any change to what data is collected, stored, sent, logged, retained or shared (schema, routes, services, API client, crypto, local storage, server or Caddy config, new third-party services, backups) needs the legal pages updated in **both languages** in the same change, with `LAST_UPDATED` in `apps/web/src/legal/policy.ts` set to the date.
- `apps/web/src/legal/policy.test.ts` fails whenever a file in `POLICY_SENSITIVE_PATHS` changes. Don't just paste the new fingerprint: re-read both pages against the change, fix them, then set `REVIEWED_FINGERPRINT` (`bun run policy:fingerprint` prints it). Add new data-handling files to `POLICY_SENSITIVE_PATHS`.
- Caddy (access logs, kept 100 days) is configured in the separate exam repo, so the test can't see it: if you change logging there, update the pages here by hand.

## Other rules

- Never build a production release from a dirty working tree: build from a clean checkout of the pushed commit (see DEPLOY.md). Other agents may have uncommitted work here.
- Never put em-dashes in user-facing copy.
- `bun test` runs every suite; `bun run --cwd apps/web typecheck` and `bun run --cwd apps/api typecheck` must pass.
