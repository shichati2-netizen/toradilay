import crypto from "node:crypto";
import path from "node:path";
import { getStoredConfig } from "@/lib/server/settings";
import { consumeTranscriptionFileTokens, readSelectedTranscriptionFiles, type TranscriptionKind } from "@/lib/server/transcription-files";
import { addTranscriptionRequest, updateTranscriptionRequestStatus, type TranscriptionModel } from "@/lib/server/transcription-store";
import { logActivity } from "@/lib/server/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

function getRecipient(
  config: Awaited<ReturnType<typeof getStoredConfig>>,
  kind: TranscriptionKind,
  model: TranscriptionModel,
): string {
  if (kind === "audio") {
    return model === "model1"
      ? config.transcriptionAudioModelOneEmail
      : config.transcriptionAudioModelTwoEmail;
  }
  return model === "model1"
    ? config.transcriptionHandwritingModelOneEmail
    : config.transcriptionHandwritingModelTwoEmail;
}

function getMimeType(extension: string): string {
  switch (extension.toLowerCase()) {
    case ".pdf": return "application/pdf";
    case ".mp3": return "audio/mpeg";
    case ".wav": return "audio/wav";
    case ".m4a": return "audio/mp4";
    case ".aac": return "audio/aac";
    case ".ogg": return "audio/ogg";
    case ".flac": return "audio/flac";
    case ".wma": return "audio/x-ms-wma";
    case ".opus": return "audio/opus";
    case ".amr": return "audio/amr";
    case ".aiff":
    case ".aif": return "audio/aiff";
    default: return "application/octet-stream";
  }
}

export async function POST(req: Request) {
  let requestId = "";
  let storedRequest = false;
  let fileTokens: string[] = [];
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
    fileTokens = Array.isArray(body.fileTokens) ? body.fileTokens : [];

    if (studentId.length !== 9 || !kind || !model || !Array.isArray(body.fileTokens)) {
      return Response.json({ error: "פרטי בקשת התמלול אינם תקינים." }, { status: 400 });
    }

    const config = await getStoredConfig();
    if (!config.transcriptionEnabled || !config.transcriptionAllowedStudentIds.includes(studentId)) {
      return Response.json({ error: "החשבון אינו מורשה להשתמש בתמלול." }, { status: 403 });
    }
    if (!config.transcriptionAppsScriptUrl || !config.transcriptionAppsScriptToken) {
      return Response.json({ error: "יש להגדיר כתובת Google Apps Script ומפתח חיבור בהגדרות התמלול." }, { status: 400 });
    }

    const recipient = getRecipient(config, kind, model);
    if (!recipient) {
      const typeName = kind === "audio" ? "תמלול קולי" : "תמלול כתבי יד";
      return Response.json({ error: "כתובת הדואר של " + typeName + " – " + (model === "model1" ? "מודל 1" : "מודל 2") + " עדיין לא הוגדרה." }, { status: 400 });
    }

    // מעבירים לסקריפט גם את ארבע הכתובות, כדי שיוכל לזהות תשובות מכל המודלים.
    // הכתובות נשמרות שם אוטומטית ב-Script Properties.
    const replySenders = {
      audioModel1: config.transcriptionAudioModelOneEmail,
      audioModel2: config.transcriptionAudioModelTwoEmail,
      handwritingModel1: config.transcriptionHandwritingModelOneEmail,
      handwritingModel2: config.transcriptionHandwritingModelTwoEmail,
    };
    const invalidSender = Object.values(replySenders).some((email) =>
      typeof email !== "string" || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim()),
    );
    if (invalidSender) {
      return Response.json({
        error: "יש להגדיר בהגדרות התמלול את כל ארבע כתובות הדואר של מודל 1 ומודל 2, לתמלול קולי ולכתב יד.",
      }, { status: 400 });
    }

    const files = readSelectedTranscriptionFiles(fileTokens, kind, studentId);
    const counts = new Map<string, number>();
    const attachments = files.map((file) => {
      const next = (counts.get(file.extension) || 0) + 1;
      counts.set(file.extension, next);
      const suffix = next === 1 ? "" : "-" + String(next);
      return {
        filename: studentId + suffix + file.extension,
        mimeType: getMimeType(file.extension),
        base64: file.buffer.toString("base64"),
      };
    });

    requestId = crypto.randomUUID();
    const requestedFolderName = String(body.folderName || studentId)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .trim()
      .slice(0, 160);
    const folderName = !requestedFolderName || requestedFolderName === "." || requestedFolderName === ".."
      ? studentId
      : requestedFolderName;
    const source: "drive" | "local" = body.source === "local" ? "local" : "drive";
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

    const modelName = model === "model1" ? "מודל 1" : "מודל 2";
    const kindName = kind === "audio" ? "תמלול קולי" : "תמלול כתבי יד";
    addTranscriptionRequest({
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
      status: "pending",
      fileNames: attachments.map((item) => item.filename),
    });
    storedRequest = true;

    const totalAttachmentBytes = files.reduce((sum, file) => sum + file.size, 0);
    console.info(
      "[transcription/send] submitting to Apps Script:",
      JSON.stringify({ requestId, kind, model, fileCount: files.length, totalBytes: totalAttachmentBytes }),
    );
    const sendStartedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(config.transcriptionAppsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          token: config.transcriptionAppsScriptToken,
          requestId,
          studentId,
          kind,
          model,
          recipient,
          replySenders,
          folderId: source === "drive" ? String(body.folderId || "").slice(0, 200) : "",
          folderName,
          attachments,
        }),
        redirect: "follow",
        signal: AbortSignal.timeout(150000),
        cache: "no-store",
      });
    } catch (fetchError) {
      if (fetchError instanceof Error &&
          (fetchError.name === "TimeoutError" || fetchError.name === "AbortError")) {
        throw new Error(
          "Google Apps Script לא החזיר תשובה בתוך 150 שניות. ייתכן שהמייל כבר נשלח למרות שהאישור התעכב. בדוק בתיקיית 'נשלח' לפני ניסיון חוזר. מזהה הבקשה: " + requestId
        );
      }
      throw fetchError;
    }
    console.info(
      "[transcription/send] Apps Script response received after " + (Date.now() - sendStartedAt) + "ms",
    );

    const responseText = await response.text();
    let result: { ok?: boolean; error?: string; requestId?: string; duplicate?: boolean };
    try {
      result = JSON.parse(responseText) as typeof result;
    } catch {
      throw new Error("Google Apps Script החזיר תשובה שאינה JSON. בדוק שה-Web App פורסם ושהכתובת מסתיימת ב-/exec.");
    }

    if (!response.ok || result.ok !== true) {
      throw new Error(result.error || "Google Apps Script לא הצליח לשלוח את בקשת התמלול.");
    }
    if (result.requestId && result.requestId !== requestId) {
      throw new Error("מזהה הבקשה שחזר מ-Google Apps Script אינו תואם.");
    }

    consumeTranscriptionFileTokens(fileTokens);
    await logActivity({
      type: "transcription",
      studentId,
      detail: kindName + " נשלח דרך Google Apps Script ל-" + modelName + " · בקשה " + requestId,
    });

    return Response.json({
      ok: true,
      requestId,
      status: "pending",
      fileNames: attachments.map((item) => item.filename),
      sentVia: "google-apps-script",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שליחת הקבצים לתמלול נכשלה.";
    const mayHaveSent = message.includes("לא החזיר תשובה בתוך 150 שניות");
    // A timeout is ambiguous: Apps Script/Gmail may have completed the send after
    // the kiosk stopped waiting. Do not mark the request failed in that case.
    if (storedRequest && requestId && !mayHaveSent) {
      updateTranscriptionRequestStatus(requestId, "failed", {
        failureReason: message,
      });
    }
    console.error("[transcription/send] failed:", {
      requestId,
      mayHaveSent,
      error: message,
    });
    return Response.json({
      error: message,
      requestId: requestId || undefined,
      status: mayHaveSent ? "pending" : "failed",
      mayHaveSent,
    }, { status: mayHaveSent ? 504 : 500 });
  }
}
