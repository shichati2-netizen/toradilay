import { getStoredConfig } from "@/lib/server/settings";
import { getHandwritingNameForStudent } from "@/lib/server/sheets";
import {
  getRawDriveFileBuffer,
  getFileBuffer,
  getPreviewHtml,
  normalizeFolderName,
  scrapeFolder,
} from "@/lib/server/drive";
import { getLocalHandwritingFile } from "@/lib/server/drives";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const studentId = String(url.searchParams.get("studentId") || "").replace(/\D/g, "").slice(0, 12);
    const fileId = String(url.searchParams.get("fileId") || "").trim();
    if (!/^\d{9}$/.test(studentId) || !/^[A-Za-z0-9_-]{5,120}$/.test(fileId)) {
      return new Response("פרטי הקובץ אינם תקינים.", { status: 400 });
    }

    const config = await getStoredConfig();
    const fullName = await getHandwritingNameForStudent(studentId);
    if (!fullName) return new Response("לא נמצא שיוך שם עבור התלמיד.", { status: 404 });

    if (config.localHandwritingSearchEnabled) {
      const local = getLocalHandwritingFile(fileId, config.localHandwritingSearchPath, fullName);
      if (!local || !/\\.(docx?)$/i.test(local.name)) return new Response("קובץ Word מקומי זה אינו נמצא בתיקיית כתב היד.", { status: 404 });
      const buffer = await getFileBuffer(fileId);
      if (/\\.doc$/i.test(local.name)) {
        return new Response("<!doctype html><html lang='he' dir='rtl'><meta charset='utf-8'><body style='font:16px Arial;padding:24px;text-align:center'>תצוגה מקדימה לקובצי ‎.doc‎ ישנים אינה זמינה. הורד את הקובץ ופתח אותו ב-Word.</body></html>", { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
      }
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ buffer });
      const body = result.value?.trim() || "<p>לא נמצאה תצוגה מקדימה למסמך.</p>";
      const html = "<!doctype html><html lang='he' dir='rtl'><head><meta charset='utf-8'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'\"><style>html,body{margin:0;background:#f1f5f9;color:#172033;font-family:Arial,sans-serif}body{padding:14px}.paper{min-height:340px;background:white;padding:28px;box-shadow:0 1px 5px #0002;direction:rtl;text-align:right;overflow-wrap:anywhere}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #cbd5e1;padding:5px}img{max-width:100%;height:auto}</style></head><body><main class='paper'>" + body + "</main></body></html>";
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff" } });
    }

    const rootFolderId = config.transcriptionHandwritingRootFolderId;
    if (!/^[A-Za-z0-9_-]{10,120}$/.test(rootFolderId || "")) {
      return new Response("לא נמצאה תיקיית כתב היד של התלמיד.", { status: 404 });
    }

    const root = await scrapeFolder(rootFolderId, { fresh: true });
    if (!root.ok) throw new Error(root.authError || "אין גישה לתיקיית האב.");

    const folder = root.folders.find(
      (item) => normalizeFolderName(item.name) === normalizeFolderName(fullName),
    );
    if (!folder) return new Response("תיקיית כתב היד לא נמצאה.", { status: 404 });

    const contents = await scrapeFolder(folder.id, { fresh: true });
    if (!contents.ok) throw new Error(contents.authError || "אין גישה לתיקיית כתב היד.");

    const file = contents.files.find((item) => item.id === fileId);
    if (!file || !(
      file.mimeType === "application/msword" ||
      file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimeType === "application/vnd.google-apps.document" ||
      /\.(docx?)$/i.test(file.name)
    )) {
      return new Response("קובץ Word זה אינו נמצא בתיקיית כתב היד.", { status: 404 });
    }

    if (/\.doc$/i.test(file.name) || file.mimeType === "application/msword") {
      return new Response("<!doctype html><html lang='he' dir='rtl'><meta charset='utf-8'><body style='font:16px Arial;padding:24px;text-align:center'>תצוגה מקדימה לקובצי ‎.doc‎ ישנים אינה זמינה. הורד את הקובץ ופתח אותו ב-Word.</body></html>", {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
      });
    }

    const buffer = await getRawDriveFileBuffer(fileId, undefined, file.mimeType);
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ buffer });
    const body = result.value?.trim() || "<p>לא נמצאה תצוגה מקדימה למסמך.</p>";
    const html = "<!doctype html><html lang='he' dir='rtl'><head><meta charset='utf-8'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'\"><style>html,body{margin:0;background:#f1f5f9;color:#172033;font-family:Arial,sans-serif}body{padding:14px}.paper{min-height:340px;background:white;padding:28px;box-shadow:0 1px 5px #0002;direction:rtl;text-align:right;overflow-wrap:anywhere}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #cbd5e1;padding:5px}img{max-width:100%;height:auto}</style></head><body><main class='paper'>" + body + "</main></body></html>";
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "לא ניתן ליצור תצוגה מקדימה למסמך Word.";
    console.error("[transcription/handwriting-preview] failed:", message);
    return new Response(escapeHtml(message), {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
}
