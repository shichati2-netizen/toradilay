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
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(json.client_email) &&
      typeof json.private_key === "string" &&
      json.private_key.includes("PRIVATE KEY")
    ) {
      return {
        client_email: json.client_email.trim(),
        private_key: json.private_key.replace(/\\n/g, "\n"),
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
        `Google החזירה 403 לחשבון ${identity}. הודעת Google המקורית: ${message}. בדוק את שיתוף הגיליון, הרשאת Editor, הפעלת Google Sheets API, והגנות טווחים.`,
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
      `/values/${encodeURIComponent(sheetRange(firstSheetTitle, "A1:A5000"))}`,
    );
    rowCount = Math.max(0, (values.values?.length ?? 0) - 1);
  } catch {
    /* optional */
  }

  return { title: data.properties?.title || "גיליון רישום", firstSheetTitle, sheets, rowCount };
}


function sheetRange(title: string, range: string): string {
  return "'" + title.replace(/'/g, "''") + "'!" + range;
}

type SheetPurpose = "registration" | "codes";
interface SheetHeaderLocation {
  spreadsheetTitle: string;
  title: string;
  headerRowIndex: number;
  headers: string[];
  firstNameColumn?: number;
  lastNameColumn?: number;
  idColumn?: number;
  vaadColumn?: number;
  dateColumn?: number;
  nameColumn?: number;
}

function findHeaderLocation(
  spreadsheetTitle: string,
  title: string,
  rows: unknown[][],
  purpose: SheetPurpose,
): SheetHeaderLocation | null {
  const normalizeHeader = (value: unknown) => normalizePersonName(value);
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex++) {
    const rawHeaders = rows[rowIndex] ?? [];
    const headers = rawHeaders.map((value) => String(value ?? "").trim());
    const normalized = rawHeaders.map(normalizeHeader);
    const find = (...candidates: string[]) =>
      normalized.findIndex((value) => candidates.some((candidate) => value === candidate || value.includes(candidate)));
    if (purpose === "registration") {
      const firstNameColumn = find("שםפרטי", "firstname", "givenname");
      const lastNameColumn = find("שםמשפחה", "lastname", "surname");
      const idColumn = find("תעודתזהות", "מספרזהות", "מספרתעודתזהות", "תז");
      if (firstNameColumn >= 0 && lastNameColumn >= 0 && idColumn >= 0) {
        return {
          spreadsheetTitle, title, headerRowIndex: rowIndex, headers,
          firstNameColumn, lastNameColumn, idColumn,
          vaadColumn: find("ועד", "מספרועד"),
          dateColumn: find("תאריךרישום", "תאריך"),
        };
      }
    } else {
      const nameColumn = normalized.findIndex((value) =>
        value === "שם" || value === "שםמלא" || value === "שםהתלמיד" || value === "studentname" || value === "fullname",
      );
      const institutionColumn = find("קודמוסד", "institutioncode");
      const phonePasswordColumn = find("סיסמתמרכז", "סיסמתמרכזייה", "phonepassword");
      if (nameColumn >= 0 && institutionColumn >= 0 && phonePasswordColumn >= 0) {
        return { spreadsheetTitle, title, headerRowIndex: rowIndex, headers, nameColumn };
      }
    }
  }
  return null;
}

async function findSheetHeaderLocation(t: SheetsTarget, purpose: SheetPurpose): Promise<SheetHeaderLocation> {
  if (t.method === "webhook") {
    throw new Error("הפעולה הזו דורשת גישה ישירה ל-Google Sheets API דרך חשבון Google מורשה.");
  }
  const info = await getSheetInfo(t);
  const tabs = info.sheets.length ? info.sheets : [info.firstSheetTitle];
  for (const title of tabs) {
    const data = await sheetsRequest<{ values?: unknown[][] }>(
      t,
      "/values/" + encodeURIComponent(sheetRange(title, "A1:ZZ12")),
    );
    const location = findHeaderLocation(info.title, title, data.values ?? [], purpose);
    if (location) return location;
  }
  if (purpose === "registration") {
    throw new Error('לא נמצאה לשונית רישום עם כותרות "שם פרטי", "שם משפחה" ו"תעודת זהות". ודא שהכותרות קיימות בגיליון הרישום.');
  }
  throw new Error('לא נמצאה לשונית קודים עם הכותרות "שם", "קוד מוסד" ו"סיסמת מרכזייה".');
}

function columnLabel(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function cleanIdCell(value: unknown): string {
  return String(value ?? "").trim().replace(/^'/, "").replace(/\D/g, "");
}

export interface ExistingRegistration {
  exists: boolean;
  studentName?: string;
  firstName?: string;
  lastName?: string;
  rowNumber?: number;
}

/** בודק אם ת.ז. כבר רשומה: עמודה C (או B כגיבוי) */
export async function checkExistingRegistration(
  t: SheetsTarget,
  idNumber: string,
): Promise<ExistingRegistration> {
  const cleanId = String(idNumber).replace(/\D/g, "");
  if (t.method === "webhook") {
    const d = await webhookCall<ExistingRegistration>(t.webhookUrl, {
      action: "check",
      spreadsheetId: t.spreadsheetId,
      idNumber: cleanId,
    });
    return {
      exists: Boolean(d.exists),
      studentName: d.studentName || undefined,
      firstName: d.firstName || undefined,
      lastName: d.lastName || undefined,
      rowNumber: typeof d.rowNumber === "number" ? d.rowNumber : undefined,
    };
  }

  const location = await findSheetHeaderLocation(t, "registration");
  const data = await sheetsRequest<{ values?: unknown[][] }>(
    t,
    "/values/" + encodeURIComponent(sheetRange(location.title, "A1:ZZ10000")),
  );
  const rows = data.values ?? [];
  for (let i = location.headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (cleanIdCell(row[location.idColumn!]) !== cleanId) continue;
    const firstName = String(row[location.firstNameColumn!] ?? "").trim().replace(/^'/, "");
    const lastName = String(row[location.lastNameColumn!] ?? "").trim().replace(/^'/, "");
    return {
      exists: true,
      studentName: (firstName + " " + lastName).trim() || undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      rowNumber: i + 1,
    };
  }
  return { exists: false };
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
  const fullName = p.firstName + " " + p.lastName;

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
      message: 'התלמיד "' + fullName + '" נרשם בהצלחה בגיליון Google Sheets',
      updatedRange: d.updatedRange,
    };
  }

  const location = await findSheetHeaderLocation(t, "registration");
  const range = sheetRange(location.title, "A1:ZZ10000");
  const data = await sheetsRequest<{ values?: unknown[][] }>(
    t,
    "/values/" + encodeURIComponent(range),
  );
  const rows = data.values ?? [];
  const idColumn = location.idColumn!;
  const firstColumn = location.firstNameColumn!;
  const lastColumn = location.lastNameColumn!;
  const vaadColumn = location.vaadColumn;
  const dateColumn = location.dateColumn;
  const cleanId = String(p.idNumber).replace(/\D/g, "");

  // If the ID has an incomplete row, complete it instead of adding a duplicate.
  for (let i = location.headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (cleanIdCell(row[idColumn]) !== cleanId) continue;
    const rowNumber = i + 1;
    const oldFirst = String(row[firstColumn] ?? "").trim();
    const oldLast = String(row[lastColumn] ?? "").trim();
    const normalize = (value: string) => normalizePersonName(value);
    if (oldFirst && oldLast) {
      throw new Error("תעודת הזהות כבר רשומה בשם " + (oldFirst + " " + oldLast).trim() + ". לא נוצר רישום כפול.");
    }
    if (oldFirst && normalize(oldFirst) !== normalize(p.firstName)) {
      throw new Error("תעודת הזהות קיימת עם שם פרטי אחר. יש לבדוק את הרשומה לפני שינוי.");
    }
    if (oldLast && normalize(oldLast) !== normalize(p.lastName)) {
      throw new Error("תעודת הזהות קיימת עם שם משפחה אחר. יש לבדוק את הרשומה לפני שינוי.");
    }
    const updates: Array<{ col: number; value: string }> = [];
    if (!oldFirst) updates.push({ col: firstColumn, value: p.firstName });
    if (!oldLast) updates.push({ col: lastColumn, value: p.lastName });
    if (vaadColumn !== undefined && !String(row[vaadColumn] ?? "").trim()) {
      updates.push({ col: vaadColumn, value: String(p.vaad) });
    }
    if (dateColumn !== undefined && !String(row[dateColumn] ?? "").trim()) {
      updates.push({ col: dateColumn, value: timestamp });
    }
    for (const update of updates) {
      const cellRange = sheetRange(location.title, columnLabel(update.col) + rowNumber);
      await sheetsRequest(
        t,
        "/values/" + encodeURIComponent(cellRange) + "?valueInputOption=RAW",
        {
          method: "PUT",
          body: JSON.stringify({ range: cellRange, majorDimension: "ROWS", values: [[update.value]] }),
        },
      );
    }
    const maxUpdatedCol = Math.max(...updates.map((u) => u.col), idColumn);
    return {
      success: true,
      message: 'הושלמה רשומת התלמיד "' + fullName + '" בגיליון הרישום הקיים',
      updatedRange: location.title + "!A" + rowNumber + ":" + columnLabel(maxUpdatedCol) + rowNumber,
    };
  }

  const maxColumn = Math.max(
    firstColumn, lastColumn, idColumn,
    vaadColumn ?? -1, dateColumn ?? -1,
  );
  const values = Array.from({ length: maxColumn + 1 }, () => "");
  values[firstColumn] = p.firstName;
  values[lastColumn] = p.lastName;
  values[idColumn] = p.idNumber;
  if (vaadColumn !== undefined) values[vaadColumn] = String(p.vaad);
  if (dateColumn !== undefined) values[dateColumn] = timestamp;

  // Append below the detected registration header; never append to the code tab.
  const appendRange = sheetRange(location.title, "A" + (location.headerRowIndex + 2) + ":ZZ");
  const result = await sheetsRequest<{ updates?: { updatedRange?: string } }>(
    t,
    "/values/" + encodeURIComponent(appendRange) + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
    {
      method: "POST",
      body: JSON.stringify({
        range: appendRange,
        majorDimension: "ROWS",
        values: [values],
      }),
    },
  );

  return {
    success: true,
    message: 'התלמיד "' + fullName + '" נרשם בהצלחה בגיליון הרישום',
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


/* ------------------------------------------------------------------ */
/* חיפוש קוד אישי בגיליון הנתונים השני                                 */
/* ------------------------------------------------------------------ */

export const PERSONAL_CODE_LOOKUP_SPREADSHEET_ID = "1USjVzJgyDmHfaAnN6MYJ9qrqlh3qhWclgdJ1LDF7UTk";

export interface PersonalCodeSheetRow {
  found: boolean;
  sheetTitle: string;
  tabName: string;
  rowNumber?: number;
  headers: string[];
  values: string[];
}

function normalizePersonName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("he-IL")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[׳״"'.,\-_/\\()[\]{}:;]+/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export async function findPersonalCodeRowByName(
  firstName: string,
  lastName: string,
): Promise<PersonalCodeSheetRow> {
  // Use the workbook selected in settings so registration and code lookup always
  // point to the same workbook, including when the administrator changes its ID.
  const target = await resolveTarget({ webhookUrl: "" });
  if (!target || target.method === "webhook") {
    throw new Error("אין חיבור Google פעיל לקריאת גיליון החיפוש. יש להגדיר חשבון שירות ולשתף איתו את הגיליון השני.");
  }

  const location = await findSheetHeaderLocation(target, "codes");
  const data = await sheetsRequest<{ values?: unknown[][] }>(
    target,
    "/values/" + encodeURIComponent(sheetRange(location.title, "A1:ZZ10000")),
  );
  const rows = data.values ?? [];
  const headers = location.headers;
  const blank: PersonalCodeSheetRow = {
    found: false,
    sheetTitle: location.spreadsheetTitle,
    tabName: location.title,
    headers,
    values: [],
  };

  const nameTokens = (value: unknown): string[] =>
    String(value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase("he-IL")
      .replace(/[\u0591-\u05C7]/g, "")
      .replace(/[״׳"'.,\-_/\\()[\]{}:;]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "he"));
  const expected = nameTokens(firstName + " " + lastName).join("|");
  if (!nameTokens(firstName).length || !nameTokens(lastName).length) {
    throw new Error("חובה להזין שם פרטי ושם משפחה כדי לחפש קוד אישי.");
  }

  for (let i = location.headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    // The code tab stores the full name in one cell and may list family name first.
    if (nameTokens(row[location.nameColumn!]).join("|") !== expected) continue;
    const width = Math.max(headers.length, row.length);
    const completedHeaders = Array.from({ length: width }, (_, index) =>
      headers[index] || ("עמודה " + columnLabel(index)),
    );
    const values = Array.from({ length: width }, (_, index) => String(row[index] ?? "").trim());
    return {
      found: true,
      sheetTitle: location.spreadsheetTitle,
      tabName: location.title,
      rowNumber: i + 1,
      headers: completedHeaders,
      values,
    };
  }
  return { ...blank, headers: headers.map((value, index) => value || ("עמודה " + columnLabel(index))) };
}
