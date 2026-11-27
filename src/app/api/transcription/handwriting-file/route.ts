import {
  getStoredConfig,
  getTranscriptionHandwritingDriveServiceAccountJson,
} from "@/lib/server/settings";
import { getHandwritingNameForStudent } from "@/lib/server/sheets";
import {
  getRawDriveFileBuffer,
  normalizeFolderName,
  scrapeFolder,
} from "@/lib/server/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

    const serviceAccountJson = await getTranscriptionHandwritingDriveServiceAccountJson();
    const root = await scrapeFolder(rootFolderId, {
      fresh: true,
      serviceAccountJson: serviceAccountJson || undefined,
    });
    if (!root.ok) throw new Error(root.authError || "אין גישה לתיקיית האב של כתב היד.");

    const folder = root.folders.find(
      (item) => normalizeFolderName(item.name) === normalizeFolderName(fullName),
    );
    if (!folder) return Response.json({ error: "תיקיית כתב היד של התלמיד לא נמצאה." }, { status: 404 });

    const contents = await scrapeFolder(folder.id, {
      fresh: true,
      serviceAccountJson: serviceAccountJson || undefined,
    });
    if (!contents.ok) throw new Error(contents.authError || "אין גישה לקובצי כתב היד.");

    const file = contents.files.find((item) => item.id === fileId);
    if (!file || !(file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name))) {
      return Response.json({ error: "הקובץ אינו נמצא בתיקיית כתב היד של התלמיד." }, { status: 404 });
    }

    const buffer = await getRawDriveFileBuffer(fileId, serviceAccountJson || undefined);
    const safeName = file.name.replace(/[\\/:*?"<>|\r\n]/g, "_");
    const inline = url.searchParams.get("download") !== "1";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.length),
        "Content-Disposition": (inline ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(safeName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "לא ניתן לפתוח את קובץ כתב היד.";
    console.error("[transcription/handwriting-file] failed:", message);
    return Response.json({ error: message }, { status: 502 });
  }
}
