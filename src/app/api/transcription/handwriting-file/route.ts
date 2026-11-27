import { getStoredConfig, isHandwritingAccessAllowed } from "@/lib/server/settings";
import { getHandwritingNameForStudent } from "@/lib/server/sheets";
import {
  getRawDriveFileBuffer,
  getFileBuffer,
  normalizeFolderName,
  scrapeFolder,
} from "@/lib/server/drive";
import { getLocalHandwritingFile } from "@/lib/server/drives";
import { findLocalRegistration } from "@/lib/server/registrations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isSupportedFile(file: { name: string; mimeType: string }): boolean {
  return (
    file.mimeType === "application/pdf" ||
    file.mimeType === "application/msword" ||
    file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.mimeType === "application/vnd.google-apps.document" ||
    /\.(pdf|docx?)$/i.test(file.name)
  );
}

function getDownloadDetails(file: { name: string; mimeType: string }) {
  const isPdf = file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name);
  const isGoogleDoc = file.mimeType === "application/vnd.google-apps.document";
  let name = file.name;
  if (isGoogleDoc && !/\.docx?$/i.test(name)) name += ".docx";
  const contentType = isPdf
    ? "application/pdf"
    : /\.doc$/i.test(name) || file.mimeType === "application/msword"
      ? "application/msword"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return { name, contentType, isPdf };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const studentId = String(url.searchParams.get("studentId") || "").replace(/\D/g, "").slice(0, 12);
    const fileId = String(url.searchParams.get("fileId") || "").trim();

    if (!/^\d{9}$/.test(studentId) || !(/^[A-Za-z0-9_-]{5,120}$/.test(fileId) || /^local:[a-f0-9]{18}$/.test(fileId))) {
      return Response.json({ error: "פרטי הקובץ אינם תקינים." }, { status: 400 });
    }

    const config = await getStoredConfig();
    if (!isHandwritingAccessAllowed(studentId, config)) {
      return Response.json({ error: "הגישה לתמלול כתב יד מוגבלת לחשבונות מורשים בלבד." }, { status: 403 });
    }
    let fullName: string | null = null;
    try {
      fullName = await getHandwritingNameForStudent(studentId);
    } catch (error) {
      console.warn("[transcription/handwriting-file] mapping lookup unavailable:", error);
    }
    if (!fullName) {
      try {
        fullName = findLocalRegistration(studentId).studentName || null;
      } catch (error) {
        console.warn("[transcription/handwriting-file] local registration lookup unavailable:", error);
      }
    }
    if (!fullName) {
      return Response.json({ error: "לא נמצא שם משויך לתלמיד. בדוק את רישום התלמיד." }, { status: 404 });
    }

    if (config.localHandwritingSearchEnabled) {
      const local = getLocalHandwritingFile(fileId, config.localHandwritingSearchPath, fullName);
      if (!local) return Response.json({ error: "הקובץ המקומי אינו נמצא בתיקיית כתב היד של התלמיד." }, { status: 404 });
      const buffer = await getFileBuffer(fileId);
      const details = getDownloadDetails({ name: local.name, mimeType: /\.pdf$/i.test(local.name) ? "application/pdf" : /\.doc$/i.test(local.name) ? "application/msword" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const safeName = details.name.replace(/[\\\\/:*?"<>|\\r\\n]/g, "_");
      const inline = details.isPdf && url.searchParams.get("download") !== "1";
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": details.contentType,
          "Content-Length": String(buffer.length),
          "Content-Disposition": (inline ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(safeName),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const rootFolderId = config.transcriptionHandwritingRootFolderId;
    if (!/^[A-Za-z0-9_-]{10,120}$/.test(rootFolderId || "")) {
      return Response.json({ error: "תיקיית האב של כתב היד לא הוגדרה." }, { status: 503 });
    }

    const root = await scrapeFolder(rootFolderId, { fresh: true });
    if (!root.ok) throw new Error(root.authError || "אין גישה לתיקיית האב של כתב היד.");

    const folder = root.folders.find(
      (item) => normalizeFolderName(item.name) === normalizeFolderName(fullName),
    );
    if (!folder) return Response.json({ error: "תיקיית כתב היד של התלמיד לא נמצאה." }, { status: 404 });

    const contents = await scrapeFolder(folder.id, { fresh: true });
    if (!contents.ok) throw new Error(contents.authError || "אין גישה לקובצי כתב היד.");

    const file = contents.files.find((item) => item.id === fileId);
    if (!file || !isSupportedFile(file)) {
      return Response.json({ error: "הקובץ אינו נמצא בתיקיית כתב היד של התלמיד או שסוגו אינו נתמך." }, { status: 404 });
    }

    const buffer = await getRawDriveFileBuffer(fileId, undefined, file.mimeType);
    const details = getDownloadDetails(file);
    const safeName = details.name.replace(/[\\/:*?"<>|\r\n]/g, "_");
    const inline = details.isPdf && url.searchParams.get("download") !== "1";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": details.contentType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": (inline ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(safeName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "לא ניתן לפתוח את קובץ התמלול.";
    console.error("[transcription/handwriting-file] failed:", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
