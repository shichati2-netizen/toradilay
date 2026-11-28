import { getStoredConfig, isHandwritingAccessAllowed } from "@/lib/server/settings";
import { getHandwritingNameForStudent, getRegisteredStudentNameById } from "@/lib/server/sheets";
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainTextHtml(value: string): string {
  const paragraphs = value
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean);
  const content = paragraphs.length
    ? paragraphs.map((line) => "<p>" + escapeHtml(line) + "</p>").join("")
    : "<p>לא נמצא טקסט להצגה בקובץ.</p>";
  return "<!doctype html><html lang='he' dir='rtl'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff;color:#111}body{box-sizing:border-box;padding:10px 12px;font-family:Arial,sans-serif;font-size:15px;line-height:1.55;text-align:right;direction:rtl;overflow:hidden}main{margin:0;padding:0;overflow:hidden}p{margin:0 0 9px;font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><main>" + content + "</main></body></html>";
}

async function getFileInfo(fileId: string, studentId: string) {
  const config = await getStoredConfig();
  let fullName: string | null = null;
  try {
    fullName = await getHandwritingNameForStudent(studentId);
  } catch (error) {
    console.warn("[transcription/handwriting-preview] handwriting mapping lookup unavailable:", error);
  }
  if (!fullName) {
    try {
      fullName = await getRegisteredStudentNameById(studentId);
    } catch (error) {
      console.warn("[transcription/handwriting-preview] central registration lookup unavailable:", error);
    }
  }
  if (!fullName) {
    try {
      fullName = findLocalRegistration(studentId).studentName || null;
    } catch (error) {
      console.warn("[transcription/handwriting-preview] local registration lookup unavailable:", error);
    }
  }
  if (!fullName) throw new Error("לא נמצא שם משויך לתלמיד ברישום המרכזי או המקומי.");

  if (config.localHandwritingSearchEnabled) {
    const local = getLocalHandwritingFile(fileId, config.localHandwritingSearchPath, fullName);
    if (!local) throw new Error("הקובץ אינו נמצא בתיקיית כתב היד של התלמיד.");
    return { name: local.name, buffer: await getFileBuffer(fileId) };
  }

  const rootFolderId = config.transcriptionHandwritingRootFolderId;
  if (!/^[A-Za-z0-9_-]{10,120}$/.test(rootFolderId || "")) {
    throw new Error("לא נמצאה תיקיית כתב היד של התלמיד.");
  }
  const root = await scrapeFolder(rootFolderId, { fresh: true });
  if (!root.ok) throw new Error(root.authError || "אין גישה לתיקיית האב.");
  const folder = root.folders.find(
    (item) => normalizeFolderName(item.name) === normalizeFolderName(fullName),
  );
  if (!folder) throw new Error("תיקיית כתב היד לא נמצאה.");
  const contents = await scrapeFolder(folder.id, { fresh: true });
  if (!contents.ok) throw new Error(contents.authError || "אין גישה לתיקיית כתב היד.");
  const file = contents.files.find((item) => item.id === fileId);
  if (!file || !(
    file.mimeType === "application/pdf" ||
    file.mimeType === "application/msword" ||
    file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.mimeType === "application/vnd.google-apps.document" ||
    /\.(pdf|docx?)$/i.test(file.name)
  )) {
    throw new Error("הקובץ אינו נמצא בתיקיית כתב היד או שסוגו אינו נתמך.");
  }
  return {
    name: file.name,
    buffer: await getRawDriveFileBuffer(fileId, undefined, file.mimeType),
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const studentId = String(url.searchParams.get("studentId") || "").replace(/\D/g, "").slice(0, 12);
    const fileId = String(url.searchParams.get("fileId") || "").trim();
    if (!/^\d{9}$/.test(studentId) || !(/^[A-Za-z0-9_-]{5,120}$/.test(fileId) || /^local:[a-f0-9]{18}$/.test(fileId))) {
      return new Response("פרטי הקובץ אינם תקינים.", { status: 400 });
    }

    const accessConfig = await getStoredConfig();
    if (!isHandwritingAccessAllowed(studentId, accessConfig)) {
      return new Response("הגישה לתמלול כתב יד מוגבלת לחשבונות מורשים בלבד.", { status: 403 });
    }
    const file = await getFileInfo(fileId, studentId);
    if (/\.pdf$/i.test(file.name)) {
      // Return the original PDF. The client/Windows PDF viewer handles rendering;
      // this avoids server-side PDF.js parsing and worker/path resolution entirely.
      return new Response(new Uint8Array(file.buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(file.buffer.length),
          "Content-Disposition": "inline; filename*=UTF-8''" + encodeURIComponent(file.name.replace(/[\\/:*?"<>|\\r\\n]/g, "_")),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    let text: string;
    if (/\.docx$/i.test(file.name)) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value || "";
    } else {
      text = "תצוגת טקסט אוטומטית לקובצי Word ישנים מסוג ‎.doc‎ אינה זמינה. אפשר להוריד את הקובץ ולפתוח אותו ב-Word.";
    }

    return new Response(plainTextHtml(text), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "לא ניתן ליצור תצוגת טקסט לקובץ.";
    console.error("[transcription/handwriting-preview] failed:", message);
    return new Response(escapeHtml(message), {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
}
