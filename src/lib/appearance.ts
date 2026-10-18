export type DashboardStyle = "classic" | "advanced";
export type ColorPreset =
  | "violet" | "cotton" | "rgb" | "ocean" | "sunset"
  | "custom-solid" | "custom-gradient";

export type Appearance = {
  dashboard: DashboardStyle;
  preset: ColorPreset;
  colors: [string, string, string];
};

export const APPEARANCE_STORAGE_KEY = "studypredict-appearance-v1";
export const DEFAULT_APPEARANCE: Appearance = {
  dashboard: "classic",
  preset: "violet",
  colors: ["#a499ff", "#55e0ed", "#eb90ce"],
};

export const COLOR_PRESETS: {
  id: ColorPreset;
  label: string;
  colors: [string, string, string];
}[] = [
  { id: "violet", label: "Violet nebula", colors: ["#a499ff", "#55e0ed", "#eb90ce"] },
  { id: "cotton", label: "White · Pink · Blue", colors: ["#ffffff", "#ff9cdd", "#77c9ff"] },
  { id: "rgb", label: "RGB glow", colors: ["#ff5969", "#60ffab", "#687aff"] },
  { id: "ocean", label: "Ocean", colors: ["#44edce", "#46a4ff", "#8273ff"] },
  { id: "sunset", label: "Sunset", colors: ["#ffb467", "#ff689a", "#a782f5"] },
  { id: "custom-solid", label: "Solid color", colors: ["#8e97ff", "#8e97ff", "#8e97ff"] },
  { id: "custom-gradient", label: "Custom fade", colors: ["#ffffff", "#ff9cdd", "#77c9ff"] },
];

const hexColor = /^#[a-fA-F0-9]{6}$/;
export function parseAppearance(value: unknown): Appearance {
  if (!value || typeof value !== "object") return { ...DEFAULT_APPEARANCE };
  const data = value as Record<string, unknown>;
  const dashboard: DashboardStyle =
    data.dashboard === "advanced" ? "advanced" : "classic";
  const found = COLOR_PRESETS.find((item) => item.id === data.preset);
  const preset = found?.id ?? DEFAULT_APPEARANCE.preset;
  const defaults = found?.colors ?? DEFAULT_APPEARANCE.colors;
  const candidate = Array.isArray(data.colors) ? data.colors : [];
  const colors = defaults.map((defaultColor, index) =>
    typeof candidate[index] === "string" && hexColor.test(candidate[index])
      ? candidate[index].toLowerCase()
      : defaultColor,
  ) as [string, string, string];
  if (preset === "custom-solid") colors[1] = colors[2] = colors[0];
  return { dashboard, preset, colors };
}

export function appearanceColors(settings: Appearance): [string, string, string] {
  const known = COLOR_PRESETS.find((item) => item.id === settings.preset);
  if (settings.preset === "custom-gradient" || settings.preset === "custom-solid")
    return settings.colors;
  return known?.colors ?? DEFAULT_APPEARANCE.colors;
}
export function accentFor(settings: Appearance): string {
  // White first stops make a beautiful fade but aren't visible as small icons.
  // Choose an appropriately saturated accent for text and charts.
  if (settings.preset === "cotton" || settings.preset === "custom-gradient")
    return appearanceColors(settings)[2];
  return appearanceColors(settings)[0];
}
export function appearanceVariables(settings: Appearance) {
  const [a, b, c] = appearanceColors(settings);
  const accent = accentFor(settings);
  return {
    "--accent": accent,
    "--accent-a": a,
    "--accent-b": b,
    "--accent-c": c,
    "--accent-gradient": `linear-gradient(118deg, ${a} 0%, ${b} 52%, ${c} 100%)`,
    "--accent-halo": `radial-gradient(ellipse at 60% 0%, ${b}22, transparent 64%)`,
  } as Record<string, string>;
}
