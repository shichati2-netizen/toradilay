import crypto from "node:crypto";
import fs from "node:fs";
import type { RegistrationPayload, SheetsMethod } from "@/lib/types";
import { getGoogleAuthToken } from "./google-oauth";
import { getStoredConfig } from "./settings";
import { readLocalSettings } from "./local-store";

function getSheetsApiBase(): string {
  return (
    process.env.GOOGLE_SHEETS_API_BASE ||
    "https://sheets.googleapis.com/v4/spreadsheets"
  );
}

function getTokenUrl(): string {
  return process.env.GOOGLE_OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token";
}

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export const SHEET_HEADERS = ["שם פרטי", "שם משפחה", "תעודת זהות", "ועד", "תאריך רישום"];

/* ------------------------------------------------------------------ */
/* חשבון שירות (משתני סביבה)                                           */
/* ------------------------------------------------------------------ */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export function parseServiceAccountJson(text: string): ServiceAccount | null {
  try {
    const trimmed = text.trim();
    const json = JSON.parse(
      trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8"),
    ) as Partial<ServiceAccount>;
    if (
      typeof json.client_email === "string" &&
      /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(json.client_email) &&
      typeof json.private_key === "string" &&
      json.private_key.includes("PRIVATE KEY")
    ) {
      return {
        client_email: json.client_email.trim(),
        private_key: json.private_key.replace(/\\\\n/g, "\n"),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * קורא חשבון שירות של Google מאחד מהמקורות:
 *  GOOGLE_SERVICE_ACCOUNT_JSON (ה-JSON המלא, או base64 שלו)
 *  GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
 *  GOOGLE_APPLICATION_CREDENTIALS (נתיב לקובץ JSON)
 *  JSON שנשמר במסך הניהול בקובץ ההגדרות המקומי
 */
export function loadServiceAccount(): ServiceAccount | null {
  // JSON שהוזן במסך הניהול גובר על משתני הסביבה, כדי להשתמש בחשבון שנבחר מפורשות.
  const storedJson = readLocalSettings()?.googleServiceAccountJson;
  if (typeof storedJson === "string" && storedJson.trim()) {
    const sa = parseServiceAccountJson(storedJson);
    if (sa) return sa;
  }

  const json =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (json) {
    const sa = parseServiceAccountJson(json);
    if (sa) return sa;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) {
    return { client_email: email, private_key: key.replace(/\\n/g, "\n") };
  }

  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (file) {
    try {
      const sa = parseServiceAccountJson(fs.readFileSync(file, "utf8"));
      if (sa) return sa;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const g = globalThis as typeof globalThis & {
  __kioskSaTokens?: Map<string, { token: string; exp: number }>;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function getServiceAccountToken(
  sa: ServiceAccount,
  scope: string = SHEETS_SCOPE,
): Promise<string> {
  const cache = (g.__kioskSaTokens ??= new Map());
  const keyFingerprint = crypto.createHash("sha256").update(sa.private_key).digest("hex").slice(0, 16);
  const cacheKey = `${sa.client_email}::${scope}::${keyFingerprint}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.exp - 60 > Date.now() / 1000) {
    return cached.token;
  }

  const tokenUrl = getTokenUrl();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: tokenUrl,
      iat: now,
      exp: now + 3600,
    }),
  );
  let signature: string;
  try {
    signature = base64url(
      crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key),
    );
  } catch {
    throw new Error("המפתח הפרטי של חשבון השירות אינו תקין (GOOGLE_PRIVATE_KEY)");
  }

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      `אימות חשבון השירות מול Google נכשל: ${data.error_description || data.error || res.status}`,
    );
  }
  cache.set(cacheKey, {
    token: data.access_token,
    exp: now + (data.expires_in ?? 3600),
  });
  return data.access_token;
}

async function resolveBearerForTarget(
  t: SheetsTarget,
): Promise<{ token: string; identity: string }> {
  if (t.method === "oauth") {
    const auth = await getGoogleAuthToken();
    if (!auth) {
      throw new Error("חשבון ה-Google אינו מחובר עוד. היכנס לניהול והתחבר מחדש.");
    }
    return { token: auth.token, identity: auth.email };
  }
  const sa = t.sa as ServiceAccount;
  const token = await getServiceAccountToken(sa, SHEETS_SCOPE);
  return { token, identity: sa.client_email };
}

async function sheetsRequest<T>(
  t: SheetsTarget,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { token, identity } = await resolveBearerForTarget(t);
  const res = await fetch(`${getSheetsApiBase()}/${t.spreadsheetId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      message = j.error?.message || message;
    } catch {
      /* ignore */
    }
    if (res.status === 403) {
      throw new Error(
        `אין הרשאת עריכה לגיליון (403). ודא שהחשבון ${identity} מורשה לערוך את הגיליון (ושאישרת הרשאת Google Sheets בהתחברות).`,
      );
    }
    if (res.status === 404) {
      throw new Error(`הגיליון לא נמצא (404). בדוק את מזהה הגיליון ${t.spreadsheetId}.`);
    }
    if (res.status === 401) {
      if (g.__kioskSaTokens) g.__kioskSaTokens.clear();
      throw new Error("אימות מול Google נכשל (401). נסה להתחבר מחדש באזור הניהול.");
    }
    throw new Error(`שגיאה בגישה ל-Google Sheets (${res.status}): ${message}`);
  }
  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Apps Script Webhook                                                  */
/* ------------------------------------------------------------------ */

async function webhookCall<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
  } catch {
    throw new Error("לא ניתן להתחבר לכתובת ה-Apps Script. בדוק את הכתובת ואת חיבור האינטרנט.");
  }
  const text = await res.text();
  let data: (T & { error?: string }) | null = null;
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    /* not json */
  }
  if (!res.ok || !data) {
    throw new Error(
      'ה-Apps Script לא החזיר תשובה תקינה. ודא שה-Web App פורסם עם גישה ל-"Anyone" ושהקוד הודבק במלואו.',
    );
  }
  if (data.error) throw new Error(`שגיאה מה-Apps Script: ${data.error}`);
  return data;
}

/* ------------------------------------------------------------------ */
/* API אחיד                                                             */
/* ------------------------------------------------------------------ */

export interface SheetsTarget {
  method: SheetsMethod;
  spreadsheetId: string;
  sa: ServiceAccount | null;
  webhookUrl: string;
}

/**
 * קובע את שיטת החיבור ל-Google Sheets:
 * 1. חשבון שירות (Service Account) שהוגדר מפורשות
 * 2. חשבון Google מחובר (OAuth קבוע)
 * 3. Apps Script Webhook
 */
export async function resolveTarget(
  override: { spreadsheetId?: string; webhookUrl?: string } = {},
): Promise<SheetsTarget | null> {
  const cfg = await getStoredConfig();
  const spreadsheetId = override.spreadsheetId || cfg.spreadsheetId;
  const webhookUrl = override.webhookUrl ?? cfg.sheetsWebhookUrl;

  const sa = loadServiceAccount();
  if (sa) return { method: "service-account", spreadsheetId, sa, webhookUrl };
  if (
    cfg.googleAccount?.refreshToken ||
    Boolean(cfg.googleAccount?.accessToken && cfg.googleAccount.expiresAt > Date.now()) ||
    process.env.GOOGLE_REFRESH_TOKEN?.trim()
  ) {
    return { method: "oauth", spreadsheetId, sa: null, webhookUrl };
  }
  if (webhookUrl) return { method: "webhook", spreadsheetId, sa: null, webhookUrl };
  return null;
}

export const NOT_CONFIGURED_MESSAGE =
  'העמדה טרם חוברה לחשבון Google ע"י מנהל המערכת. נא לפנות למנהל לחיבור חשבון Google באזור הניהול.';

export interface SheetInfo {
  title: string;
  firstSheetTitle: string;
  sheets: string[];
  rowCount?: number;
}

export async function getSheetInfo(t: SheetsTarget): Promise<SheetInfo> {
  if (t.method === "webhook") {
    const d = await webhookCall<{ title?: string; sheets?: string[]; rowCount?: number }>(
      t.webhookUrl,
      { action: "info", spreadsheetId: t.spreadsheetId },
    );
    const sheets = Array.isArray(d.sheets) ? d.sheets.map(String) : [];
    return {
      title: d.title || "גיליון רישום",
      firstSheetTitle: sheets[0] || "גיליון1",
      sheets,
      rowCount: typeof d.rowCount === "number" ? d.rowCount : undefined,
    };
  }

  const data = await sheetsRequest<{
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string; gridProperties?: { rowCount?: number } } }>;
  }>(t, "?fields=properties.title,sheets.properties(title,gridProperties.rowCount)");
  const sheets = (data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean) as string[];
  const firstSheetTitle = sheets[0] || "גיליון1";

  let rowCount: number | undefined;
  try {
    const values = await sheetsRequest<{ values?: unknown[][] }>(
      t,
      `/values/${encodeURIComponent(`${firstSheetTitle}!A1:A5000`)}`,
    );
    rowCount = Math.max(0, (values.values?.length ?? 0) - 1);
  } catch {
    /* optional */
  }

  return { title: data.properties?.title || "גיליון רישום", firstSheetTitle, sheets, rowCount };
}

export interface ExistingRegistration {
  exists: boolean;
  studentName?: string;
  rowNumber?: number;
}

/** בודק אם ת.ז. כבר רשומה: עמודה C (או B כגיבוי) */
export async function checkExistingRegistration(
  t: SheetsTarget,
  idNumber: string,
): Promise<ExistingRegistration> {
  const cleanId = idNumber.trim();
  try {
    if (t.method === "webhook") {
      const d = await webhookCall<ExistingRegistration>(t.webhookUrl, {
        action: "check",
        spreadsheetId: t.spreadsheetId,
        idNumber: cleanId,
      });
      return {
        exists: Boolean(d.exists),
        studentName: d.studentName || undefined,
        rowNumber: typeof d.rowNumber === "number" ? d.rowNumber : undefined,
      };
    }

    const info = await getSheetInfo(t);
    const data = await sheetsRequest<{ values?: unknown[][] }>(
      t,
      `/values/${encodeURIComponent(`${info.firstSheetTitle}!A1:D5000`)}`,
    );
    const rows = data.values ?? [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const colC = String(row[2] ?? "").trim();
      const colB = String(row[1] ?? "").trim();
      if (colC === cleanId) {
        const name = `${String(row[0] ?? "").trim()} ${colB}`.trim();
        return { exists: true, studentName: name || undefined, rowNumber: i + 1 };
      }
      if (colB === cleanId) {
        return {
          exists: true,
          studentName: String(row[0] ?? "").trim() || undefined,
          rowNumber: i + 1,
        };
      }
    }
    return { exists: false };
  } catch (err) {
    console.warn("[sheets] duplicate check failed:", err);
    return { exists: false };
  }
}

function israelTimestamp(): string {
  return new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
}

export interface AppendResult {
  success: boolean;
  message: string;
  updatedRange?: string;
}

/**
 * רישום תלמיד: שורה חדשה בגיליון הראשון.
 * A=שם פרטי, B=שם משפחה, C=תעודת זהות, D=ועד, E=תאריך ושעת רישום (שעון ישראל)
 */
export async function registerStudent(
  t: SheetsTarget,
  p: RegistrationPayload,
): Promise<AppendResult> {
  const timestamp = israelTimestamp();
  const fullName = `${p.firstName} ${p.lastName}`;

  if (t.method === "webhook") {
    const d = await webhookCall<{ success?: boolean; updatedRange?: string }>(t.webhookUrl, {
      action: "register",
      spreadsheetId: t.spreadsheetId,
      firstName: p.firstName,
      lastName: p.lastName,
      idNumber: p.idNumber,
      vaad: p.vaad,
      timestamp,
      headers: SHEET_HEADERS,
    });
    if (!d.success) throw new Error("ה-Apps Script לא אישר את הרישום");
    return {
      success: true,
      message: `התלמיד "${fullName}" נרשם בהצלחה בגיליון Google Sheets`,
      updatedRange: d.updatedRange,
    };
  }

  const info = await getSheetInfo(t);
  const sheet = info.firstSheetTitle;

  // כותרות אם הגיליון ריק
  try {
    const headRange = `${sheet}!A1:E1`;
    const head = await sheetsRequest<{ values?: unknown[][] }>(
      t,
      `/values/${encodeURIComponent(headRange)}`,
    );
    if (!head.values || head.values.length === 0 || (head.values[0] ?? []).length === 0) {
      await sheetsRequest(
        t,
        `/values/${encodeURIComponent(headRange)}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          body: JSON.stringify({ range: headRange, majorDimension: "ROWS", values: [SHEET_HEADERS] }),
        },
      );
    }
  } catch (err) {
    console.warn("[sheets] could not verify headers:", err);
  }

  const range = `${sheet}!A:E`;
  const result = await sheetsRequest<{ updates?: { updatedRange?: string } }>(
    t,
    `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({
        range,
        majorDimension: "ROWS",
        values: [[p.firstName, p.lastName, p.idNumber, p.vaad, timestamp]],
      }),
    },
  );

  return {
    success: true,
    message: `התלמיד "${fullName}" נרשם בהצלחה בגיליון Google Sheets`,
    updatedRange: result.updates?.updatedRange,
  };
}

/** אימות שדות הרישום (זהה לכללי המקור) */
export function validateRegistration(
  raw: unknown,
): { ok: true; payload: RegistrationPayload } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const firstName = String(r.firstName ?? "").trim().slice(0, 60);
  const lastName = String(r.lastName ?? "").trim().slice(0, 60);
  const idNumber = String(r.idNumber ?? "").replace(/\D/g, "");
  const vaadNum = Number(String(r.vaad ?? "").trim());

  if (firstName.length < 2) return { ok: false, error: "נא להזין שם פרטי מדויק כפי שרשום בישיבה (לפחות 2 אותיות)" };
  if (lastName.length < 2) return { ok: false, error: "נא להזין שם משפחה מדויק כפי שרשום בישיבה (לפחות 2 אותיות)" };
  if (!/^\d{5,9}$/.test(idNumber)) return { ok: false, error: "נא להזין תעודת זהות תקינה (ספרות בלבד, 5 עד 9 ספרות)" };
  if (!Number.isInteger(vaadNum) || vaadNum < 1 || vaadNum > 99) {
    return { ok: false, error: "בוועד יש להכניס מספר תקין (לדוגמה: 1, 2, 3...)" };
  }
  return { ok: true, payload: { firstName, lastName, idNumber, vaad: vaadNum } };
}
