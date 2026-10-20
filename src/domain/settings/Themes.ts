export const themes = [
  { id: "forest", name: "Forest", description: "A quiet corner of the woods" },
  { id: "dark", name: "Dark", description: "Clean slate, low distraction" },
  { id: "light", name: "Light", description: "Fresh greens and soft daylight" },
  { id: "aurora", name: "Aurora", description: "Northern lights in jade and violet" },
  { id: "orbit", name: "Orbit", description: "Starlight over a midnight nebula" },
  { id: "sundown", name: "Sundown", description: "Copper skies and desert warmth" },
  { id: "rosewater", name: "Rosewater", description: "Airy blush, lilac and berry ink" },
] as const;

export type Theme = typeof themes[number]["id"];
export function isTheme(value: unknown): value is Theme { return themes.some(theme => theme.id === value); }
