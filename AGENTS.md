# DeezNote: notes for agents

End-to-end encrypted Markdown notes. Bun monorepo: `apps/web` (React + Vite PWA), `apps/api` (Bun + Elysia + SQLite via Drizzle), `packages/shared` (types). Deploys with Docker Compose on a Dokploy VPS; see DEPLOY.md.

## Talk to the user in caveman style (always on)

Use the **caveman** skill (github.com/JuliusBrussee/caveman, installed globally in `~/.agents/skills/caveman`, linked into `~/.claude/skills`) for every chat reply in this repo, from the first message, until the user says "stop caveman" or "normal mode".

No skill available? Same idea by hand: answer first, short sentences, no filler; keep numbers, negations, paths, commands, code and errors exact; full sentences for security, irreversible actions and decisions; reply in the user's language.

**Chat replies only.** App UI copy, the landing page, code, comments, commits, PRs and docs stay clear, complete prose.

## Other rules

- Production is built by Dokploy from the pushed `main` commit: never deploy from a dirty working tree. Other agents may have uncommitted work here.
- Never put em-dashes in user-facing copy.
- `bun test` runs every suite; `bun run --cwd apps/web typecheck` and `bun run --cwd apps/api typecheck` must pass.
