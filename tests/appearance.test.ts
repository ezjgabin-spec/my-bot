import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE, COLOR_PRESETS, parseAppearance,
  appearanceColors, appearanceVariables, accentFor,
} from "../src/lib/appearance";

describe("dashboard appearance", () => {
  it("uses the advanced command center as default", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(DEFAULT_APPEARANCE.dashboard).toBe("advanced");
  });
  it("allows Advanced UI and a white-pink-blue fade", () => {
    const settings = parseAppearance({ dashboard: "advanced", preset: "cotton" });
    expect(settings.dashboard).toBe("advanced");
    expect(appearanceColors(settings)).toEqual(["#ffffff", "#ff9cdd", "#77c9ff"]);
    expect(appearanceVariables(settings)["--accent-gradient"]).toContain("linear-gradient");
  });
  it("supports custom solid colors and custom gradients", () => {
    const solid = parseAppearance({
      preset: "custom-solid", dashboard: "classic",
      colors: ["#104fbc", "#ff0000", "#00ff00"],
    });
    expect(appearanceColors(solid)).toEqual(["#104fbc", "#104fbc", "#104fbc"]);
    const gradient = parseAppearance({
      preset: "custom-gradient", dashboard: "advanced",
      colors: ["#ffffff", "#ff0077", "#1200ff"],
    });
    expect(appearanceColors(gradient)).toEqual(["#ffffff", "#ff0077", "#1200ff"]);
    expect(accentFor(gradient)).toBe("#1200ff");
  });
  it("rejects unsafe CSS values and unknown palettes rather than interpolating", () => {
    const broken = parseAppearance({
      dashboard: "arbitrary", preset: "custom-gradient",
      colors: ['red; background: url(https://evil.example)', "blue", "#aabbcc"],
    });
    expect(broken.dashboard).toBe("classic");
    expect(appearanceColors(broken)[0]).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(appearanceVariables(broken)["--accent-gradient"]).not.toContain("evil");
    expect(parseAppearance({preset:"unknown"}).preset).toBe("violet");
  });
  it("includes all requested palettes", () => {
    expect(COLOR_PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining([
      "cotton", "rgb", "custom-solid", "custom-gradient",
    ]));
  });
});
