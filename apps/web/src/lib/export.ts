import type { NoteDocument } from "@save-text/shared";
import { strToU8, zipSync } from "fflate";

// Export runs entirely in the browser from notes that are already decrypted in memory:
// nothing extra is decrypted and nothing is sent to the server.

export interface ExportableNote {
  document: NoteDocument;
  updatedAt: string;
}

const IMAGE_EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif" };

/** A file name that works on Windows, macOS and Linux, and in Obsidian. */
export function safeFileName(title: string) {
  const cleaned = title
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 100)
    .trim();
  return cleaned || "Untitled";
}

function frontMatter({ document, updatedAt }: ExportableNote) {
  const lines = ["---", `title: ${JSON.stringify(document.title || "Untitled")}`];
  if (document.tags.length) lines.push(`tags: [${document.tags.map((tag) => JSON.stringify(tag)).join(", ")}]`);
  if (document.favorite) lines.push("favorite: true");
  if (document.color) lines.push(`color: ${JSON.stringify(document.color)}`);
  lines.push(`updated: ${JSON.stringify(updatedAt)}`, "---", "");
  return lines.join("\n");
}

function decodeBase64(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Builds the zip's files: one Markdown file per note, photos pulled out into attachments/. */
export function buildExportFiles(notes: ExportableNote[]) {
  const files: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();

  for (const note of notes) {
    const base = safeFileName(note.document.title);
    let name = base;
    for (let n = 2; usedNames.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    usedNames.add(name.toLowerCase());

    let photo = 0;
    const markdown = note.document.markdown.replace(/!\[([^\]]*)\]\(data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)\)/gi, (match, alt: string, mime: string, data: string) => {
      const extension = IMAGE_EXTENSIONS[mime.toLowerCase()];
      if (!extension) return match;
      try {
        const path = `attachments/${name} ${++photo}.${extension}`;
        files[path] = decodeBase64(data.replace(/\s/g, ""));
        return `![${alt}](${encodeURI(path)})`;
      } catch {
        return match;
      }
    });

    files[`${name}.md`] = strToU8(frontMatter(note) + markdown);
  }
  return files;
}

export function buildExportZip(notes: ExportableNote[]) {
  // Photos are already compressed; level 6 still shrinks the Markdown.
  return zipSync(buildExportFiles(notes), { level: 6 });
}

export function downloadExport(zip: Uint8Array, date = new Date()) {
  const url = URL.createObjectURL(new Blob([zip.slice()], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `DeezNote export ${date.toISOString().slice(0, 10)}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
