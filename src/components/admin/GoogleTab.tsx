"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ExternalLink, FileUp, FolderOpen, KeyRound, Loader2, Lock, PlugZap, Save, Trash2, XCircle } from "lucide-react";
import type { GoogleAuthStatus, KioskConfig } from "@/lib/types";
import { saveGoogleServiceAccountJsonApi, testDriveFolder, testSheetsConnection } from "@/lib/client/api";
import { FxButton } from "../FxButton";
import { GoogleAccountCard } from "./GoogleAccountCard";
import { Field, SectionCard, inputClass } from "./ui";

type TestResult = Awaited<ReturnType<typeof testDriveFolder>>;

const AUTH_MODE_LABEL: Record<string, string> = {
  oauth: "חשבון Google מחובר (API רשמי — תומך בתיקיות פרטיות)",
  "service-account": "חשבון שירות (Service Account)",
  public: "גישה ציבורית (ללא התחברות)",
};

export function GoogleTab({
  draft,
  update,
  pin,
  onGoogleStatusChange,
}: {
  draft: KioskConfig;
  update: (patch: Partial<KioskConfig>) => void;
  pin: string;
  onGoogleStatusChange?: (status: GoogleAuthStatus | null) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [sheetTestBusy, setSheetTestBusy] = useState(false);
  const [sheetTestResult, setSheetTestResult] = useState<Awaited<ReturnType<typeof testSheetsConnection>> | null>(null);
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [savingServiceAccount, setSavingServiceAccount] = useState(false);
  const [serviceAccountError, setServiceAccountError] = useState<string | null>(null);
  const [serviceAccountMessage, setServiceAccountMessage] = useState<string | null>(null);
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null);
  const serviceAccountFileRef = useRef<HTMLInputElement>(null);

  const handleGoogleStatusChange = (status: GoogleAuthStatus | null) => {
    setServiceAccountEmail(status?.serviceAccountEmail ?? null);
    onGoogleStatusChange?.(status);
  };

  const handleServiceAccountFile = async (file?: File) => {
    if (!file) return;
    setServiceAccountError(null);
    setServiceAccountMessage(null);
    try {
      setServiceAccountJson(await file.text());
    } catch {
      setServiceAccountError("לא ניתן לקרוא את קובץ ה-JSON.");
    } finally {
      if (serviceAccountFileRef.current) serviceAccountFileRef.current.value = "";
    }
  };

  const saveServiceAccount = async (clear = false) => {
    setSavingServiceAccount(true);
    setServiceAccountError(null);
    setServiceAccountMessage(null);
    try {
      const response = await saveGoogleServiceAccountJsonApi(
        pin,
        clear ? { clear: true } : { json: serviceAccountJson },
      );
      if (!response.ok || !response.status) {
        setServiceAccountError(response.error ?? "שמירת חשבון השירות נכשלה.");
        return;
      }
      setServiceAccountEmail(response.status.serviceAccountEmail ?? null);
      onGoogleStatusChange?.(response.status);
      setServiceAccountJson("");
      setServiceAccountMessage(
        clear
          ? "ה-JSON שהוזן במסך זה הוסר. אם הוגדר חשבון שירות במשתני סביבה, הוא ימשיך להיות זמין."
          : "חשבון השירות נשמר מקומית וישמש כעדיפות לחיבור ל-Sheets.",
      );
    } finally {
      setSavingServiceAccount(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    const r = await testDriveFolder(pin, draft.rootFolderId.trim());
    setResult(r);
    setTesting(false);
  };

  const handleSpreadsheetIdChange = (raw: string) => {
    const match = raw.match(/spreadsheets\/d\/([A-Za-z0-9_-]{10,})/);
    update({ spreadsheetId: match ? match[1] : raw.trim() });
    setSheetTestResult(null);
  };

  const runSheetTest = async () => {
    setSheetTestBusy(true);
    setSheetTestResult(null);
    try {
      const response = await testSheetsConnection(pin, draft.spreadsheetId.trim(), "");
      setSheetTestResult(response);
    } finally {
      setSheetTestBusy(false);
    }
  };

  // מאפשר להדביק קישור מלא של תיקייה ולחלץ ממנו את המזהה
  const handleIdChange = (raw: string) => {
    const m = raw.match(/folders\/([A-Za-z0-9_-]{10,})/);
    update({ rootFolderId: m ? m[1] : raw.trim() });
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <GoogleAccountCard pin={pin} onStatusChange={handleGoogleStatusChange} />

      <SectionCard
        title="חשבון שירות (Service Account)"
        icon={<KeyRound className="h-4 w-4 text-gold-400" />}
        hint="אפשר להדביק כאן את ה-JSON שהורדת מ-Google Cloud או להעלות את הקובץ. המפתח נשמר בקובץ ההגדרות המקומי של העמדה, ולא נשלח בחזרה למסך."
      >
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-navy-950/40 p-3">
            <div className="text-xs text-slate-300">
              <div className="font-bold text-white">מצב חשבון השירות</div>
              {serviceAccountEmail ? (
                <div className="mt-1 font-mono text-emerald-200" dir="ltr">{serviceAccountEmail}</div>
              ) : (
                <div className="mt-1 text-slate-400">לא זוהה חשבון שירות פעיל</div>
              )}
            </div>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/[0.05] px-3 text-xs font-bold text-slate-100 transition hover:bg-white/10">
              <FileUp className="h-4 w-4 text-gold-300" />
              בחירת קובץ JSON
              <input
                ref={serviceAccountFileRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => void handleServiceAccountFile(e.target.files?.[0])}
              />
            </label>
          </div>

          <Field label="תוכן JSON של חשבון השירות">
            <textarea
              dir="ltr"
              spellCheck={false}
              autoComplete="off"
              value={serviceAccountJson}
              onChange={(e) => {
                setServiceAccountJson(e.target.value);
                setServiceAccountError(null);
                setServiceAccountMessage(null);
              }}
              placeholder={'{\n  "type": "service_account",\n  "client_email": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n..."\n}'}
              className={`${inputClass} min-h-40 resize-y font-mono text-xs leading-relaxed`}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <FxButton
              variant="gold"
              onClick={() => void saveServiceAccount(false)}
              disabled={savingServiceAccount || !serviceAccountJson.trim()}
              className="h-11 px-4 text-sm"
            >
              {savingServiceAccount ? <Loader2 className="keep-anim h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              שמירת חשבון השירות
            </FxButton>
            <FxButton
              variant="ghost"
              onClick={() => void saveServiceAccount(true)}
              disabled={savingServiceAccount || (!serviceAccountEmail && !serviceAccountJson.trim())}
              className="h-11 px-4 text-sm"
            >
              <Trash2 className="h-4 w-4" />
              הסרת JSON שמור
            </FxButton>
          </div>

          {serviceAccountError && (
            <div className="rounded-xl border border-red-400/35 bg-red-400/[0.08] p-3 text-xs text-red-100" role="alert">{serviceAccountError}</div>
          )}
          {serviceAccountMessage && (
            <div className="rounded-xl border border-emerald-400/35 bg-emerald-400/[0.08] p-3 text-xs text-emerald-100" role="status">{serviceAccountMessage}</div>
          )}
          <Field label="מזהה גיליון Google Sheets (או הדבקת קישור מלא)">
            <input
              type="text"
              dir="ltr"
              value={draft.spreadsheetId}
              onChange={(e) => handleSpreadsheetIdChange(e.target.value)}
              placeholder="הדבק קישור או מזהה גיליון"
              className={`${inputClass} font-mono text-left`}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <FxButton
              variant="navy"
              onClick={() => void runSheetTest()}
              disabled={sheetTestBusy || !draft.spreadsheetId.trim()}
              className="h-11 px-4 text-sm"
            >
              {sheetTestBusy ? <Loader2 className="keep-anim h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              בדיקת גישה לגיליון
            </FxButton>
          </div>
          {sheetTestResult && (
            <div className={`rounded-xl border p-3 text-xs ${sheetTestResult.ok ? "border-emerald-400/35 bg-emerald-400/[0.08] text-emerald-100" : "border-red-400/35 bg-red-400/[0.08] text-red-100"}`}>
              {sheetTestResult.ok ? (
                <>
                  <div className="font-bold">הגישה לגיליון תקינה: {sheetTestResult.title}</div>
                  <div className="mt-1">שיטת חיבור: {sheetTestResult.method === "service-account" ? "חשבון שירות" : sheetTestResult.method === "oauth" ? "OAuth" : "Apps Script"} · לשוניות: {sheetTestResult.sheets?.join(", ") || "לא נמצאו"}</div>
                </>
              ) : (
                <div role="alert">{sheetTestResult.error || "בדיקת הגישה נכשלה."}</div>
              )}
            </div>
          )}
          <p className="text-xs leading-relaxed text-slate-400">
            חשוב: יש לשתף את גיליון ה-Sheets עם כתובת האימייל של חשבון השירות ולהעניק הרשאת עריכה. אחרי שינוי מזהה הגיליון, לחץ על "שמירת שינויים" בתחתית הניהול כדי שהרישומים ישתמשו במזהה השמור. חיפוש ב-Drive ממשיך להשתמש בחיבור הקיים.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="תיקיית השורש בגוגל דרייב"
        icon={<FolderOpen className="h-4 w-4 text-gold-400" />}
        hint="המערכת קוראת את התיקייה הראשית ומחפשת בה תיקייה ששמה הוא מספר תעודת הזהות (פועל גם כשהתיקייה פרטית אם חובר חשבון Google למעלה)."
      >
        <div className="space-y-3.5">
          <Field label="מזהה התיקייה (או הדבקה של קישור מלא)">
            <input
              type="text"
              dir="ltr"
              value={draft.rootFolderId}
              onChange={(e) => handleIdChange(e.target.value)}
              placeholder="1CXFm0VyVtSZIqONXJYMmIu0hJyxUqj2B"
              className={`${inputClass} font-mono text-left`}
            />
          </Field>
          <Field label="שם תצוגה לתיקייה">
            <input
              type="text"
              value={draft.rootFolderName}
              onChange={(e) => update({ rootFolderName: e.target.value })}
              className={inputClass}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <FxButton variant="navy" onClick={runTest} disabled={testing || !draft.rootFolderId} className="h-11 px-5 text-sm">
              {testing ? <Loader2 className="keep-anim h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              בדיקת חיבור לדרייב
            </FxButton>
            <a
              href={`https://drive.google.com/drive/folders/${draft.rootFolderId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-sky-300 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              פתח בדרייב
            </a>
          </div>

          {result && (
            <div
              className={`rounded-xl border p-3.5 text-sm ${
                result.ok
                  ? "border-emerald-400/35 bg-emerald-400/[0.08] text-emerald-100"
                  : "border-red-400/35 bg-red-400/[0.08] text-red-100"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-bold">
                {result.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : <XCircle className="h-5 w-5 text-red-300" />}
                {result.ok ? "החיבור לדרייב תקין" : "החיבור לדרייב נכשל"}
                {result.ms !== undefined && (
                  <span className="font-mono text-xs font-normal opacity-70">({result.ms}ms)</span>
                )}
              </div>
              {result.ok ? (
                <div className="mt-2 space-y-1.5 text-xs">
                  {result.authMode && (
                    <div className="flex items-center gap-1.5 text-emerald-200/90">
                      <Lock className="h-3.5 w-3.5" />
                      מצב חיבור: <strong>{AUTH_MODE_LABEL[result.authMode] ?? result.authMode}</strong>
                    </div>
                  )}
                  <div>
                    נמצאו <strong>{result.folderCount}</strong> תיקיות תלמידים ו-<strong>{result.fileCount}</strong> קבצים בשורש.
                  </div>
                  {result.sample && result.sample.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {result.sample.map((n) => (
                        <span key={n} className="rounded-md bg-white/10 px-2 py-0.5 font-mono" dir="ltr">
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-1.5 text-xs leading-relaxed">{result.error}</p>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="איך עובדת הגישה לדרייב?">
        <ul className="list-disc space-y-1.5 pe-5 text-xs leading-relaxed text-slate-300">
          <li>
            <strong>עם חשבון Google מחובר:</strong> עובד מול Google Drive API הרשמי — תומך בתיקיות{" "}
            <strong>פרטיות לחלוטין</strong>, בתיקיות ששותפו איתך, וללא הגבלת כמות תלמידים.
          </li>
          <li>
            <strong>ללא חשבון מחובר:</strong> עובד אם התיקייה משותפת כ&quot;כל מי שיש לו את הקישור – צפייה&quot;.
          </li>
          <li>בתוך תיקיית התלמיד מוצגים קבצי Word (‎.docx / .doc / Google Docs). אם אין אינטרנט, המערכת מחפשת גיבוי בכונן המקומי.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
