// Hashes every file in POLICY_SENSITIVE_PATHS. Run `bun run policy:fingerprint` after reviewing the legal pages.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { POLICY_SENSITIVE_PATHS } from "./policy";

export const REPO_ROOT = resolve(import.meta.dir, "../../../..");

function filesUnder(path: string): string[] {
  const absolute = join(REPO_ROOT, path);
  if (!statSync(absolute).isDirectory()) return [path];
  return readdirSync(absolute).sort().flatMap((name) => filesUnder(join(path, name)));
}

export function policyFingerprint() {
  const hash = createHash("sha256");
  const files = POLICY_SENSITIVE_PATHS.flatMap(filesUnder).filter((file) => !/\.test\.ts$/.test(file)).sort();
  for (const file of files) {
    // Normalise line endings so the fingerprint doesn't depend on the checkout platform.
    hash.update(`${relative(REPO_ROOT, join(REPO_ROOT, file))}\n${readFileSync(join(REPO_ROOT, file), "utf8").replace(/\r\n/g, "\n")}\n`);
  }
  return { fingerprint: hash.digest("hex").slice(0, 16), files };
}

if (import.meta.main) {
  const { fingerprint, files } = policyFingerprint();
  console.log(`${fingerprint}  (${files.length} files)`);
}
