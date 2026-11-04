"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FolderOpen, Layers, RefreshCw, Sparkles, Usb } from "lucide-react";
import { getDriveSequence } from "@/lib/defaults";
import type { KioskConfig, RemovableDrive } from "@/lib/types";
import { fetchRemovableDrives } from "@/lib/client/api";
import { PathLabel } from "../PathLabel";
import { Field, SectionCard, Slider, ToggleRow, inputClass } from "./ui";

const COMMON_DRIVES = ["C", "D", "E", "F", "G", "H", "I"];

export function DriveTab({
  draft,
  update,
}: {
  draft: KioskConfig;
  update: (patch: Partial<KioskConfig>) => void;
}) {
  const [drives, setDrives] = useState<RemovableDrive[]>([]);
  const [isWindows, setIsWindows] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);

  const chooseLocalFolder = useCallback(async () => {
    const desktop = (window as Window & {
      toradeliaDesktop?: { selectFolder: () => Promise<{ canceled: boolean; path?: string }> };
    }).toradeliaDesktop;
    if (!desktop) return;
    setPickingFolder(true);
    try {
      const result = await desktop.selectFolder();
      if (!result.canceled && result.path) update({ localSearchPath: result.path });
    } finally {
      setPickingFolder(false);
    }
  }, [update]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetchRemovableDrives();
    setDrives(res.drives ?? []);
    setIsWindows(res.isWindows);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const sequence = getDriveSequence(
    draft.targetDriveLetter,
    draft.fallbackDriveCount,
    draft.limitToDEOnly,
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="מקור חיפוש קבצי תלמידים"
        icon={<FolderOpen className="h-4 w-4 text-sky-300" />}
        hint="אפשר להמשיך להשתמש ב-Google Drive, או לבחור תיקייה מקומית שבה נמצאות תיקיות התלמידים."
      >
        <div className="space-y-3">
          <ToggleRow
            title="חיפוש קבצים מתיקייה במחשב"
            description="כאשר האפשרות מופעלת, החיפוש יתבצע רק בתיקייה שנבחרה כאן ולא יפנה ל-Google Drive."
            checked={draft.localSearchEnabled}
            onChange={(v) => update({ localSearchEnabled: v })}
          />
          {draft.localSearchEnabled && (
            <div className="space-y-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.05] p-3">
              <button
                type="button"
                onClick={chooseLocalFolder}
                disabled={pickingFolder}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-sky-300/30 bg-sky-300/10 px-4 py-2.5 text-sm font-bold text-sky-100 transition hover:bg-sky-300/20 disabled:opacity-50"
              >
                <FolderOpen className="h-4 w-4" />
                {pickingFolder ? "פותח בחירת תיקייה..." : "בחירת תיקייה במחשב"}
              </button>
              <div className="break-all rounded-lg bg-black/20 p-2.5 text-xs text-slate-300" dir="ltr">
                {draft.localSearchPath || "עדיין לא נבחרה תיקייה"}
              </div>
              {!draft.localSearchPath && (
                <p className="text-xs text-amber-200">יש לבחור את התיקייה שבתוכה נמצאות תיקיות התלמידים.</p>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {!isWindows && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-3.5 text-xs leading-relaxed text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <span>
            השרת רץ כרגע על מערכת שאינה ווינדוס, ולכן ההעתקה לדיסק און קי מתבצעת כהורדה ישירה לדפדפן.
            בעמדת ווינדוס הקובץ נכתב אוטומטית לכונן שנבחר כאן.
          </span>
        </div>
      )}

      <SectionCard
        title="יעד שמירת קבצים והעתקה לדיסק און קי"
        icon={<Usb className="h-4 w-4 text-emerald-400" />}
        action={
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "keep-anim animate-spin text-emerald-400" : ""}`} />
            רענן כוננים
          </button>
        }
      >
        <div className="space-y-4">
          <ToggleRow
            title="זיהוי אוטומטי של דיסק און קי (Plug & Play)"
            description="המערכת מזהה איזה דיסק און קי מחובר כעת, גם אם קיבל אות E: / F: / G:, ושומרת ישירות אליו. מומלץ."
            checked={draft.autoDetectRemovableDrive}
            onChange={(v) => update({ autoDetectRemovableDrive: v })}
          >
            <div className="mt-3 flex flex-wrap gap-2">
              {drives.length > 0 ? (
                drives.map((d) => (
                  <span
                    key={d.letter}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-200"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {d.name}
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  {isWindows ? "לא זוהה דיסק און קי כעת. כשיחובר, הוא יזוהה מיד" : "זיהוי כוננים זמין בעמדת ווינדוס בלבד"}
                </span>
              )}
            </div>
          </ToggleRow>

          <div>
            <div className="mb-2 text-xs font-bold text-slate-300">
              {draft.autoDetectRemovableDrive
                ? "כונן גיבוי (אם לא מחובר דיסק און קי):"
                : "אות כונן קבועה:"}
            </div>
            <div className="flex flex-wrap gap-2">
              {COMMON_DRIVES.map((letter) => {
                const selected = draft.targetDriveLetter === letter;
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => update({ targetDriveLetter: letter })}
                    className={`h-11 w-14 cursor-pointer rounded-xl border font-mono text-sm font-bold transition ${
                      selected
                        ? "border-gold-300/70 bg-gradient-to-b from-gold-400 to-gold-600 text-navy-900 shadow-lg shadow-gold-500/20"
                        : "border-white/15 bg-white/[0.05] text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    {letter}:
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="שם תיקיית היעד בכונן">
            <input
              type="text"
              value={draft.targetFolderName}
              onChange={(e) => update({ targetFolderName: e.target.value })}
              placeholder="תורה דיליה"
              className={inputClass}
            />
          </Field>

          <div className="rounded-xl border border-white/10 bg-navy-950/40 p-3 text-xs text-slate-300">
            נתיב שמירה:{" "}
            <strong className="font-mono text-emerald-300">
              <PathLabel drive={draft.targetDriveLetter} folder={draft.targetFolderName || "..."} />
            </strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="סריקת כוננים חלופיים"
        icon={<Layers className="h-4 w-4 text-gold-400" />}
        hint="אם כונן היעד לא זמין, המערכת תנסה את האותיות הבאות בתור."
      >
        <div className="space-y-4">
          <ToggleRow
            title="הגבלה לכוננים D: ו-E: בלבד"
            description="לעולם לא לכתוב או לחפש ב-F: ומעלה"
            checked={draft.limitToDEOnly}
            onChange={(v) => update({ limitToDEOnly: v })}
          />
          {!draft.limitToDEOnly && (
            <div className="flex items-center gap-4">
              <span className="w-32 shrink-0 text-xs text-slate-300">
                {draft.fallbackDriveCount > 0 ? `+${draft.fallbackDriveCount} אותיות קדימה` : "כונן ראשי בלבד"}
              </span>
              <Slider
                label="כמות כוננים חלופיים"
                min={0}
                max={10}
                value={draft.fallbackDriveCount}
                onChange={(v) => update({ fallbackDriveCount: v })}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            סדר סריקה:
            {sequence.map((l, i) => (
              <span key={l} className="flex items-center gap-1">
                <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono font-bold text-white">{l}:</span>
                {i < sequence.length - 1 && <span className="text-slate-600">←</span>}
              </span>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
