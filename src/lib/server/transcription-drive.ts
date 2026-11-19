import fs from "node:fs";
import { getGoogleAuthToken } from "./google-oauth";

const DRIVE_API_BASE = (process.env.GOOGLE_DRIVE_API_BASE || "https://www.googleapis.com/drive/v3").replace(/\/+$/, "");
const DRIVE_UPLOAD_BASE = DRIVE_API_BASE.replace(/\/drive\/v3$/, "/upload/drive/v3");
const ROOT_FOLDER_NAME = "ToraDelia - Transcription Uploads";
const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB; a multiple of Drive's 256 KB chunk unit.
const REQUEST_TIMEOUT_MS = 120_000;

export interface TranscriptionUploadSourceFile {
  path: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface UploadedTranscriptionFile {
  driveFileId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

interface DriveFileMetadata {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string | number;
  webViewLink?: string;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: "Bearer " + token };
}

async function responseError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error && typeof parsed.error.message === "string") return parsed.error.message;
  } catch {
    // Use the plain response body below.
  }
  return raw.slice(0, 800) || ("HTTP " + response.status + " " + response.statusText);
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(name: string, token: string, parentId?: string): Promise<string | null> {
  const clauses = [
    "name = '" + escapeDriveQuery(name) + "'",
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ];
  if (parentId) clauses.push("'" + parentId + "' in parents");

  const params = new URLSearchParams({
    q: clauses.join(" and "),
    pageSize: "100",
    fields: "files(id,name)",
    spaces: "drive",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const response = await fetch(DRIVE_API_BASE + "/files?" + params.toString(), {
    headers: authHeaders(token),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error("לא ניתן לבדוק תיקיות העלאה ב-Google Drive: " + await responseError(response));
  }
  const data = await response.json() as { files?: Array<{ id?: string }> };
  const id = data.files?.find((item) => typeof item.id === "string")?.id;
  return id || null;
}

async function createFolder(name: string, token: string, parentId?: string): Promise<string> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    appProperties: { createdBy: "ToraDelia", purpose: "transcription-upload" },
  };
  if (parentId) metadata.parents = [parentId];

  const response = await fetch(DRIVE_API_BASE + "/files?fields=id,name", {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error("לא ניתן ליצור תיקיית העלאה ב-Google Drive: " + await responseError(response));
  }
  const data = await response.json() as { id?: string };
  if (!data.id) throw new Error("Google Drive לא החזיר מזהה לתיקיית ההעלאה.");
  return data.id;
}

async function ensureFolder(name: string, token: string, parentId?: string): Promise<string> {
  const existing = await findFolder(name, token, parentId);
  return existing || createFolder(name, token, parentId);
}

function offsetFromRange(value: string | null): number {
  if (!value) return 0;
  const match = value.match(/bytes=\s*\d+-(\d+)/i);
  return match ? Number(match[1]) + 1 : 0;
}

async function readUploadOffset(sessionUrl: string, size: number, token: string): Promise<{
  offset: number;
  completed?: DriveFileMetadata;
}> {
  const response = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      ...authHeaders(token),
      "Content-Length": "0",
      "Content-Range": "bytes */" + size,
    },
    body: Buffer.alloc(0),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 308) {
    return { offset: offsetFromRange(response.headers.get("range")) };
  }
  if (response.ok) {
    const data = await response.json().catch(() => ({})) as DriveFileMetadata;
    return { offset: size, completed: data };
  }
  throw new Error("לא ניתן לחדש העלאה ל-Google Drive: " + await responseError(response));
}

async function uploadFileResumable(
  file: TranscriptionUploadSourceFile,
  parentFolderId: string,
  token: string,
  appProperties: Record<string, string>,
): Promise<DriveFileMetadata> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error("גודל הקובץ אינו תקין: " + file.filename);
  }

  const handle = await fs.promises.open(file.path, "r");
  try {
    const currentStat = await handle.stat();
    if (!currentStat.isFile() || currentStat.size !== file.size) {
      throw new Error("הקובץ השתנה לאחר בחירתו: " + file.filename);
    }

    const startResponse = await fetch(
      DRIVE_UPLOAD_BASE + "/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink",
      {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": file.mimeType,
          "X-Upload-Content-Length": String(file.size),
        },
        body: JSON.stringify({
          name: file.filename,
          mimeType: file.mimeType,
          parents: [parentFolderId],
          appProperties,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!startResponse.ok) {
      const message = await responseError(startResponse);
      if (startResponse.status === 401 || startResponse.status === 403) {
        throw new Error("לחשבון Google המחובר אין הרשאה להעלות קבצים ל-Drive. יש לחבר מחדש את Google ולאשר את הרשאת Drive לקבצים של ToraDelia. פרטים: " + message);
      }
      throw new Error("לא ניתן להתחיל העלאה ל-Google Drive: " + message);
    }

    const sessionUrl = startResponse.headers.get("location");
    if (!sessionUrl) throw new Error("Google Drive לא החזיר כתובת להמשך העלאה.");
    let offset = 0;
    let noProgressRetries = 0;
    let completed: DriveFileMetadata | undefined;

    while (offset < file.size && !completed) {
      const chunkLength = Math.min(CHUNK_SIZE, file.size - offset);
      const chunk = Buffer.allocUnsafe(chunkLength);
      const read = await handle.read(chunk, 0, chunkLength, offset);
      if (read.bytesRead !== chunkLength) {
        throw new Error("לא ניתן לקרוא את כל נתוני ההקלטה: " + file.filename);
      }

      try {
        const response = await fetch(sessionUrl, {
          method: "PUT",
          headers: {
            ...authHeaders(token),
            "Content-Type": file.mimeType,
            "Content-Length": String(chunkLength),
            "Content-Range": "bytes " + offset + "-" + (offset + chunkLength - 1) + "/" + file.size,
          },
          body: chunk,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (response.status === 308) {
          const nextOffset = offsetFromRange(response.headers.get("range"));
          if (nextOffset <= offset) {
            noProgressRetries++;
            if (noProgressRetries > 4) {
              throw new Error("העלאת הקובץ נעצרה ללא התקדמות. בדוק את חיבור האינטרנט ונסה שוב.");
            }
            await new Promise((resolve) => setTimeout(resolve, 700 * noProgressRetries));
          } else {
            offset = nextOffset;
            noProgressRetries = 0;
          }
          continue;
        }

        if (response.ok) {
          completed = await response.json() as DriveFileMetadata;
          offset = file.size;
          continue;
        }

        if (response.status === 429 || response.status >= 500) {
          noProgressRetries++;
          if (noProgressRetries > 4) {
            throw new Error("Google Drive נכשל שוב ושוב בקבלת נתוני הקובץ: " + await responseError(response));
          }
          const resumed = await readUploadOffset(sessionUrl, file.size, token);
          if (resumed.completed) completed = resumed.completed;
          else offset = resumed.offset;
          await new Promise((resolve) => setTimeout(resolve, 700 * noProgressRetries));
          continue;
        }

        throw new Error("העלאת הקובץ ל-Google Drive נכשלה: " + await responseError(response));
      } catch (error) {
        if (error instanceof Error && /נכשלה:|נעצרה ללא התקדמות|לא ניתן לקרוא|הקובץ השתנה|לא ניתן לחדש/.test(error.message)) {
          throw error;
        }
        noProgressRetries++;
        if (noProgressRetries > 4) {
          throw new Error("החיבור נקטע במהלך העלאת " + file.filename + ". ניתן לנסות לשלוח שוב. פרטים: " + (error instanceof Error ? error.message : String(error)));
        }
        const resumed = await readUploadOffset(sessionUrl, file.size, token);
        if (resumed.completed) completed = resumed.completed;
        else offset = resumed.offset;
        await new Promise((resolve) => setTimeout(resolve, 700 * noProgressRetries));
      }
    }

    if (!completed?.id) {
      throw new Error("ההעלאה הסתיימה אך Google Drive לא החזיר מזהה לקובץ " + file.filename + ".");
    }
    return completed;
  } finally {
    await handle.close();
  }
}

async function shareFileWithRecipient(fileId: string, recipient: string, token: string): Promise<void> {
  const params = new URLSearchParams({
    sendNotificationEmail: "false",
    supportsAllDrives: "true",
  });
  const response = await fetch(
    DRIVE_API_BASE + "/files/" + encodeURIComponent(fileId) + "/permissions?" + params.toString(),
    {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", role: "reader", emailAddress: recipient }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    const message = await responseError(response);
    if (response.status === 401 || response.status === 403) {
      throw new Error("הקובץ הועלה ל-Drive, אך Google לא אפשרה לשתף אותו עם כתובת המודל. בדוק שהחשבון המחובר מורשה לשתף מחוץ לארגון ושהרשאת Drive אושרה. פרטים: " + message);
    }
    throw new Error("שיתוף קובץ ההקלטה עם המודל נכשל: " + message);
  }
}

export async function uploadTranscriptionFilesToDrive(
  files: TranscriptionUploadSourceFile[],
  options: {
    studentId: string;
    requestId: string;
    recipient: string;
    kind: "audio" | "handwriting";
    model: "model1" | "model2";
  },
): Promise<UploadedTranscriptionFile[]> {
  const auth = await getGoogleAuthToken();
  if (!auth) {
    throw new Error("כדי לשלוח הקלטות גדולות יש לחבר חשבון Google בהגדרות, כדי ש-ToraDelia תוכל להעלות קבצים ל-Drive.");
  }

  const rootFolderId = await ensureFolder(ROOT_FOLDER_NAME, auth.token);
  const requestFolderId = await createFolder(
    options.studentId + "-" + options.requestId.slice(0, 8),
    auth.token,
    rootFolderId,
  );

  const uploaded: UploadedTranscriptionFile[] = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const metadata = await uploadFileResumable(
      file,
      requestFolderId,
      auth.token,
      {
        source: "ToraDelia",
        studentId: options.studentId,
        requestId: options.requestId,
        kind: options.kind,
        model: options.model,
      },
    );
    if (!metadata.id) throw new Error("Google Drive לא החזיר מזהה לקובץ " + file.filename + ".");
    await shareFileWithRecipient(metadata.id, options.recipient, auth.token);
    uploaded.push({
      driveFileId: metadata.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      url: metadata.webViewLink || "https://drive.google.com/file/d/" + metadata.id + "/view",
    });
  }
  return uploaded;
}
