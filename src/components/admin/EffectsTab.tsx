"use client";

import { Sparkles, Volume2, Zap } from "lucide-react";
import {
  EFFECT_GROUPS,
  EFFECT_META,
  EFFECT_PRESETS,
  normalizeEffects,
} from "@/lib/defaults";
import type { EffectKey, EffectsConfig } from "@/lib/types";
import { configureSound, playSound } from "@/lib/client/sound";
import { fireConfetti } from "@/lib/client/fx";
import { FxButton } from "../FxButton";
import { Slider, Switch, ToggleRow } from "./ui";

function sameEffects(a: EffectsConfig, b: EffectsConfig) {
  return JSON.stringify(normalizeEffects(a)) === JSON.stringify(normalizeEffects(b));
}

export function EffectsTab({
  effects,
  onChange,
}: {
  effects: EffectsConfig;
  onChange: (e: EffectsConfig) => void;
}) {
  const set = <K extends keyof EffectsConfig>(key: K, value: EffectsConfig[K]) =>
    onChange({ ...effects, [key]: value });

  const activeCount = EFFECT_META.filter((m) => effects[m.key]).length;

  const testSound = () => {
    configureSound(true, effects.soundVolume);
    playSound("success");
    window.setTimeout(() => configureSound(effects.master && effects.sounds, effects.soundVolume), 600);
  };

  return (
    <div className="space-y-5">
      {/* מתג ראשי */}
      <div
        className={`rounded-2xl border p-5 transition-colors ${
          effects.master
            ? "border-gold-400/40 bg-gradient-to-l from-gold-400/[0.12] to-transparent"
            : "border-white/10 bg-white/[0.04]"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                effects.master ? "bg-gradient-to-br from-gold-300 to-gold-600 text-navy-900" : "bg-white/10 text-slate-400"
              }`}
            >
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">אפקטים חזותיים</h3>
              <p className="text-xs text-slate-400">
                {effects.master
                  ? `פעיל · ${activeCount} מתוך ${EFFECT_META.length} אפקטים דולקים`
                  : "כבוי · העמדה מוצגת בעיצוב נקי וסטטי, חוסך משאבי מחשב"}
              </p>
            </div>
          </div>
          <Switch checked={effects.master} onChange={(v) => set("master", v)} label="אפקטים חזותיים" />
        </div>
      </div>

      {/* תבניות מוכנות */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-300">
          <Zap className="h-3.5 w-3.5 text-gold-400" />
          תבניות מוכנות
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {EFFECT_PRESETS.map((p) => {
            const selected = sameEffects(effects, p.effects);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ ...p.effects })}
                className={`cursor-pointer rounded-xl border p-3 text-right transition ${
                  selected
                    ? "border-gold-400/70 bg-gold-400/10 shadow-[0_0_24px_-8px_rgba(229,190,83,0.6)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]"
                }`}
              >
                <div className="text-sm font-bold text-white">{p.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{p.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* אפקטים לפי קבוצות */}
      <div className={`space-y-5 transition-opacity ${effects.master ? "" : "opacity-45"}`}>
        {EFFECT_GROUPS.map((g) => (
          <div key={g.id}>
            <div className="mb-2 flex items-baseline gap-2">
              <h4 className="text-sm font-black text-gold-300">{g.title}</h4>
              <span className="text-xs text-slate-500">{g.hint}</span>
            </div>
            <div className="grid gap-2.5 md:grid-cols-2">
              {EFFECT_META.filter((m) => m.group === g.id).map((m) => (
                <ToggleRow
                  key={m.key}
                  title={m.label}
                  description={m.description}
                  checked={effects[m.key as EffectKey]}
                  onChange={(v) => set(m.key as EffectKey, v)}
                >
                  {m.key === "particles" && effects.particles && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="w-20 text-[11px] text-slate-400">כמות: {effects.particlesDensity}</span>
                      <Slider
                        label="כמות חלקיקים"
                        min={10}
                        max={120}
                        step={5}
                        value={effects.particlesDensity}
                        onChange={(v) => set("particlesDensity", v)}
                      />
                    </div>
                  )}
                  {m.key === "glass" && effects.glass && (
                    <div className="mt-3 space-y-4 rounded-xl border border-sky-300/15 bg-sky-300/[0.04] p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-xs font-semibold text-slate-200">עוצמת הזכוכית</div>
                        <div className="font-mono text-xs font-bold text-sky-200">{effects.glassIntensity}%</div>
                      </div>
                      <Slider
                        label="עוצמת אפקט Liquid Glass"
                        min={0}
                        max={100}
                        step={1}
                        value={effects.glassIntensity}
                        onChange={(v) => set("glassIntensity", v)}
                      />
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-xs font-semibold text-slate-200">מהירות ההשתקפות</div>
                        <div className="font-mono text-xs font-bold text-sky-200">{effects.glassSpeed}/10</div>
                      </div>
                      <Slider
                        label="מהירות תנועת Liquid Glass"
                        min={1}
                        max={10}
                        step={1}
                        value={effects.glassSpeed}
                        onChange={(v) => set("glassSpeed", v)}
                      />
                      <p className="text-[11px] leading-relaxed text-slate-400">
                        השינויים נראים מיד. עוצמה 0 מכבה את ההשתקפות המונפשת; מהירות 1 איטית ומהירות 10 מהירה.
                      </p>
                    </div>
                  )}
                  {m.key === "sounds" && effects.sounds && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="w-20 text-[11px] text-slate-400">עוצמה: {effects.soundVolume}%</span>
                      <Slider
                        label="עוצמת צלילים"
                        min={0}
                        max={100}
                        step={5}
                        value={effects.soundVolume}
                        onChange={(v) => set("soundVolume", v)}
                      />
                      <FxButton variant="ghost" sound="none" onClick={testSound} className="h-9 shrink-0 px-3 text-xs">
                        <Volume2 className="h-3.5 w-3.5" />
                        נסה
                      </FxButton>
                    </div>
                  )}
                  {m.key === "confetti" && effects.confetti && (
                    <FxButton
                      variant="ghost"
                      sound="none"
                      onClick={() => fireConfetti({ x: 0.5, y: 0.7 })}
                      className="mt-3 h-9 px-3 text-xs"
                    >
                      🎉 הצג דוגמה
                    </FxButton>
                  )}
                </ToggleRow>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="rounded-xl border border-sky-400/20 bg-sky-400/[0.07] p-3 text-xs leading-relaxed text-sky-100/90">
        השינויים מוצגים מיד ברקע, כדי שתוכל לראות את התוצאה בזמן אמת. כדי שיישארו לצמיתות לחץ על
        <strong> שמירת שינויים</strong>. אם העמדה איטית במחשב ישן, מומלץ לבחור בתבנית &quot;חסכוני&quot; או לכבות את האפקטים.
      </p>
    </div>
  );
}
