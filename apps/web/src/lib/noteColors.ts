// Each id maps to a `.note-color-<id>` class in styles.css (page + card tints, light and dark).
export const NOTE_COLORS = [
  { id: "yellow", label: "Yellow", swatch: "#facc15" },
  { id: "orange", label: "Orange", swatch: "#fb923c" },
  { id: "red", label: "Red", swatch: "#f87171" },
  { id: "pink", label: "Pink", swatch: "#f472b6" },
  { id: "purple", label: "Purple", swatch: "#a78bfa" },
  { id: "blue", label: "Blue", swatch: "#60a5fa" },
  { id: "teal", label: "Teal", swatch: "#2dd4bf" },
  { id: "green", label: "Green", swatch: "#4ade80" },
  { id: "gray", label: "Gray", swatch: "#a8a29e" },
] as const;

export function noteColorClass(color: string | undefined) {
  return color && NOTE_COLORS.some((option) => option.id === color) ? `note-color-${color}` : "";
}
