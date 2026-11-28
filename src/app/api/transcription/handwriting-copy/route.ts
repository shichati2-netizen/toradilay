import { getStoredConfig, isHandwritingAccessAllowed } from "@/lib/server/settings";
import { getHandwritingNameForStudent, getRegisteredStudentNameById } from "@/lib/server/sheets";
import { getRawDriveFileBuffer, getFileBuffer, normalizeFolderName, scrapeFolder } from "@/lib/server/drive";
import { getLocalHandwritingFile } from "@/lib/server/drives";
import { copyToTarget } from "@/lib/server/drives";
import { logActivity } from "@/lib/server/activity";
import { findLocalRegistration } from "@/lib/server/registrations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json() as { studentId?: string; fileId?: string; fileName?: string };
    const studentId = String(body.studentId || "").replace(/\D/g, "");
    const fileId = String(body.fileId || "").trim();
    if (!/^\d{9}$/.test(studentId) || !(/^[A-Za-z0-9_-]{5,120}$/.test(fileId) || /^local:[a-f0-9]{18}$/.test(fileId))) {
      return Response.json({ success: false, mode: "server", message: "פרטי הקובץ אינם תקינים." }, { status: 400 });
    }
    const cfg = await getStoredConfig();
    if (!isHandwritingAccessAllowed(studentId, cfg)) {
      return Response.json({ success: false, mode: "server", message: "הגישה לתמלול כתב יד מוגבלת לחשבונות מורשים בלבד." }, { status: 403 });
    }
    let fullName: string | null = null;
    try {
      fullName = await getHandwritingNameForStudent(studentId);
    } catch (error) {
      console.warn("[transcription/handwriting-copy] handwriting mapping lookup unavailable:", error);
    }
    if (!fullName) {
      try {
        fullName = await getRegisteredStudentNameById(studentId);
      } catch (error) {
        console.warn("[transcription/handwriting-copy] central registration lookup unavailable:", error);
      }
    }
    if (!fullName) {
      try {
        fullName = findLocalRegistration(studentId).studentName || null;
      } catch (error) {
        console.warn("[transcription/handwriting-copy] local registration lookup unavailable:", error);
      }
    }
    if (!fullName) return Response.json({ success: false, mode: "server", message: "לא נמצא שם משויך לתלמיד ברישום המרכזי או המקומי." }, { status: 404 });
    if (cfg.localHandwritingSearchEnabled) {
      const local = getLocalHandwritingFile(fileId, cfg.localHandwritingSearchPath, fullName);
      if (!local) return Response.json({ success: false, mode: "server", message: "הקובץ אינו נמצא בתיקיית כתב היד של התלמיד." }, { status: 404 });
      const buffer = await getFileBuffer(fileId);
      const result = copyToTarget(buffer, local.name || body.fileName || "document", cfg);
      await logActivity({ type: "copy", studentId, fileName: local.name, success: result.success, detail: result.path || result.message });
      return Response.json(result);
    }
    const root = await scrapeFolder(cfg.transcriptionHandwritingRootFolderId, { fresh: true });
    if (!root.ok) throw new Error(root.authError || "אין גישה לתיקיית כתב היד.");
    const folder = root.folders.find(x => normalizeFolderName(x.name) === normalizeFolderName(fullName));
    if (!folder) return Response.json({ success: false, mode: "server", message: "תיקיית כתב היד לא נמצאה." }, { status: 404 });
    const contents = await scrapeFolder(folder.id, { fresh: true });
    if (!contents.ok) throw new Error(contents.authError || "אין גישה לקבצים.");
    const file = contents.files.find(x => x.id === fileId);
    if (!file || !(/\.(pdf|docx?)$/i.test(file.name) || file.mimeType === "application/pdf" || file.mimeType === "application/msword" || file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.mimeType === "application/vnd.google-apps.document")) {
      return Response.json({ success: false, mode: "server", message: "הקובץ אינו נמצא בתיקיית התלמיד." }, { status: 404 });
    }
    const buffer = await getRawDriveFileBuffer(file.id, undefined, file.mimeType);
    const result = copyToTarget(buffer, file.name || body.fileName || "document", cfg);
    await logActivity({ type: "copy", studentId, fileName: file.name, success: result.success, detail: result.path || result.message });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ההעתקה נכשלה.";
    return Response.json({ success: false, mode: "server", message }, { status: 502 });
  }
}
