"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Mail, Mic, PenLine, Save, ShieldCheck } from "lucide-react";
import type { TranscriptionSettings, TranscriptionSettingsInput } from "@/lib/types";
import { fetchTranscriptionSettingsApi, saveTranscriptionSettingsApi } from "@/lib/client/api";
import { Field, SectionCard, ToggleRow, inputClass } from "./ui";

const EMPTY: TranscriptionSettings = {
  enabled: false,
  allowedStudentIds: [],
  audioModelOneEmail: "",
  audioModelTwoEmail: "",
  handwritingModelOneEmail: "",
  handwritingModelTwoEmail: "",
  audioModelOneReplyEmail: "",
  audioModelTwoReplyEmail: "",
  handwritingModelOneReplyEmail: "",
  handwritingModelTwoReplyEmail: "",
  appsScriptUrl: "",
  appsScriptTokenConfigured: false,
  handwritingRootFolderId: "1Wc_cw53wLmoxSIqI91Lk8ke4FnOutLaw",
};

export function TranscriptionTab({ pin }: { pin: string }) {
  const [settings, setSettings] = useState<TranscriptionSettings>(EMPTY);
  const [allowedIdsText, setAllowedIdsText] = useState("");
  const [appsScriptToken, setAppsScriptToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTranscriptionSettingsApi(pin).then((result) => {
      if (cancelled) return;
      if (result.settings) {
        setSettings(result.settings);
        setAllowedIdsText(result.settings.allowedStudentIds.join("\n"));
      } else {
        setError(result.error || "לא ניתן לטעון את הגדרות התמלול.");
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [pin]);

  const update = (patch: Partial<TranscriptionSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const input: TranscriptionSettingsInput = {
      enabled: settings.enabled,
      allowedStudentIds: allowedIdsText.split(/[\s,;]+/).map((value) => value.replace(/\D/g, "")).filter((value) => value.length === 9),
      audioModelOneEmail: settings.audioModelOneEmail,
      audioModelTwoEmail: settings.audioModelTwoEmail,
      handwritingModelOneEmail: settings.handwritingModelOneEmail,
      handwritingModelTwoEmail: settings.handwritingModelTwoEmail,
      audioModelOneReplyEmail: settings.audioModelOneReplyEmail,
      audioModelTwoReplyEmail: settings.audioModelTwoReplyEmail,
      handwritingModelOneReplyEmail: settings.handwritingModelOneReplyEmail,
      handwritingModelTwoReplyEmail: settings.handwritingModelTwoReplyEmail,
      appsScriptUrl: settings.appsScriptUrl,
      appsScriptToken: appsScriptToken || undefined,
      handwritingRootFolderId: settings.handwritingRootFolderId,
    };
    const result = await saveTranscriptionSettingsApi(pin, input);
    setSaving(false);
    if (!result.ok || !result.settings) {
      setError(result.error || "שמירת ההגדרות נכשלה.");
      return;
    }
    setSettings(result.settings);
    setAllowedIdsText(result.settings.allowedStudentIds.join("\n"));
    setAppsScriptToken("");
    setSaved(true);
    setError(result.settings.saveWarning || null);
  };

  if (loading) {
    return <div className="flex items-center gap-2 p-5 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> טוען הגדרות תמלול...</div>;
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="הפעלת תפריט התמלול"
        icon={<Mic className="h-4 w-4 text-gold-400" />}
        hint="כאשר האפשרות מופעלת, הכפתורים יופיעו רק לאחר הזנת תעודת זהות שנמצאת ברשימת המורשים."
      >
        <ToggleRow
          title="הפעלת תמלול קולי ותיקיית כתבי יד"
          description="אפשר לכבות בכל עת. כשהאפשרות כבויה, מסך הקבצים נשאר ללא שינוי."
          checked={settings.enabled}
          onChange={(value) => update({ enabled: value })}
        />
      </SectionCard>

      <SectionCard
        title="חשבונות מורשים"
        icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />}
        hint="הזן תעודות זהות, אחת בכל שורה. רק חשבונות אלה יראו את כפתורי התמלול."
      >
        <textarea
          value={allowedIdsText}
          onChange={(event) => { setAllowedIdsText(event.target.value); setSaved(false); }}
          rows={5}
          dir="ltr"
          placeholder={"123456789\n987654321"}
          className={inputClass + " h-auto min-h-28 resize-y py-3 font-mono"}
        />
        <p className="mt-2 text-[11px] text-slate-500">המספרים נשמרים בהגדרות המנהל ואינם נשלחים למסך הציבורי.</p>
      </SectionCard>

      <SectionCard
        title="כתובות תמלול קולי"
        icon={<Mic className="h-4 w-4 text-sky-300" />}
        hint="כתובות היעד שאליהן נשלחות בקשות התמלול. בכל שליחה נשלחת רק כתובת המודל שנבחר."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="מודל 1 – תמלול קולי">
            <input type="email" value={settings.audioModelOneEmail} onChange={(event) => update({ audioModelOneEmail: event.target.value })} placeholder="audio-model1@example.com" className={inputClass} dir="ltr" />
          </Field>
          <Field label="מודל 2 – תמלול קולי">
            <input type="email" value={settings.audioModelTwoEmail} onChange={(event) => update({ audioModelTwoEmail: event.target.value })} placeholder="audio-model2@example.com" className={inputClass} dir="ltr" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="תיקיית תמלולי כתב יד ב-Google Drive"
        icon={<PenLine className="h-4 w-4 text-rose-300" />}
        hint="הכנס את מזהה תיקיית האב שבה נמצאות תיקיות התלמידים. כל תיקיית תלמיד נקראת בשם המלא שלו. הגישה נעשית באמצעות אותו חשבון שירות שמחובר לדרייב."
      >
        <Field label="מזהה תיקיית האב של תמלולי כתב היד">
          <input
            type="text"
            value={settings.handwritingRootFolderId}
            onChange={(event) => update({ handwritingRootFolderId: event.target.value })}
            placeholder="מזהה תיקיית Google Drive"
            className={inputClass}
            dir="ltr"
          />
        </Field>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          אפשר להדביק מזהה או קישור מלא לתיקיית Google Drive. התוכנה תאתר בתוכה תיקייה ששמה תואם לשם המלא ששויך לתלמיד.
        </p>
      </SectionCard>

      <SectionCard
        title="כתובות השולחים של תשובות התמלול הקולי"
        icon={<Mail className="h-4 w-4 text-amber-300" />}
        hint="אלה כתובות From שמהן חוזרים קובצי התוצאה של התמלול הקולי. הן נפרדות מכתובות היעד שאליהן נשלחת בקשת התמלול."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="From של מודל 1 – תמלול קולי">
            <input type="email" value={settings.audioModelOneReplyEmail} onChange={(event) => update({ audioModelOneReplyEmail: event.target.value })} placeholder="כתובת השולח של מודל 1" className={inputClass} dir="ltr" />
          </Field>
          <Field label="From של מודל 2 – תמלול קולי">
            <input type="email" value={settings.audioModelTwoReplyEmail} onChange={(event) => update({ audioModelTwoReplyEmail: event.target.value })} placeholder="כתובת השולח של מודל 2" className={inputClass} dir="ltr" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="שליחה דרך Google Apps Script"
        icon={<Mail className="h-4 w-4 text-emerald-300" />}
        hint="התוכנה מעבירה את הקבצים לסקריפט. הסקריפט שולח אותם מחשבון Gmail שלו, ללא שרת SMTP בתוכנה."
      >
        <div className="space-y-3">
          <Field label="כתובת Web App של Google Apps Script">
            <input type="url" value={settings.appsScriptUrl} onChange={(event) => update({ appsScriptUrl: event.target.value })} placeholder="https://script.google.com/macros/s/.../exec" className={inputClass} dir="ltr" />
          </Field>
          <Field label="מפתח חיבור משותף (לפחות 32 תווים)">
            <input
              type="password"
              autoComplete="new-password"
              value={appsScriptToken}
              onChange={(event) => { setAppsScriptToken(event.target.value); setSaved(false); setError(null); }}
              placeholder={settings.appsScriptTokenConfigured ? "מפתח שמור – השאר ריק כדי לא לשנות" : "הדבק מפתח אקראי ארוך"}
              className={inputClass}
              dir="ltr"
            />
          </Field>
          {settings.appsScriptTokenConfigured && (
            <p className="text-[11px] text-emerald-300">מפתח חיבור כבר שמור ואינו מוצג בחזרה. השאר ריק כדי לשמור אותו.</p>
          )}
          <p className="text-[11px] leading-relaxed text-slate-500">
            יש לשמור את אותו מפתח גם ב-Google Apps Script תחת Project Settings → Script Properties, בשם TORADELIA_INTEGRATION_TOKEN. כתובת זו משמשת גם לשליחה וגם לבדיקת תשובות התמלול.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="הגבלת שליחה"
        icon={<ShieldCheck className="h-4 w-4 text-amber-300" />}
        hint="עד 20 קבצים ובסך הכול 20MB בכל בקשה."
      >
        <p className="text-xs leading-relaxed text-slate-400">
          כתובות היעד וכתובות From של התשובות נשמרות במחשב העמדה. בשליחה נשלחת רק כתובת היעד של המודל שנבחר. סיסמאות Gmail אינן נשמרות בתוכנה, ושליחת המייל נעשית מחשבון Google שמפעיל את הסקריפט.
        </p>
      </SectionCard>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          {error ? <span className={saved ? "text-amber-300" : "text-red-300"}>{error}</span> : saved ? <span className="flex items-center gap-1 text-emerald-300"><Check className="h-3.5 w-3.5" /> ההגדרות נשמרו</span> : <span className="text-slate-500">השינויים יישמרו בנפרד מהגדרות העמדה הרגילות</span>}
        </div>
        <button type="button" onClick={save} disabled={saving} className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-5 text-sm font-black text-navy-950 shadow-lg disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמירת הגדרות תמלול
        </button>
      </div>
    </div>
  );
}
