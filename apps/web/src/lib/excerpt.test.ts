import { describe, expect, test } from "bun:test";
import { noteExcerpt } from "./excerpt";

describe("note excerpts", () => {
  test("replace photos, drop Markdown symbols and collapse whitespace", () => {
    expect(noteExcerpt("# Trip\n\n![0.5](data:image/png;base64,AAAA) **bold** `code`\n![]()", 80)).toBe("Trip Photo bold code");
    expect(noteExcerpt("a".repeat(100), 10)).toHaveLength(10);
  });
});
