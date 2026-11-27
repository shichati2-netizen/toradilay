import vm from "node:vm";
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { KioskFile, KioskFolder } from "@/lib/types";
import { getGoogleAuthToken } from "./google-oauth";
import { getServiceAccountToken, loadServiceAccount, parseServiceAccountJson } from "./sheets";

const nodeRequire = createRequire(import.meta.url);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept-Language": "he,en-US;q=0.9,en;q=0.8",
};

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

function getDriveApiBase(): string {
  return process.env.GOOGLE_DRIVE_API_BASE || "https://www.googleapis.com/drive/v3";
}

function getDrivePublicBase(): string {
  return process.env.GOOGLE_DRIVE_PUBLIC_BASE || "https://drive.google.com";
}

export type DriveAuthMode = "oauth" | "service-account" | "public";

/* ------------------------------------------------------------------ */
/* מצב משותף בין בקשות (נשמר על globalThis כדי לשרוד טעינות מחדש)     */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  buffer: Buffer;
  fullHtml?: string;
  ts: number;
}

interface FolderCacheEntry {
  ts: number;
  ok: boolean;
  folders: KioskFolder[];
  files: DriveItem[];
  authMode?: DriveAuthMode;
}

interface LocalEntry {
  path: string;
  name: string;
}

interface DriveState {
  fileCache: Map<string, CacheEntry>;
  folderCache: Map<string, FolderCacheEntry>;
  meta: Map<string, { name: string; mimeType: string }>;
  localFiles: Map<string, LocalEntry>;
}

const g = globalThis as typeof globalThis & { __kioskDriveState?: DriveState };
const state: DriveState = (g.__kioskDriveState ??= {
  fileCache: new Map(),
  folderCache: new Map(),
  meta: new Map(),
  localFiles: new Map(),
});

const FILE_CACHE_MAX = 20;
const FILE_CACHE_TTL = 10 * 60 * 1000;
const FOLDER_CACHE_TTL = 15 * 1000;
const MAX_CACHED_BYTES = 30 * 1024 * 1024;

export function clearDriveCaches(): void {
  state.folderCache.clear();
}

/* ------------------------------------------------------------------ */
/* עזרים                                                              */
/* ------------------------------------------------------------------ */

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
}

export function isWordItem(name: string, mimeType: string): boolean {
  const lower = name.toLowerCase();
  return (
    mimeType === DOCX_MIME ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.google-apps.document" ||
    lower.endsWith(".docx") ||
    lower.endsWith(".doc")
  );
}

export function toKioskFile(item: DriveItem): KioskFile {
  state.meta.set(item.id, { name: item.name, mimeType: item.mimeType });
  return {
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    modifiedTime: item.modifiedTime,
    isWordDoc: isWordItem(item.name, item.mimeType),
  };
}

/** מאתר טוקן גישה ל-Google Drive API (חשבון Google מחובר או חשבון שירות) */
async function resolveDriveAuth(serviceAccountJson?: string): Promise<{
  token: string;
  mode: "oauth" | "service-account";
  identity: string;
} | null> {
  // חשבון ייעודי לכתב היד גובר על חשבון Google הכללי, כדי לבודד הרשאות.
  if (serviceAccountJson?.trim()) {
    const dedicated = parseServiceAccountJson(serviceAccountJson);
    if (!dedicated) throw new Error("פרטי חשבון הגישה הייעודי לכתב היד אינם תקינים.");
    const token = await getServiceAccountToken(dedicated, DRIVE_READ_SCOPE);
    return { token, mode: "service-account", identity: dedicated.client_email };
  }
  const oauth = await getGoogleAuthToken();
  if (oauth) {
    return { token: oauth.token, mode: "oauth", identity: oauth.email };
  }
  const sa = loadServiceAccount();
  if (sa) {
    const token = await getServiceAccountToken(sa, DRIVE_READ_SCOPE);
    return { token, mode: "service-account", identity: sa.client_email };
  }
  return null;
}

interface DriveApiFileEntry {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string | number;
  modifiedTime?: string;
  shortcutDetails?: {
    targetId?: string;
    targetMimeType?: string;
  };
}

/** קריאת תיקייה דרך Google Drive API v3 הרשמי — עובד גם על תיקיות פרטיות ומשותפות! */
async function listFolderViaApi(
  folderId: string,
  token: string,
  identity: string,
): Promise<{ folders: KioskFolder[]; files: DriveItem[] }> {
  if (!/^[A-Za-z0-9_-]{5,120}$/.test(folderId)) {
    throw new Error("מזהה תיקייה לא תקין");
  }

  const folders: KioskFolder[] = [];
  const files: DriveItem[] = [];
  const seen = new Set<string>();
  let pageToken = "";

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,shortcutDetails)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${getDriveApiBase()}/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        msg = j.error?.message || msg;
      } catch {
        /* ignore */
      }
      if (res.status === 404 || res.status === 403) {
        throw new Error(
          `אין הרשאת גישה לתיקייה ${folderId} עם החשבון ${identity}. ודא שהתיקייה שייכת לחשבון זה או משותפת איתו.`,
        );
      }
      throw new Error(`שגיאה בקריאת תיקייה מ-Google Drive API: ${msg}`);
    }

    const data = (await res.json()) as {
      nextPageToken?: string;
      files?: DriveApiFileEntry[];
    };

    for (const item of data.files ?? []) {
      const isShortcut = item.mimeType === "application/vnd.google-apps.shortcut";
      const effectiveId = (
        isShortcut ? item.shortcutDetails?.targetId : item.id
      )?.trim();
      const effectiveMime = (
        isShortcut ? item.shortcutDetails?.targetMimeType : item.mimeType
      )?.trim();
      const name = String(item.name ?? "").trim();

      if (!effectiveId || !effectiveMime || seen.has(effectiveId) || effectiveId === folderId) {
        continue;
      }
      seen.add(effectiveId);

      if (effectiveMime === "application/vnd.google-apps.folder") {
        folders.push({ id: effectiveId, name });
      } else {
        const numericSize =
          item.size !== undefined && item.size !== null ? Number(item.size) : undefined;
        files.push({
          id: effectiveId,
          name,
          mimeType: effectiveMime,
          size: Number.isFinite(numericSize) ? numericSize : undefined,
          modifiedTime: item.modifiedTime || undefined,
        });
      }
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return { folders, files };
}

/** מפענח את מצב הדף ש-Google Drive מטמיע ב-HTML של תיקייה ציבורית */
function decodeDriveIvd(html: string): unknown[] {
  const match = html.match(/window\['_DRIVE_ivd'\]\s*=\s*'([^']+)'/);
  if (!match) return [];
  try {
    const innerJs = vm.runInNewContext('"' + match[1].replace(/"/g, '\\"') + '"');
    const data = vm.runInNewContext("(" + innerJs + ")");
    if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
    return [];
  } catch (err) {
    console.error("[drive] failed to decode _DRIVE_ivd:", err);
    return [];
  }
}

/**
 * קורא תיקייה ב-Google Drive:
 * - אם מחובר חשבון Google (OAuth או חשבון שירות): ניגש דרך Google Drive API v3 הרשמי (תומך גם בתיקיות פרטיות!).
 * - אם לא מחובר (או אם התיקייה ציבורית מחשבון אחר): מבצע קריאה ציבורית אוטומטית.
 */
export async function scrapeFolder(
  folderId: string,
  opts: { fresh?: boolean; serviceAccountJson?: string } = {},
): Promise<{
  ok: boolean;
  folders: KioskFolder[];
  files: DriveItem[];
  authMode?: DriveAuthMode;
  authError?: string;
}> {
  const cached = state.folderCache.get(folderId);
  if (!opts.fresh && cached && Date.now() - cached.ts < FOLDER_CACHE_TTL) {
    return {
      ok: cached.ok,
      folders: cached.folders,
      files: cached.files,
      authMode: cached.authMode,
    };
  }

  let authError: string | undefined;

  // 1. ניסיון ראשון: Google Drive API v3 מאומת (עובד גם כשהתיקייה פרטית לחלוטין)
  try {
    const auth = await resolveDriveAuth(opts.serviceAccountJson);
    if (auth) {
      const apiRes = await listFolderViaApi(folderId, auth.token, auth.identity);
      state.folderCache.set(folderId, {
        ts: Date.now(),
        ok: true,
        folders: apiRes.folders,
        files: apiRes.files,
        authMode: auth.mode,
      });
      return {
        ok: true,
        folders: apiRes.folders,
        files: apiRes.files,
        authMode: auth.mode,
      };
    }
  } catch (err) {
    authError = err instanceof Error ? err.message : "שגיאה בגישה מאומתת לדרייב";
    console.warn("[drive] authenticated API call failed, trying public fallback:", authError);
  }

  // 2. גיבוי / ללא חשבון: קריאת תיקייה ציבורית
  const folders: KioskFolder[] = [];
  const files: DriveItem[] = [];
  const seen = new Set<string>();
  let ok = false;

  try {
    const res = await fetch(`${getDrivePublicBase()}/drive/folders/${folderId}`, {
      headers: { ...BASE_HEADERS, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      // ודא שלא הוחזר עמוד התחברות של Google עבור תיקייה פרטית
      const isSignInWall =
        html.includes("accounts.google.com/ServiceLogin") && !html.includes("_DRIVE_ivd");
      if (!isSignInWall) {
        ok = true;
        for (const raw of decodeDriveIvd(html)) {
          if (!Array.isArray(raw) || raw.length < 4) continue;
          const id = String(raw[0] ?? "");
          const name = String(raw[2] ?? "").trim();
          const mimeType = String(raw[3] ?? "");
          if (!id || seen.has(id) || id === folderId) continue;
          seen.add(id);

          if (mimeType === "application/vnd.google-apps.folder") {
            folders.push({ id, name });
          } else {
            files.push({
              id,
              name,
              mimeType,
              size: typeof raw[13] === "number" ? raw[13] : undefined,
              modifiedTime:
                typeof raw[10] === "number"
                  ? new Date(raw[10]).toISOString()
                  : undefined,
            });
          }
        }
      }
    } else {
      console.warn(`[drive] folder ${folderId} returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.error("[drive] public scrape failed:", err);
  }

  if (ok) {
    state.folderCache.set(folderId, {
      ts: Date.now(),
      ok,
      folders,
      files,
      authMode: "public",
    });
  }
  return { ok, folders, files, authMode: ok ? "public" : undefined, authError };
}

/** מנרמל שם לצורך התאמה גם כשהתיקייה כוללת רווחים, מקפים או סוגריים. */
export function normalizeFolderName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("he-IL").replace(/[^\p{L}\p{N}]/gu, "");
}

/** חיפוש תיקיית תלמיד: קודם תעודת זהות, אחר כך השם שנשמר בקובץ הרישומים המקומי. */
export function matchStudentFolder(
  folders: KioskFolder[],
  cleanId: string,
  studentName?: string,
): KioskFolder | undefined {
  const byId =
    folders.find((f) => f.name.trim() === cleanId) ||
    folders.find((f) => f.name.trim().startsWith(cleanId)) ||
    folders.find((f) => f.name.includes(cleanId));
  if (byId) return byId;

  const parts = String(studentName ?? "").trim().split(/\s+/).filter(Boolean);
  const nameKeys = [...new Set([
    normalizeFolderName(studentName ?? ""),
    normalizeFolderName(parts.slice().reverse().join(" ")),
  ])].filter((key) => key.length >= 4);

  if (nameKeys.length === 0) return undefined;
  return (
    folders.find((folder) => {
      const key = normalizeFolderName(folder.name);
      return nameKeys.some((candidate) => key === candidate);
    }) ||
    folders.find((folder) => {
      const key = normalizeFolderName(folder.name);
      return nameKeys.some((candidate) => key.includes(candidate));
    })
  );
}

/* ------------------------------------------------------------------ */
/* קבצים מקומיים (מוגדרים רק דרך חיפוש מקומי — מונע גישה לנתיבים זרים) */
/* ------------------------------------------------------------------ */

/** מחזיר רק רשומה שנרשמה בתהליך החיפוש המקומי הנוכחי. */
export function getRegisteredLocalFile(fileId: string): { path: string; name: string } | undefined {
  return state.localFiles.get(fileId);
}

export function registerLocalFile(filePath: string, name: string): string {
  // Never allow a file's numeric size/metadata to be mistaken for a filesystem path.
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new TypeError("נתיב הקובץ המקומי חייב להיות מחרוזת תקינה.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new TypeError("שם הקובץ המקומי חייב להיות מחרוזת תקינה.");
  }
  const token = "local:" + crypto.randomBytes(9).toString("hex");
  state.localFiles.set(token, { path: filePath, name });
  const mimeType = /\\.pdf$/i.test(name)
    ? "application/pdf"
    : /\\.doc$/i.test(name)
      ? "application/msword"
      : DOCX_MIME;
  state.meta.set(token, { name, mimeType });
  if (state.localFiles.size > 500) {
    const first = state.localFiles.keys().next().value;
    if (first) state.localFiles.delete(first);
  }
  return token;
}

/* ------------------------------------------------------------------ */
/* הורדת קובץ                                                         */
/* ------------------------------------------------------------------ */

function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 200).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html");
}

function looksLikeOffice(buf: Buffer): boolean {
  if (buf.length < 8) return false;
  const zip = buf[0] === 0x50 && buf[1] === 0x4b; // DOCX
  const ole = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11; // DOC
  const pdf = buf.subarray(0, 5).toString("ascii") === "%PDF-";
  return zip || ole || pdf;
}

/** הורדת קובץ ישירות דרך Google Drive API v3 (תומך בקבצים פרטיים ובייצוא Google Docs) */
async function downloadViaDriveApi(
  fileId: string,
  token: string,
  knownMimeType?: string,
): Promise<Buffer | null> {
  const base = getDriveApiBase();
  const exportUrl = `${base}/files/${fileId}/export?mimeType=${encodeURIComponent(DOCX_MIME)}`;
  const mediaUrl = `${base}/files/${fileId}?alt=media&supportsAllDrives=true`;

  const candidates =
    knownMimeType === "application/vnd.google-apps.document"
      ? [exportUrl, mediaUrl]
      : [mediaUrl, exportUrl];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 100 && !looksLikeHtml(buf) && looksLikeOffice(buf)) {
        return buf;
      }
    } catch (err) {
      console.warn("[drive] API download attempt failed:", err);
    }
  }
  return null;
}

export async function getFileBuffer(fileId: string): Promise<Buffer> {
  const hit = state.fileCache.get(fileId);
  if (hit && Date.now() - hit.ts < FILE_CACHE_TTL) return hit.buffer;

  let buffer: Buffer | null = null;

  if (typeof fileId !== "string" || !fileId.trim()) {
    throw new TypeError("מזהה הקובץ חייב להיות מחרוזת תקינה.");
  }

  if (fileId.startsWith("local:")) {
    const entry = state.localFiles.get(fileId);
    if (!entry || typeof entry.path !== "string" || !entry.path.trim()) {
      throw new Error("נתיב הקובץ המקומי אינו תקין או שהקובץ כבר אינו זמין. אנא חפש שוב.");
    }
    buffer = await fs.promises.readFile(entry.path);
  } else {
    if (!/^[A-Za-z0-9_-]{5,120}$/.test(fileId)) {
      throw new Error("מזהה קובץ לא תקין");
    }
    const meta = state.meta.get(fileId);

    // 1. הורדה מאומתת דרך Google Drive API v3 (עובד גם כשהקובץ פרטי)
    try {
      const auth = await resolveDriveAuth();
      if (auth) {
        buffer = await downloadViaDriveApi(fileId, auth.token, meta?.mimeType);
      }
    } catch (err) {
      console.warn("[drive] authenticated download failed, trying public fallback:", err);
    }

    // 2. גיבוי ציבורי אם הקובץ לא הורד דרך ה-API
    if (!buffer) {
      const isGoogleDoc = meta?.mimeType === "application/vnd.google-apps.document";
      const pubBase = getDrivePublicBase();
      const urls = [
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
        `${pubBase}/uc?export=download&id=${fileId}&confirm=t`,
        `https://docs.google.com/document/d/${fileId}/export?format=docx`,
      ];
      if (isGoogleDoc) urls.unshift(urls.pop() as string);

      for (const url of urls) {
        try {
          const res = await fetch(url, {
            headers: BASE_HEADERS,
            signal: AbortSignal.timeout(30000),
          });
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 100 && !looksLikeHtml(buf) && looksLikeOffice(buf)) {
            buffer = buf;
            break;
          }
        } catch (err) {
          console.warn("[drive] download attempt failed:", url, err);
        }
      }
    }
  }

  if (!buffer) {
    throw new Error(
      "לא ניתן להוריד את הקובץ מגוגל דרייב. אם התיקייה פרטית — חבר חשבון Google מורשה באזור הניהול.",
    );
  }

  if (buffer.length <= MAX_CACHED_BYTES) {
    state.fileCache.set(fileId, { buffer, ts: Date.now() });
    while (state.fileCache.size > FILE_CACHE_MAX) {
      const oldest = state.fileCache.keys().next().value;
      if (!oldest) break;
      state.fileCache.delete(oldest);
    }
  }
  return buffer;
}

export function getKnownFileName(fileId: string): string | undefined {
  return state.meta.get(fileId)?.name ?? state.localFiles.get(fileId)?.name;
}

/* ------------------------------------------------------------------ */
/* תצוגה מקדימה: המרת וורד ל-HTML                                     */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fallbackHtml(name: string): string {
  return `<div style="text-align:center;padding:24px">
    <div style="font-size:13px;color:#64748b;margin-bottom:12px">בס"ד</div>
    <h2 style="font-size:20px;font-weight:bold;margin-bottom:12px;color:#1e293b">${escapeHtml(name)}</h2>
    <p style="font-size:14px;color:#475569">מסמך וורד מוכן להדפסה ישירה ולהעתקה.</p>
  </div>`;
}

function makeThumbHtml(html: string): string {
  const noImages = html.replace(/<img[^>]*>/gi, "");
  const LIMIT = 4200;
  if (noImages.length <= LIMIT) return noImages;
  const re = /<\/(p|h[1-6]|table|ul|ol|blockquote)>/gi;
  let cut = -1;
  let first = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noImages))) {
    const end = m.index + m[0].length;
    if (first < 0) first = end;
    if (end <= LIMIT) cut = end;
    else break;
  }
  const at = cut > 0 ? cut : first > 0 ? first : LIMIT;
  return noImages.slice(0, at);
}

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function convertPdfToHtml(buffer: Buffer, mode: "thumb" | "full"): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Resolve the packaged worker explicitly. This avoids PDF.js falling back to a
  // relative worker path that does not exist in Next.js/Electron standalone.
  const workerPath = nodeRequire.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  const pageLimit = mode === "thumb" ? 1 : Math.min(pdf.numPages, 30);
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines: Array<{ y: number; text: string }> = [];
      for (const item of textContent.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        const existing = lines.find((line) => Math.abs(line.y - y) <= 3);
        if (existing) existing.text += " " + item.str;
        else lines.push({ y, text: item.str });
      }
      lines.sort((a, b) => b.y - a.y);
      const body = lines.map((line) => "<p>" + escapeHtml(line.text) + "</p>").join("");
      pages.push('<section class="pdf-text-page" dir="auto">' + (body || "<p>לא נמצא טקסט בעמוד זה</p>") + "</section>");
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pages.join("");
}

/** תצוגה מקדימה למסמכי Word ול-PDF. קובצי PDF מפוענחים כנתונים בינאריים ולא כנתיב קובץ. */
export async function getPreviewHtml(
  fileId: string,
  mode: "thumb" | "full",
): Promise<{ html: string; fallback: boolean }> {
  const buffer = await getFileBuffer(fileId);
  const entry = state.fileCache.get(fileId);
  const name = getKnownFileName(fileId) ?? "מסמך";
  const pdf = isPdfBuffer(buffer);

  let full = entry?.fullHtml;
  let usedFallback = false;

  if (!full) {
    try {
      if (pdf) {
        full = await convertPdfToHtml(buffer, mode);
      } else {
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ buffer });
        if (result.value && result.value.trim().length > 0) full = result.value;
      }
    } catch (err) {
      console.warn("[drive] document preview conversion failed:", err);
    }
    if (!full) {
      full = fallbackHtml(name);
      usedFallback = true;
    }
    if (entry && mode === "full") entry.fullHtml = full;
  }

  return {
    html: mode === "thumb" ? makeThumbHtml(full) : full,
    fallback: usedFallback,
  };
}


/** הורדה של קובץ בינארי מדרייב (למשל PDF סרוק), עם חשבון השירות הייעודי לפי הצורך. */
export async function getRawDriveFileBuffer(
  fileId: string,
  serviceAccountJson?: string,
  knownMimeType?: string,
): Promise<Buffer> {
  if (!/^[A-Za-z0-9_-]{5,120}$/.test(fileId)) {
    throw new Error("מזהה קובץ לא תקין.");
  }
  const auth = await resolveDriveAuth(serviceAccountJson);
  if (!auth) {
    throw new Error("לא הוגדר חיבור Google לקריאת קובצי התמלול.");
  }

  // Google Docs אינם מאוחסנים כקובץ DOCX רגיל; יש לייצא אותם דרך Drive API.
  const exported = await downloadViaDriveApi(fileId, auth.token, knownMimeType);
  if (exported) return exported;

  const url = getDriveApiBase() + "/files/" + encodeURIComponent(fileId) + "?alt=media&supportsAllDrives=true";
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + auth.token },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    let message = "HTTP " + response.status;
    try {
      const data = await response.json() as { error?: { message?: string } };
      message = data.error?.message || message;
    } catch {
      // Keep the HTTP status.
    }
    throw new Error("הורדת הקובץ מ-Google Drive נכשלה: " + message);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || looksLikeHtml(buffer) || !looksLikeOffice(buffer)) {
    throw new Error("Google Drive לא החזיר קובץ Word או PDF תקין.");
  }
  return buffer;
}
