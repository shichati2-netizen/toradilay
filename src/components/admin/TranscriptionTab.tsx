"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Mail, Mic, Save, ShieldCheck } from "lucide-react";
import type { TranscriptionSettings, TranscriptionSettingsInput } from "@/lib/types";
import { fetchTranscriptionSettingsApi, saveTranscriptionSettingsApi } from "@/lib/client/api";
import { Field, SectionCard, ToggleRow, inputClass } from "./ui";

const EMPTY: TranscriptionSettings = {
  enabled: false,
  allowedStudentIds: [],
  modelOneEmail: "",
  modelTwoEmail: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpFrom: "",
  smtpPasswordConfigured: false,
};

export function TranscriptionTab({ pin }: { pin: string }) {
  const [settings, setSettings] = useState<TranscriptionSettings>(EMPTY);
  const [allowedIdsText, setAllowedIdsText] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
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
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const input: TranscriptionSettingsInput = {
      enabled: settings.enabled,
      allowedStudentIds: allowedIdsText.split(/[\s,;]+/).map((value) => value.replace(/\D/g, "")).filter((value) => value.length === 9),
      modelOneEmail: settings.modelOneEmail,
      modelTwoEmail: settings.modelTwoEmail,
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpUser: settings.smtpUser,
      smtpFrom: settings.smtpFrom,
      smtpPassword: smtpPassword || undefined,
    };
    const result = await saveTranscriptionSettingsApi(pin, input);
    setSaving(false);
    if (!result.ok || !result.settings) {
      setError(result.error || "שמירת ההגדרות נכשלה.");
      return;
    }
    setSettings(result.settings);
    setAllowedIdsText(result.settings.allowedStudentIds.join("\n"));
    setSmtpPassword("");
    setSaved(true);
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
          title="הפעלת תמלול קולי וכתבי יד"
          description="אפשר לכבות בכל עת. כשהאפשרות כבויה, מסך הקבצים נשאר ללא שינוי."
          checked={settings.enabled}
          onChange={(value) => update({ enabled: value })}
        />
      </SectionCard>

      <SectionCard
        title="חשבונות מורשים"
        icon={<ShieldCheck className="h-4 w-4 text-emerald-300" />}
        hint="הזן תעודות זהות, אחת בכל שורה. רק חשבונות אלה יראו את שני כפתורי התמלול."
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
        title="כתובות שני המודלים"
        icon={<Mail className="h-4 w-4 text-sky-300" />}
        hint="בחלון השליחה המשתמש יבחר מודל 1 או מודל 2. הבחירה קובעת לאיזו כתובת תישלח הבקשה."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="כתובת דואר – מודל 1">
            <input type="email" value={settings.modelOneEmail} onChange={(event) => update({ modelOneEmail: event.target.value })} placeholder="model1@example.com" className={inputClass} dir="ltr" />
          </Field>
          <Field label="כתובת דואר – מודל 2">
            <input type="email" value={settings.modelTwoEmail} onChange={(event) => update({ modelTwoEmail: event.target.value })} placeholder="model2@example.com" className={inputClass} dir="ltr" />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="הגדרות שליחת דואר (SMTP)"
        icon={<Mail className="h-4 w-4 text-gold-400" />}
        hint="נדרש שרת דואר לשליחה אוטומטית. לדוגמה, בחשבון Gmail יש להשתמש בסיסמת אפליקציה ולא בסיסמת הכניסה הרגילה."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="שרת SMTP">
            <input value={settings.smtpHost} onChange={(event) => update({ smtpHost: event.target.value })} placeholder="smtp.gmail.com" className={inputClass} dir="ltr" />
          </Field>
          <Field label="פורט">
            <input type="number" min={1} max={65535} value={settings.smtpPort} onChange={(event) => update({ smtpPort: Number(event.target.value) || 587 })} className={inputClass} dir="ltr" />
          </Field>
          <Field label="שם משתמש / כתובת חשבון שולח">
            <input type="email" value={settings.smtpUser} onChange={(event) => update({ smtpUser: event.target.value })} placeholder="sender@example.com" className={inputClass} dir="ltr" />
          </Field>
          <Field label="כתובת שולח להצגה">
            <input type="email" value={settings.smtpFrom} onChange={(event) => update({ smtpFrom: event.target.value })} placeholder="זהה לשם המשתמש אם ריק" className={inputClass} dir="ltr" />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="סיסמת SMTP / סיסמת אפליקציה">
            <input type="password" autoComplete="new-password" value={smtpPassword} onChange={(event) => { setSmtpPassword(event.target.value); setSaved(false); }} placeholder={settings.smtpPasswordConfigured ? "סיסמה שמורה – השאר ריק כדי לא לשנות" : "הזן סיסמת SMTP"} className={inputClass} dir="ltr" />
          </Field>
          {settings.smtpPasswordConfigured && <p className="mt-1 text-[11px] text-emerald-300">סיסמה כבר מוגדרת. היא אינה מוחזרת לממשק הניהול לאחר השמירה.</p>}
        </div>
        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 text-xs leading-relaxed text-amber-100">
          הגבלת השליחה כרגע היא 20MB בסך הכול לבקשה, עד 20 קבצים. מומלץ לבדוק תחילה עם חשבון דואר ייעודי.
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          {error ? <span className="text-red-300">{error}</span> : saved ? <span className="flex items-center gap-1 text-emerald-300"><Check className="h-3.5 w-3.5" /> ההגדרות נשמרו</span> : <span className="text-slate-500">השינויים יישמרו בנפרד מהגדרות העמדה הרגילות</span>}
        </div>
        <button type="button" onClick={save} disabled={saving} className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-5 text-sm font-black text-navy-950 shadow-lg disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          שמירת הגדרות תמלול
        </button>
      </div>
    </div>
  );
}
