import { describe, expect, test } from "bun:test";
import { policyFingerprint } from "./fingerprint";
import { LAST_UPDATED, REVIEWED_FINGERPRINT } from "./policy";

describe("privacy policy and terms", () => {
  test("were reviewed after the last change to data-handling code", () => {
    const { fingerprint, files } = policyFingerprint();
    if (fingerprint !== REVIEWED_FINGERPRINT) {
      throw new Error([
        "Data-handling code changed since the Privacy Policy and Terms were last reviewed.",
        `Watched files (${files.length}) are listed in POLICY_SENSITIVE_PATHS in apps/web/src/legal/policy.ts.`,
        "1. Re-read /privacy and /terms (apps/web/src/legal/content.tsx, English AND Thai) against the change.",
        "2. Update both languages if what is collected, stored, logged, shared or retained changed.",
        "3. Set LAST_UPDATED to today if the pages changed.",
        `4. Set REVIEWED_FINGERPRINT to "${fingerprint}" in apps/web/src/legal/policy.ts.`,
      ].join("\n"));
    }
  });

  test("LAST_UPDATED is a real date", () => {
    expect(LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(LAST_UPDATED))).toBe(false);
  });
});
