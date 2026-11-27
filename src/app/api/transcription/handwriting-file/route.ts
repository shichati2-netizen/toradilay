import { getStoredConfig } from "@/lib/server/settings";
import { getHandwritingNameForStudent } from "@/lib/server/sheets";
import {
  getRawDriveFileBuffer,
  normalizeFolderName,
  scrapeFolder,
} from "@/lib/server/drive";

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

    if (!/^\d{9}$/.test(studentId) || !/^[A-Za-z0-9_-]{5,120}$/.test(fileId)) {
      return Response.json({ error: "פרטי הקובץ אינם תקינים." }, { status: 400 });
    }

    const config = await getStoredConfig();
    const rootFolderId = config.transcriptionHandwritingRootFolderId;
    if (!/^[A-Za-z0-9_-]{10,120}$/.test(rootFolderId || "")) {
      return Response.json({ error: "תיקיית האב של כתב היד לא הוגדרה." }, { status: 503 });
    }

    const fullName = await getHandwritingNameForStudent(studentId);
    if (!fullName) {
      return Response.json({ error: "לא נמצא שיוך שם עבור התלמיד." }, { status: 404 });
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
