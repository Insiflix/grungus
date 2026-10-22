export const themes = [
  { id: "forest", name: "Forest", description: "A quiet corner of the woods" },
  { id: "dark", name: "Dark", description: "Clean slate, low distraction" },
  { id: "light", name: "Light", description: "Fresh greens and soft daylight" },
  { id: "aurora", name: "Aurora", description: "Northern lights in jade and violet" },
  { id: "orbit", name: "Orbit", description: "Starlight over a midnight nebula" },
  { id: "sundown", name: "Sundown", description: "Copper skies and desert warmth" },
  { id: "rosewater", name: "Rosewater", description: "Airy blush, lilac and berry ink" },
  { id: "golden-pond", name: "Golden Pond", description: "Warm amber water and olive greens" },
  { id: "savanna", name: "Savanna", description: "Rain clouds, earthy browns and soft gold" },
  { id: "reeds", name: "Reeds", description: "Deep marsh greens and quiet reflections" },
  { id: "bullfrog", name: "Bullfrog", description: "Olive, yellow and a familiar face" },
  { id: "honey", name: "Honey", description: "Cream, amber and a sunlit toad" },
  { id: "chorus", name: "Night Chorus", description: "Moonlit slate and mossy greens" },
  { id: "cocoa", name: "Cocoa", description: "Warm brown with a very round companion" },
  { id: "black-rain", name: "Black Rain", description: "Deep charcoal and a tiny rain frog" },
  { id: "amber-toad", name: "Amber Toad", description: "Golden eyes against warm midnight" },
  { id: "obsidian", name: "Obsidian", description: "A copper portrait in deep charcoal" },
  { id: "bronze", name: "Bronze", description: "Soft bronze and a quiet black backdrop" },
  { id: "puddle", name: "Puddle", description: "A round companion with cool night tones" },
  { id: "velvet", name: "Velvet", description: "Muted plum and a toad in the spotlight" },
  { id: "toad-gaze", name: "Toad Gaze", description: "Bright eyes peering out of the dark" },
] as const;

export type Theme = typeof themes[number]["id"];
export function isTheme(value: unknown): value is Theme { return themes.some(theme => theme.id === value); }
