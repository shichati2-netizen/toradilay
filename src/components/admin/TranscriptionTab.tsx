"use client";

import { useEffect, useState } from "react";
import { Check, CheckCircle2, FileUp, Loader2, Mail, PenLine, PlugZap, Save, ShieldCheck, Trash2, XCircle } from "lucide-react";
import type { TranscriptionSettings, TranscriptionSettingsInput } from "@/lib/types";
import {
  fetchTranscriptionSettingsApi,
  saveTranscriptionSettingsApi,
  saveTranscriptionHandwritingDriveAccountApi,
  testTranscriptionHandwritingDriveAccessApi,
} from "@/lib/client/api";
import { Field, SectionCard, inputClass } from "./ui";

const EMPTY: TranscriptionSettings = {
  enabled: true,
  handwritingAccessRestricted: false,
  handwritingAllowedStudentIds: [],
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
  handwritingDriveAccountConfigured: false,
  handwritingDriveAccountEmail: "",
};

export function TranscriptionTab({ pin }: { pin: string }) {
  const [settings, setSettings] = useState<TranscriptionSettings>(EMPTY);
  const [appsScriptToken, setAppsScriptToken] = useState("");
  const [handwritingAllowedIdsText, setHandwritingAllowedIdsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [handwritingDriveJson, setHandwritingDriveJson] = useState("");
  const [handwritingDriveFileName, setHandwritingDriveFileName] = useState("");
  const [savingHandwritingDrive, setSavingHandwritingDrive] = useState(false);
  const [testingHandwritingDrive, setTestingHandwritingDrive] = useState(false);
  const [handwritingDriveTest, setHandwritingDriveTest] = useState<{
    ok: boolean; authMode?: string; accountEmail?: string; dedicatedAccount?: boolean;
    folderCount?: number; fileCount?: number; sample?: string[]; ms?: number; error?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTranscriptionSettingsApi(pin).then((result) => {
      if (cancelled) return;
      if (result.settings) {
        setSettings(result.settings);
        setHandwritingAllowedIdsText(result.settings.handwritingAllowedStudentIds.join("\n"));
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
      enabled: true,
      handwritingAccessRestricted: settings.handwritingAccessRestricted,
      handwritingAllowedStudentIds: handwritingAllowedIdsText.split(/[\s,;]+/).map((value) => value.replace(/\D/g, "")).filter((value) => value.length === 9),
      allowedStudentIds: [],
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
    setAppsScriptToken("");
    setSaved(true);
    setError(result.settings.saveWarning || null);
  };

  const saveHandwritingDriveAccount = async (clear = false) => {
    setSavingHandwritingDrive(true);
    setError(null);
    setHandwritingDriveTest(null);
    try {
      const result = await saveTranscriptionHandwritingDriveAccountApi(
        pin,
        clear ? { clear: true } : { json: handwritingDriveJson },
      );
      if (!result.ok || !result.settings) {
        setError(result.error || "שמירת חשבון הגישה לכתב היד נכשלה.");
        return;
      }
      setSettings((current) => ({
        ...current,
        handwritingDriveAccountConfigured: result.settings!.handwritingDriveAccountConfigured,
        handwritingDriveAccountEmail: result.settings!.handwritingDriveAccountEmail,
      }));
      setHandwritingDriveJson("");
      setHandwritingDriveFileName("");
      setSaved(true);
    } finally {
      setSavingHandwritingDrive(false);
    }
  };

  const testHandwritingDriveAccess = async () => {
    setTestingHandwritingDrive(true);
    setHandwritingDriveTest(null);
    try {
      const result = await testTranscriptionHandwritingDriveAccessApi(pin, settings.handwritingRootFolderId);
      setHandwritingDriveTest(result);
    } finally {
      setTestingHandwritingDrive(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 p-5 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> טוען הגדרות תמלול...</div>;
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="תיקיית תמלולי כתב יד ב-Google Drive"
        icon={<PenLine className="h-4 w-4 text-rose-300" />}
        hint="הכנס את מזהה תיקיית האב שבה נמצאות תיקיות התלמידים. המערכת תציג את קובצי ה-PDF מתיקיית התלמיד בתוך מסך הקבצים."
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
        title="חשבון גישה ייעודי לתיקיית כתב היד"
        icon={<ShieldCheck className="h-4 w-4 text-rose-300" />}
        hint="אפשר להגדיר כאן חשבון Google נפרד שיקרא את תיקיית התמלול הידני, בלי לשנות את החיבור הכללי לדרייב."
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-navy-950/40 p-3 text-xs leading-relaxed text-slate-300">
            {settings.handwritingDriveAccountConfigured ? (
              <>
                <div className="flex items-center gap-2 font-bold text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" /> חשבון ייעודי שמור
                </div>
                <div className="mt-1 font-mono text-emerald-100" dir="ltr">{settings.handwritingDriveAccountEmail}</div>
              </>
            ) : (
              <>
                <div className="font-bold text-white">לא הוגדר חשבון ייעודי</div>
                <p className="mt-1">במצב זה התוכנה תנסה להשתמש בחשבון Google הכללי שבלשונית Google.</p>
              </>
            )}
          </div>

          <Field label="קובץ JSON של חשבון השירות עבור תיקיית כתב היד">
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 100_000) {
                  setError("קובץ חשבון השירות גדול מדי. יש לבחור קובץ JSON עד 100KB.");
                  event.target.value = "";
                  return;
                }
                try {
                  setHandwritingDriveJson(await file.text());
                  setHandwritingDriveFileName(file.name);
                  setHandwritingDriveTest(null);
                  setError(null);
                  setSaved(false);
                } catch {
                  setError("לא ניתן לקרוא את קובץ JSON של חשבון השירות.");
                }
                event.target.value = "";
              }}
              className="block w-full text-xs text-slate-300 file:me-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
            />
          </Field>
          {handwritingDriveFileName && (
            <p className="text-xs text-sky-200">נבחר קובץ: {handwritingDriveFileName}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveHandwritingDriveAccount(false)}
              disabled={savingHandwritingDrive || !handwritingDriveJson.trim()}
              className="flex h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-xs font-bold text-white disabled:opacity-40"
            >
              {savingHandwritingDrive ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              שמירת חשבון הגישה
            </button>
            {settings.handwritingDriveAccountConfigured && (
              <button
                type="button"
                onClick={() => void saveHandwritingDriveAccount(true)}
                disabled={savingHandwritingDrive}
                className="flex h-10 items-center gap-2 rounded-xl border border-red-400/30 px-4 text-xs font-bold text-red-200 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" /> הסרת החשבון הייעודי
              </button>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            לאחר שמירת החשבון, יש לשתף את תיקיית האב ב-Google Drive עם כתובת האימייל שמוצגת למעלה, בהרשאת צפייה. המפתח הפרטי נשמר בהגדרות המקומיות של העמדה ואינו מוצג בחזרה.
          </p>
          <div className="border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => void testHandwritingDriveAccess()}
              disabled={testingHandwritingDrive || !settings.handwritingRootFolderId.trim()}
              className="flex h-10 items-center gap-2 rounded-xl border border-sky-300/25 bg-sky-300/[0.08] px-4 text-xs font-bold text-sky-100 disabled:opacity-40"
            >
              {testingHandwritingDrive ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              בדיקת גישה לתיקיית התמלול הידני
            </button>
            {handwritingDriveTest && (
              <div className={`mt-3 rounded-xl border p-3 text-xs ${handwritingDriveTest.ok ? "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-100" : "border-red-400/30 bg-red-400/[0.07] text-red-100"}`}>
                {handwritingDriveTest.ok ? (
                  <>
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="h-4 w-4" /> הגישה לתיקייה תקינה
                    </div>
                    <p className="mt-1">
                      נמצאו {handwritingDriveTest.folderCount ?? 0} תיקיות ו-{handwritingDriveTest.fileCount ?? 0} קבצים.
                      {handwritingDriveTest.authMode === "service-account" && handwritingDriveTest.dedicatedAccount
                        ? " הגישה אומתה באמצעות החשבון הייעודי."
                        : handwritingDriveTest.authMode === "service-account"
                          ? " הגישה אומתה באמצעות חשבון השירות הכללי."
                          : handwritingDriveTest.authMode === "oauth"
                            ? " הגישה אומתה באמצעות חשבון Google הכללי."
                            : " התיקייה נגישה באמצעות קישור ציבורי."}
                    </p>
                    {handwritingDriveTest.accountEmail && <p className="mt-1 font-mono" dir="ltr">{handwritingDriveTest.accountEmail}</p>}
                    {handwritingDriveTest.sample?.length ? <p className="mt-1">דוגמאות: {handwritingDriveTest.sample.join(", ")}</p> : null}
                  </>
                ) : (
                  <div className="flex items-start gap-2">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{handwritingDriveTest.error || "בדיקת הגישה נכשלה."}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="הרשאות לתמלול כתב יד"
        icon={<ShieldCheck className="h-4 w-4 text-amber-300" />}
        hint="כברירת מחדל הגישה פתוחה לכולם. אפשר להפעיל הגבלה כך שרק חשבונות ברשימה יוכלו לפתוח קובצי כתב יד."
      >
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white">
          <input
            type="checkbox"
            checked={settings.handwritingAccessRestricted}
            onChange={(event) => update({ handwritingAccessRestricted: event.target.checked })}
            className="h-4 w-4 accent-amber-400"
          />
          <span>
            <span className="block font-bold">הגבלת תמלול כתב יד לחשבונות מורשים בלבד</span>
            <span className="mt-1 block text-xs text-slate-400">כבוי = פתוח לכולם (ברירת מחדל). מופעל = רק מספרי הזהות שברשימה יקבלו גישה.</span>
          </span>
        </label>
        {settings.handwritingAccessRestricted && (
          <Field label="מספרי תעודת זהות מורשים (9 ספרות, אחד בכל שורה)">
            <textarea
              value={handwritingAllowedIdsText}
              onChange={(event) => { setHandwritingAllowedIdsText(event.target.value); setSaved(false); setError(null); }}
              rows={5}
              placeholder={"123456789\n987654321"}
              className={inputClass + " min-h-28"}
              dir="ltr"
            />
          </Field>
        )}
        {settings.handwritingAccessRestricted && (
          <p className="text-[11px] text-amber-200">במצב מוגבל, חשבון שלא מופיע ברשימה לא יוכל לראות, לפתוח, להוריד, להעתיק או להציג תצוגה מקדימה של קובצי כתב היד.</p>
        )}
      </SectionCard>

      <SectionCard
        title="שליחה דרך Google Apps Script"
        icon={<Mail className="h-4 w-4 text-emerald-300" />}
        hint="הקבצים מועברים דרך Google Apps Script ליעד התמלול הקבוע בעמדה. אין בחירת מודול במהלך העבודה."
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
            יש לשמור את אותו מפתח גם ב-Google Apps Script תחת Project Settings → Script Properties, בשם TORADELIA_INTEGRATION_TOKEN. כתובת זו משמשת לשליחת בקשות התמלול ולקליטת התוצאות.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="הגבלת שליחה"
        icon={<ShieldCheck className="h-4 w-4 text-amber-300" />}
        hint="עד 20 קבצים ובסך הכול 20MB בכל בקשה."
      >
        <p className="text-xs leading-relaxed text-slate-400">
          כתובת היעד וכתובת השולח של תוצאות התמלול נשמרות בהגדרות המקומיות הקיימות של העמדה. לא מוצגת בחירת מודול. שליחת המייל נעשית מחשבון Google שמפעיל את הסקריפט.
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
