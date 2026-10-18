"use client";
import { Check, Monitor, RotateCcw, Sparkles, SlidersHorizontal, Waves } from "lucide-react";
import { useAppearance } from "./appearance-provider";
import {
  COLOR_PRESETS, appearanceColors, appearanceVariables, type Appearance, type ColorPreset,
} from "@/lib/appearance";
import type { CSSProperties } from "react";

export function AppearanceSettings() {
  const { appearance, setAppearance, resetAppearance } = useAppearance();
  const currentColors = appearanceColors(appearance);
  function update(changes: Partial<Appearance>) {
    setAppearance({ ...appearance, ...changes });
  }
  function choosePreset(preset: ColorPreset) {
    const entry = COLOR_PRESETS.find((item) => item.id === preset)!;
    update({ preset, colors: [...entry.colors] as [string, string, string] });
  }
  function updateColor(index: number, value: string) {
    const next = [...appearance.colors] as [string, string, string];
    next[index] = value;
    if (appearance.preset === "custom-solid") next.fill(value);
    update({ colors: next });
  }
  const isCustom = appearance.preset.startsWith("custom");
  return (
    <section className="panel appearance-settings" aria-labelledby="appearance-title">
      <div className="appearance-title-row">
        <div><div className="eyebrow"><SlidersHorizontal size={14}/> DASHBOARD STUDIO</div>
          <h2 id="appearance-title">Personalize your StudyPredict</h2>
          <p>Choose your dashboard experience, then customize its colors. Works with both styles.</p>
        </div>
        <button className="button secondary small" onClick={resetAppearance} type="button"><RotateCcw size={14}/> Reset</button>
      </div>

      <div className="appearance-section-title">Dashboard experience</div>
      <div className="appearance-layout-grid" role="group" aria-label="Dashboard layout">
        <button type="button" className={`appearance-layout ${appearance.dashboard === "classic" ? "chosen" : ""}`}
          aria-pressed={appearance.dashboard === "classic"} onClick={() => update({ dashboard: "classic" })}>
          <div className="appearance-thumbnail classic-thumbnail" aria-hidden="true">
            <i/><span><b/><b/><b/></span><em/><em/>
          </div>
          <span><Monitor size={16}/> Classic UI {appearance.dashboard === "classic" && <Check size={16}/>}</span>
          <small>Your familiar StudyPredict workspace</small>
        </button>
        <button type="button" className={`appearance-layout ${appearance.dashboard === "advanced" ? "chosen" : ""}`}
          aria-pressed={appearance.dashboard === "advanced"} onClick={() => update({ dashboard: "advanced" })}>
          <div className="appearance-thumbnail advanced-thumbnail" aria-hidden="true">
            <i/><span><b/><b/><b/></span><em/><em/>
          </div>
          <span><Sparkles size={16}/> Advanced UI {appearance.dashboard === "advanced" && <Check size={16}/>}</span>
          <small>Immersive command center and deep analytics</small>
        </button>
      </div>

      <div className="appearance-section-title"><Waves size={16}/> Color themes and fades</div>
      <div className="appearance-palette-grid" role="group" aria-label="Color palettes">
        {COLOR_PRESETS.map((item) => (
          <button key={item.id} type="button" aria-pressed={appearance.preset === item.id}
            className={`appearance-palette ${appearance.preset === item.id ? "chosen" : ""}`}
            onClick={() => choosePreset(item.id)}>
            <span className="appearance-swatch" style={{ background: `linear-gradient(115deg, ${item.colors.join(", ")})` }}/>
            <span>{item.label}</span>
            {appearance.preset === item.id && <Check size={15}/>}
          </button>
        ))}
      </div>

      {isCustom && <div className="appearance-color-controls">
        {(appearance.preset === "custom-solid" ? [0] : [0, 1, 2]).map((index) => (
          <label key={index} htmlFor={`theme-color-${index}`}>
            {appearance.preset === "custom-solid" ? "Your solid color" : `Fade color ${index + 1}`}
            <input id={`theme-color-${index}`} type="color"
              value={appearance.colors[index]} onChange={(event) => updateColor(index, event.target.value)}/>
          </label>
        ))}
      </div>}

      <div className="appearance-section-title">Live preview</div>
      <div className="appearance-live-preview" data-preview-dashboard={appearance.dashboard}
        style={appearanceVariables(appearance) as CSSProperties}>
        <div className="appearance-preview-sidebar"><Sparkles size={16}/><i/><i/><i/></div>
        <div className="appearance-preview-main">
          <div className="appearance-preview-gradient"><span>STUDYPREDICT AI</span><strong>Performance intelligence</strong><div className="appearance-preview-graph"/></div>
          <div className="appearance-preview-cards"><i/><i/><i/></div>
        </div>
      </div>
      <p className="helper">Changes apply immediately and are saved in this browser on this device. Your test data and prediction calculations stay unchanged. Animations respect reduced-motion settings and the Motion toggle.</p>
    </section>
  );
}
