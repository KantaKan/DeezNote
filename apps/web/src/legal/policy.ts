// Single source of truth for the Privacy Policy and Terms "last updated" date.
//
// REVIEWED_FINGERPRINT is a hash of every file that decides what data DeezNote collects, stores, logs or
// shares (see POLICY_SENSITIVE_PATHS). policy.test.ts fails when any of them changes, until someone has
// re-read /privacy and /terms, updated them if needed, bumped LAST_UPDATED and pasted the new fingerprint.
export const LAST_UPDATED = "2026-10-06";
export const REVIEWED_FINGERPRINT = "d2a28ff585c5077f";

export const REPO_URL = "https://github.com/KantaKan/DeezNote";
export const ISSUES_URL = `${REPO_URL}/issues`;

/** Repo-relative files (or folders) whose changes can make the legal pages wrong. */
export const POLICY_SENSITIVE_PATHS = [
  "apps/api/src/db/schema.ts",
  "apps/api/drizzle",
  "apps/api/src/config.ts",
  "apps/api/src/app.ts",
  "apps/api/src/routes",
  "apps/api/src/services",
  "apps/web/src/lib/api.ts",
  "apps/web/src/lib/crypto.ts",
  "apps/web/src/lib/db.ts",
  "apps/web/index.html",
  "packages/shared/src/index.ts",
  "deploy/setup-server.sh",
  "deploy/install-backups.sh",
];
