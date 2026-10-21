"use client";

import { KeyRound, Maximize, Palette, Timer } from "lucide-react";
import type { KioskConfig } from "@/lib/types";
import { Field, SectionCard, ToggleRow, inputClass } from "./ui";

const TIMEOUTS = [30, 60, 90, 120, 180, 300];
const BACKGROUND_PRESETS = [
  { label: "כחול לילה", color: "#0a1530" },
  { label: "סגול כהה", color: "#211638" },
  { label: "ירוק עמוק", color: "#10332e" },
  { label: "אפור פחם", color: "#24272e" },
  { label: "בורדו כהה", color: "#3a1826" },
  { label: "כחול ים", color: "#0c344a" },
];

export function GeneralTab({
  draft,
  update,
  newPin,
  setNewPin,
}: {
  draft: KioskConfig;
  update: (patch: Partial<KioskConfig>) => void;
  newPin: string;
  setNewPin: (v: string) => void;
}) {
  const pinInvalid = newPin.length > 0 && !/^\d{4,12}$/.test(newPin);

  return (
    <div className="space-y-4">
      <SectionCard
        title="מיתוג העמדה"
        icon={<Palette className="h-4 w-4 text-gold-400" />}
        hint="הטקסטים שמוצגים בכותרת ובמסך הפתיחה."
      >
        <div className="grid gap-3.5 md:grid-cols-2">
          <Field label="שם העמדה">
            <input
              type="text"
              value={draft.kioskTitle}
              maxLength={40}
              onChange={(e) => update({ kioskTitle: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="כותרת משנה">
            <input
              type="text"
              value={draft.kioskSubtitle}
              maxLength={80}
              onChange={(e) => update({ kioskSubtitle: e.target.value })}
              className={inputClass}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="צבע הרקע"
        icon={<Palette className="h-4 w-4 text-gold-400" />}
        hint="בחר צבע רקע לעמדת הקיוסק. הבחירה נשמרת עם שאר ההגדרות ומשפיעה מיד גם על התצוגה המקדימה."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <input
              type="color"
              aria-label="בחירת צבע רקע"
              value={draft.backgroundColor}
              onChange={(e) => update({ backgroundColor: e.currentTarget.value.toLowerCase() })}
              className="h-12 w-16 cursor-pointer rounded-lg border border-white/20 bg-transparent p-1"
            />
            <span>
              <span className="block text-sm font-bold text-white">צבע מותאם אישית</span>
              <span className="block font-mono text-xs uppercase text-slate-400" dir="ltr">{draft.backgroundColor}</span>
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            {BACKGROUND_PRESETS.map((preset) => (
              <button
                key={preset.color}
                type="button"
                onClick={() => update({ backgroundColor: preset.color })}
                aria-label={preset.label}
                title={preset.label}
                aria-pressed={draft.backgroundColor.toLowerCase() === preset.color}
                className={`h-10 w-10 rounded-xl border-2 transition ${draft.backgroundColor.toLowerCase() === preset.color ? "border-white ring-2 ring-white/25" : "border-white/15 hover:border-white/50"}`}
                style={{ backgroundColor: preset.color }}
              />
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          לבהירות טובה של הכיתוב, מומלץ לבחור גוון כהה. ניתן לבחור כל צבע דרך בורר הצבעים.
        </p>
      </SectionCard>

      <SectionCard
        title="זמן איפוס אוטומטי"
        icon={<Timer className="h-4 w-4 text-gold-400" />}
        hint="חזרה למסך ההקלדה לאחר חוסר פעילות, כדי להגן על פרטיות התלמידים."
      >
        <div className="flex flex-wrap gap-2">
          {TIMEOUTS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => update({ autoLogoutSeconds: s })}
              className={`h-11 min-w-[5.5rem] cursor-pointer rounded-xl border px-3 text-sm font-bold transition ${
                draft.autoLogoutSeconds === s
                  ? "border-gold-300/70 bg-gradient-to-b from-gold-400 to-gold-600 text-navy-900"
                  : "border-white/15 bg-white/[0.05] text-slate-200 hover:bg-white/10"
              }`}
            >
              {s >= 60 ? `${s / 60 === Math.floor(s / 60) ? s / 60 : (s / 60).toFixed(1)} דק׳` : `${s} שנ׳`}
            </button>
          ))}
        </div>
      </SectionCard>

      <ToggleRow
        title="נעילת מסך מלא"
        description="מעבר אוטומטי למסך מלא בנגיעה הראשונה וחסימת תפריט לחיצה ימנית. מתאים לעמדות ציבוריות."
        checked={draft.kioskLockFullscreen}
        onChange={(v) => update({ kioskLockFullscreen: v })}
      >
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Maximize className="h-3.5 w-3.5" />
          כדי לצאת ממסך מלא לחץ Esc
        </div>
      </ToggleRow>

      <SectionCard
        title="קוד מנהל"
        icon={<KeyRound className="h-4 w-4 text-gold-400" />}
        hint="להחלפת הקוד הזן קוד חדש (4–12 ספרות). השאר ריק כדי לא לשנות."
      >
        <input
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={newPin}
          maxLength={12}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
          placeholder="קוד חדש"
          className={`${inputClass} max-w-xs text-center font-mono tracking-[0.4em] ${pinInvalid ? "!border-red-400" : ""}`}
        />
        {pinInvalid && <p className="mt-1.5 text-xs text-red-300">הקוד חייב להכיל בין 4 ל-12 ספרות</p>}
      </SectionCard>
    </div>
  );
}
