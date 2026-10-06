import { describe, expect, test } from "bun:test";
import { strFromU8, unzipSync } from "fflate";
import { buildExportFiles, buildExportZip, safeFileName } from "./export";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const note = (title: string, markdown = "", extra: object = {}) => ({ document: { title, markdown, tags: [], ...extra }, updatedAt: "2026-10-06T00:00:00.000Z" });

describe("note export", () => {
  test("makes file names safe on every platform", () => {
    expect(safeFileName('a/b\\c:d*e?"f<g>h|i')).toBe("a b c d e f g h i");
    expect(safeFileName("  ")).toBe("Untitled");
    expect(safeFileName("..hidden")).toBe("hidden");
    expect(safeFileName("x".repeat(300))).toHaveLength(100);
  });

  test("writes front matter and keeps duplicate titles apart", () => {
    const files = buildExportFiles([note("Trip", "# Hi", { tags: ["travel"], favorite: true, color: "yellow" }), note("trip"), note("")]);
    expect(Object.keys(files).sort()).toEqual(["Trip.md", "Untitled.md", "trip (2).md"]);
    expect(strFromU8(files["Trip.md"])).toBe('---\ntitle: "Trip"\ntags: ["travel"]\nfavorite: true\ncolor: "yellow"\nupdated: "2026-10-06T00:00:00.000Z"\n---\n# Hi');
  });

  test("moves photos into attachments and links them", () => {
    const files = buildExportFiles([note("Skye", `Look ![0.62](data:image/png;base64,${PNG}) and ![](data:image/png;base64,${PNG})`)]);
    expect(strFromU8(files["Skye.md"])).toEndWith("Look ![0.62](attachments/Skye%201.png) and ![](attachments/Skye%202.png)");
    expect(files["attachments/Skye 1.png"].slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  test("leaves unknown or broken data URLs in place", () => {
    const text = "![](data:image/x-unknown;base64,AAAA)";
    expect(strFromU8(buildExportFiles([note("N", text)])["N.md"])).toEndWith(text);
  });

  test("produces a valid zip", () => {
    const unzipped = unzipSync(buildExportZip([note("A", "hello")]));
    expect(strFromU8(unzipped["A.md"])).toEndWith("hello");
  });
});
