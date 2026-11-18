import crypto from "node:crypto";
import path from "node:path";
import nodemailer from "nodemailer";
import { getStoredConfig } from "@/lib/server/settings";
import { consumeTranscriptionFileTokens, readSelectedTranscriptionFiles, type TranscriptionKind } from "@/lib/server/transcription-files";
import { addTranscriptionRequest, type TranscriptionModel } from "@/lib/server/transcription-store";
import { logActivity } from "@/lib/server/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      studentId?: string;
      folderId?: string;
      folderName?: string;
      source?: string;
      kind?: string;
      model?: string;
      fileTokens?: string[];
    };
    const studentId = String(body.studentId || "").replace(/\D/g, "").slice(0, 12);
    const kind: TranscriptionKind | null =
      body.kind === "audio" ? "audio" : body.kind === "handwriting" ? "handwriting" : null;
    const model: TranscriptionModel | null =
      body.model === "model1" ? "model1" : body.model === "model2" ? "model2" : null;

    if (studentId.length !== 9 || !kind || !model || !Array.isArray(body.fileTokens)) {
      return Response.json({ error: "פרטי בקשת התמלול אינם תקינים." }, { status: 400 });
    }

    const config = await getStoredConfig();
    if (!config.transcriptionEnabled || !config.transcriptionAllowedStudentIds.includes(studentId)) {
      return Response.json({ error: "החשבון אינו מורשה להשתמש בתמלול." }, { status: 403 });
    }

    const recipient = model === "model1"
      ? config.transcriptionModelOneEmail
      : config.transcriptionModelTwoEmail;
    if (!recipient) {
      return Response.json({ error: "כתובת הדואר של המודל שנבחר עדיין לא הוגדרה בהגדרות." }, { status: 400 });
    }
    if (!config.transcriptionSmtpHost || !config.transcriptionSmtpUser || !config.transcriptionSmtpPassword) {
      return Response.json({ error: "יש להגדיר שרת SMTP, משתמש וסיסמה בהגדרות התמלול לפני שליחת קבצים." }, { status: 400 });
    }

    const files = readSelectedTranscriptionFiles(body.fileTokens, kind, studentId);
    const counts = new Map<string, number>();
    const attachments = files.map((file) => {
      const next = (counts.get(file.extension) || 0) + 1;
      counts.set(file.extension, next);
      const suffix = next === 1 ? "" : "-" + String(next);
      return {
        filename: studentId + suffix + file.extension,
        content: file.buffer,
        contentType: kind === "handwriting" ? "application/pdf" : undefined,
      };
    });

    const requestId = crypto.randomUUID();
    const modelName = model === "model1" ? "מודל 1" : "מודל 2";
    const kindName = kind === "audio" ? "תמלול קולי" : "תמלול כתבי יד";
    const transporter = nodemailer.createTransport({
      host: config.transcriptionSmtpHost,
      port: config.transcriptionSmtpPort,
      secure: config.transcriptionSmtpPort === 465,
      auth: { user: config.transcriptionSmtpUser, pass: config.transcriptionSmtpPassword },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 45000,
    });

    await transporter.sendMail({
      from: config.transcriptionSmtpFrom || config.transcriptionSmtpUser,
      to: recipient,
      subject: "ToraDelia | " + kindName + " | " + studentId + " | " + requestId,
      text: [
        "בקשת תמלול חדשה מתוכנת ToraDelia.",
        "תעודת זהות: " + studentId,
        "סוג: " + kindName,
        "מודל: " + modelName,
        "מזהה בקשה: " + requestId,
        "הקבצים המצורפים שונו לשמות המבוססים על תעודת הזהות.",
        "נא לשמור את מזהה הבקשה ואת תעודת הזהות בתשובת התמלול כדי לאפשר שיוך אוטומטי בהמשך.",
      ].join("\n"),
      headers: { "X-ToraDelia-Request-Id": requestId },
      attachments,
    });

    consumeTranscriptionFileTokens(body.fileTokens);
    
    const requestedFolderName = String(body.folderName || studentId)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .trim()
      .slice(0, 160);
    const folderName = !requestedFolderName || requestedFolderName === "." || requestedFolderName === ".."
      ? studentId
      : requestedFolderName;
    const source = body.source === "local" ? "local" : "drive";
    const localRoot = source === "local" && config.localSearchPath
      ? path.resolve(config.localSearchPath)
      : "";
    const destinationPath = localRoot ? path.resolve(localRoot, folderName) : "";
    if (destinationPath) {
      const relativeTarget = path.relative(localRoot, destinationPath);
      if (relativeTarget === ".." || relativeTarget.startsWith(".." + path.sep) || path.isAbsolute(relativeTarget)) {
        throw new Error("תיקיית היעד אינה נמצאת בתוך תיקיית החיפוש המקומית.");
      }
    }
    const record = {
      id: requestId,
      studentId,
      folderId: typeof body.folderId === "string" ? body.folderId.slice(0, 200) : "",
      folderName,
      source,
      destinationPath,
      kind,
      model,
      recipient,
      createdAt: new Date().toISOString(),
      status: "pending" as const,
      fileNames: attachments.map((item) => item.filename),
    };
    addTranscriptionRequest(record);
    await logActivity({
      type: "transcription",
      studentId,
      detail: kindName + " נשלח ל-" + modelName + " · בקשה " + requestId,
    });

    return Response.json({ ok: true, requestId, status: "pending", fileNames: record.fileNames });
  } catch (error) {
    console.error("[transcription/send] failed:", error);
    return Response.json({
      error: error instanceof Error ? error.message : "שליחת הקבצים לתמלול נכשלה.",
    }, { status: 500 });
  }
}
