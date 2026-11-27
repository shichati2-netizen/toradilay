import type {
  GoogleAuthStatus,
  KioskConfig,
  KioskFile,
  RegistrationPayload,
  RegistrationStatus,
  RemovableDrive,
  SearchResponse,
  TranscriptionDriveFile,
  SheetsMethod,
  StatsResponse,
} from "@/lib/types";

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function searchStudent(studentId: string): Promise<SearchResponse> {
  const res = await fetch("/api/drive/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId }),
  });
  try {
    return await json<SearchResponse>(res);
  } catch {
    return { found: false, message: "שגיאה בחיפוש. אנא נסה שוב." };
  }
}

export async function fetchPreview(
  fileId: string,
  mode: "thumb" | "full",
): Promise<{ html: string; fallback: boolean }> {
  const res = await fetch(
    `/api/drive/preview?fileId=${encodeURIComponent(fileId)}&mode=${mode}`,
  );
  const data = await json<{ html?: string; fallback?: boolean; error?: string }>(res);
  if (!res.ok || !data.html) throw new Error(data.error || "שגיאה בטעינת המסמך");
  return { html: data.html, fallback: Boolean(data.fallback) };
}

export async function copyHandwritingFile(file: TranscriptionDriveFile, studentId: string): Promise<CopyResult> {
  try {
    const res = await fetch("/api/transcription/handwriting-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: file.id, fileName: file.name, studentId }),
    });
    return await json<CopyResult>(res);
  } catch {
    return { success: false, mode: "server", message: "ההעתקה נכשלה. אנא נסה שוב." };
  }
}

export interface CopyResult {
  success: boolean;
  mode: "server" | "download";
  message: string;
  path?: string;
}

export async function copyFile(
  file: KioskFile,
  studentId: string,
): Promise<CopyResult> {
  try {
    const res = await fetch("/api/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: file.id, fileName: file.name, studentId }),
    });
    const data = await json<CopyResult>(res);
    if (data.success && data.mode === "download") {
      triggerDownload(file);
      return { ...data, message: `הקובץ "${file.name}" הורד למחשב` };
    }
    return data;
  } catch {
    return { success: false, mode: "server", message: "ההעתקה נכשלה. אנא נסה שוב." };
  }
}

export function triggerDownload(file: KioskFile) {
  const a = document.createElement("a");
  a.href = `/api/drive/download?fileId=${encodeURIComponent(file.id)}&name=${encodeURIComponent(file.name)}`;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function logClientActivity(entry: {
  type: "print" | "exit";
  studentId?: string;
  fileName?: string;
  success?: boolean;
  detail?: string;
}) {
  fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  }).catch(() => {});
}

export async function adminLogin(
  pin: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    return await json<{ ok: boolean; error?: string }>(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת" };
  }
}

export async function saveSettings(
  pin: string,
  config: KioskConfig,
  extra: { newPin?: string; sheetsWebhookUrl?: string } = {},
): Promise<{ ok: boolean; config?: KioskConfig; error?: string }> {
  try {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, config, ...extra }),
    });
    return await json<{ ok: boolean; config?: KioskConfig; error?: string }>(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת" };
  }
}

export async function fetchStats(pin: string): Promise<StatsResponse | null> {
  try {
    const res = await fetch("/api/stats", { headers: { "x-admin-pin": pin } });
    if (!res.ok) return null;
    return await json<StatsResponse>(res);
  } catch {
    return null;
  }
}

export async function fetchRemovableDrives(): Promise<{
  drives: RemovableDrive[];
  isWindows: boolean;
}> {
  try {
    const res = await fetch("/api/removable-drives");
    return await json<{ drives: RemovableDrive[]; isWindows: boolean }>(res);
  } catch {
    return { drives: [], isWindows: false };
  }
}

/* ------------------------------ רישום תלמידים ------------------------------ */

export async function fetchRegistrationStatus(pin?: string): Promise<RegistrationStatus | null> {
  try {
    const res = await fetch("/api/register/status", {
      headers: pin ? { "x-admin-pin": pin } : undefined,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await json<RegistrationStatus>(res);
  } catch {
    return null;
  }
}

export async function checkRegistration(idNumber: string): Promise<{
  exists: boolean;
  studentName?: string;
  firstName?: string;
  lastName?: string;
  rowNumber?: number;
  source?: "sheets" | "local-csv";
  error?: string;
  code?: string;
}> {
  try {
    const res = await fetch("/api/register/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idNumber }),
    });
    return await json(res);
  } catch {
    return { exists: false, error: "שגיאת תקשורת" };
  }
}

export async function registerStudentApi(
  payload: RegistrationPayload,
): Promise<{ success: boolean; duplicate?: boolean; studentName?: string; firstName?: string; lastName?: string; message?: string; error?: string; code?: string }> {
  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await json(res);
  } catch {
    return { success: false, error: "שגיאת תקשורת. אנא נסה שוב." };
  }
}

export async function testSheetsConnection(
  pin: string,
  spreadsheetId: string,
  webhookUrl: string,
): Promise<{
  ok: boolean;
  method?: SheetsMethod;
  ms?: number;
  title?: string;
  sheets?: string[];
  firstSheetTitle?: string;
  rowCount?: number;
  error?: string;
}> {
  try {
    const res = await fetch("/api/register/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, spreadsheetId, webhookUrl }),
    });
    return await json(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת" };
  }
}

export async function testDriveFolder(
  pin: string,
  rootFolderId: string,
): Promise<{
  ok: boolean;
  authMode?: "oauth" | "service-account" | "public";
  ms?: number;
  folderCount?: number;
  fileCount?: number;
  sample?: string[];
  error?: string;
}> {
  try {
    const res = await fetch("/api/drive/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, rootFolderId }),
    });
    return await json(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת" };
  }
}

export async function saveTranscriptionHandwritingDriveAccountApi(
  pin: string,
  payload: { json?: string; clear?: boolean },
): Promise<{ ok: boolean; settings?: import("@/lib/types").TranscriptionSettings; error?: string }> {
  try {
    const res = await fetch("/api/transcription/handwriting-drive-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, ...payload }),
    });
    return await json(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת בשמירת חשבון הגישה לכתב היד." };
  }
}

export async function testTranscriptionHandwritingDriveAccessApi(
  pin: string,
  rootFolderId: string,
): Promise<{
  ok: boolean;
  authMode?: "oauth" | "service-account" | "public";
  accountEmail?: string;
  dedicatedAccount?: boolean;
  folderCount?: number;
  fileCount?: number;
  sample?: string[];
  ms?: number;
  error?: string;
}> {
  try {
    const res = await fetch("/api/transcription/handwriting-drive-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, rootFolderId }),
    });
    return await json(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת בבדיקת הגישה לתיקיית כתב היד." };
  }
}

/* ------------------------------ חשבון Google קבוע (OAuth) ------------------------------ */

export async function fetchGoogleAuthStatus(pin: string): Promise<GoogleAuthStatus | null> {
  try {
    const res = await fetch("/api/google/status", {
      headers: { "x-admin-pin": pin },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await json<GoogleAuthStatus>(res);
  } catch {
    return null;
  }
}

export async function saveGoogleServiceAccountJsonApi(
  pin: string,
  payload: { json?: string; clear?: boolean },
): Promise<{ ok: boolean; status?: GoogleAuthStatus; error?: string }> {
  try {
    const res = await fetch("/api/google/service-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, ...payload }),
    });
    return await json(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת" };
  }
}

export async function saveGoogleClientApi(
  pin: string,
  payload: {
    clear?: boolean;
    clientSecretJson?: string;
    clientId?: string;
    clientSecret?: string;
    clientType?: "web" | "installed";
    redirectUriOverride?: string;
  },
): Promise<{ ok: boolean; status?: GoogleAuthStatus; error?: string }> {
  try {
    const res = await fetch("/api/google/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, ...payload }),
    });
    return await json(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת" };
  }
}

export async function startGoogleLoginApi(
  pin: string,
  origin: string,
  client?: {
    clientId?: string;
    clientSecret?: string;
    clientType?: "web" | "installed";
    redirectUriOverride?: string;
  },
): Promise<{
  ok: boolean;
  authUrl?: string;
  redirectUri?: string;
  needsManualCallbackPaste?: boolean;
  error?: string;
}> {
  try {
    const res = await fetch("/api/google/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, origin, client }),
    });
    return await json(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת" };
  }
}

export async function completeGoogleLoginManualApi(
  pin: string,
  callbackUrlOrCode: string,
  origin: string,
): Promise<{ ok: boolean; status?: GoogleAuthStatus; error?: string }> {
  try {
    const res = await fetch("/api/google/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, callbackUrlOrCode, origin }),
    });
    return await json(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת" };
  }
}

export async function saveGoogleFirebaseTokenApi(
  pin: string,
  accessToken: string,
): Promise<{ ok: boolean; status?: GoogleAuthStatus; error?: string }> {
  try {
    const res = await fetch("/api/google/firebase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, accessToken }),
    });
    return await json(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת" };
  }
}

export async function disconnectGoogleAccountApi(
  pin: string,
): Promise<{ ok: boolean; status?: GoogleAuthStatus; error?: string }> {
  try {
    const res = await fetch("/api/google/account", {
      method: "DELETE",
      headers: { "x-admin-pin": pin },
    });
    return await json(res);
  } catch {
    return { ok: false, error: "שגיאת תקשורת" };
  }
}


export interface PersonalCodeLookupResult {
  found: boolean;
  matchedName?: string;
  personalCode?: string;
  error?: string;
  code?: string;
}

/**
 * מחפש לפי שם בלבד. תעודת זהות לא נשלחת לפונקציה או לשרת.
 */
export async function lookupPersonalCode(
  firstName: string,
  lastName: string,
): Promise<PersonalCodeLookupResult> {
  try {
    const res = await fetch("/api/personal-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName }),
      cache: "no-store",
    });
    const data = await json<PersonalCodeLookupResult>(res);
    if (!res.ok && !data.error) return { found: false, error: "החיפוש נכשל. אנא נסה שוב." };
    return data;
  } catch {
    return { found: false, error: "שגיאת תקשורת בחיפוש הקוד האישי." };
  }
}


export interface TranscriptionAccess {
  enabled: boolean;
  allowed: boolean;
  handwritingAllowed?: boolean;
  handwritingRestricted?: boolean;
}
export interface TranscriptionBrowseResult {
  drives: Array<{ letter: string; name: string }>;
  folders: Array<{ name: string; relativePath: string }>;
  files: Array<{ token: string; name: string; size: number; modifiedAt: string }>;
  relativePath: string;
  error?: string;
}
export interface TranscriptionStatusItem {
  id: string;
  kind: "audio" | "handwriting";
  model: "model1" | "model2";
  createdAt: string;
  status: "pending" | "completed" | "failed";
  fileNames: string[];
  failureReason?: string;
}
export async function fetchTranscriptionAccess(studentId: string): Promise<TranscriptionAccess> {
  try {
    const res = await fetch("/api/transcription/access", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }), cache: "no-store",
    });
    return await json<TranscriptionAccess>(res);
  } catch { return { enabled: false, allowed: false }; }
}

export interface HandwritingFolderLookup {
  needsAssociation: boolean;
  studentName?: string;
  folderId?: string;
  files?: TranscriptionDriveFile[];
  folderMissing?: boolean;
  message?: string;
  error?: string;
}
export async function fetchHandwritingFolderApi(studentId: string): Promise<HandwritingFolderLookup> {
  try {
    const res = await fetch("/api/transcription/handwriting-folder?studentId=" + encodeURIComponent(studentId), {
      cache: "no-store",
    });
    const data = await json<HandwritingFolderLookup>(res);
    if (!res.ok) return { needsAssociation: false, error: data.error || "לא ניתן לטעון את תיקיית כתב היד." };
    return data;
  } catch {
    return { needsAssociation: false, error: "שגיאת תקשורת בטעינת תיקיית כתב היד." };
  }
}
export async function saveHandwritingAssociationApi(
  studentId: string,
  fullName: string,
): Promise<{
  ok: boolean;
  folderId?: string;
  files?: TranscriptionDriveFile[];
  folderMissing?: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch("/api/transcription/handwriting-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, fullName }),
    });
    const data = await json<{
      ok?: boolean;
      folderId?: string;
      files?: TranscriptionDriveFile[];
      folderMissing?: boolean;
      message?: string;
      error?: string;
    }>(res);
    return {
      ok: res.ok && data.ok === true,
      folderId: data.folderId,
      files: data.files ?? [],
      folderMissing: data.folderMissing,
      message: data.message,
      error: data.error,
    };
  } catch {
    return { ok: false, error: "שגיאת תקשורת בשמירת השיוך." };
  }
}

export async function fetchTranscriptionStatus(studentId: string): Promise<TranscriptionStatusItem[]> {
  try {
    const res = await fetch("/api/transcription/status?studentId=" + encodeURIComponent(studentId), { cache: "no-store" });
    if (!res.ok) return [];
    const data = await json<{ items?: TranscriptionStatusItem[] }>(res);
    return Array.isArray(data.items) ? data.items : [];
  } catch { return []; }
}
export async function browseTranscriptionFiles(
  studentId: string, kind: "audio" | "handwriting", drive?: string, relativePath = "",
): Promise<TranscriptionBrowseResult> {
  const params = new URLSearchParams({ studentId, kind });
  if (drive) params.set("drive", drive);
  if (relativePath) params.set("path", relativePath);
  const res = await fetch("/api/transcription/browse?" + params.toString(), { cache: "no-store" });
  const data = await json<TranscriptionBrowseResult>(res);
  if (!res.ok) throw new Error(data.error || "לא ניתן להציג את הקבצים בכונן.");
  return data;
}
export async function sendTranscriptionFiles(payload: {
  studentId: string; folderId: string; folderName: string; source?: "drive" | "local";
  kind: "audio" | "handwriting"; fileTokens: string[];
}): Promise<{ ok: boolean; requestId?: string; fileNames?: string[]; error?: string }> {
  try {
    const res = await fetch("/api/transcription/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    return await json(res);
  } catch { return { ok: false, error: "שגיאת תקשורת בעת שליחת הקבצים." }; }
}
export async function fetchTranscriptionSettingsApi(pin: string): Promise<{
  settings?: import("@/lib/types").TranscriptionSettings; error?: string;
}> {
  try {
    const res = await fetch("/api/transcription/settings", { headers: { "x-admin-pin": pin }, cache: "no-store" });
    return await json(res);
  } catch { return { error: "שגיאת תקשורת בטעינת הגדרות התמלול." }; }
}
export async function saveTranscriptionSettingsApi(
  pin: string, settings: import("@/lib/types").TranscriptionSettingsInput,
): Promise<{ ok: boolean; settings?: import("@/lib/types").TranscriptionSettings; error?: string }> {
  try {
    const res = await fetch("/api/transcription/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, settings }),
    });
    return await json(res);
  } catch { return { ok: false, error: "שגיאת תקשורת בשמירת הגדרות התמלול." }; }
}
