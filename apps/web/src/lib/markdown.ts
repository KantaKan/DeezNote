import DOMPurify from "dompurify";
import { marked } from "marked";

// The editor saves an image's resize ratio as its alt text (e.g. `![0.62](…)`); apply it in preview too.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "IMG") return;
  const ratio = Number(node.getAttribute("alt"));
  if (!node.getAttribute("alt") || Number.isNaN(ratio) || ratio <= 0) return;
  node.setAttribute("style", `width: ${Math.min(ratio, 1) * 100}%`);
  node.setAttribute("alt", "");
});

/** Markdown to sanitized HTML for the preview. */
export function renderMarkdown(markdown: string) {
  return DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string);
}
