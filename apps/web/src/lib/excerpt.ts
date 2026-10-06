/** Plain preview text for a note: photos become "Photo", Markdown symbols and empty image placeholders disappear. */
export function noteExcerpt(markdown: string, length: number) {
  return markdown
    .replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "Photo")
    .replace(/!\[[^\]]*\]\(\s*\)/g, "")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, length);
}
