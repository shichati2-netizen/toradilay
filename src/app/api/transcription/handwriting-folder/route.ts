import { getStoredConfig } from "@/lib/server/settings";
import {
  getHandwritingNameForStudent,
  saveHandwritingNameForStudent,
} from "@/lib/server/sheets";
import { normalizeFolderName, scrapeFolder } from "@/lib/server/drive";
import { findLocalRegistration } from "@/lib/server/registrations";
import { searchLocalHandwritingFolder } from "@/lib/server/drives";
import type { TranscriptionDriveFile } from "@/lib/types";

export const dynamic = "force-dynamic";

type HandwritingFolderResult = {
  needsAssociation: boolean;
  studentName?: string;
  folderId?: string;
  files?: TranscriptionDriveFile[];
  folderMissing?: boolean;
  message?: string;
};

function cleanStudentId(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 12);
}

async function getFolderSettings(studentId: string) {
  if (!/^\d{9}$/.test(studentId)) {
    return {
      ok: false as const,
      response: Response.json({ error: "מספר תעודת הזהות אינו תקין." }, { status: 400 }),
    };
  }
  const config = await getStoredConfig();
  if (config.localHandwritingSearchEnabled && !config.localHandwritingSearchPath) {
    return {
      ok: false as const,
      response: Response.json({ error: "חיפוש מקומי לכתב יד מופעל, אך לא נבחר נתיב מקומי בהגדרות." }, { status: 503 }),
    };
  }
  if (!config.localHandwritingSearchEnabled && !/^[A-Za-z0-9_-]{10,120}$/.test(config.transcriptionHandwritingRootFolderId || "")) {
    return {
      ok: false as const,
      response: Response.json({ error: "תיקיית האב של תמלולי כתב היד עדיין לא הוגדרה בהגדרות." }, { status: 503 }),
    };
  }
  return { ok: true as const, config };
}

async function resolveFolderResult(
  fullName: string,
  rootFolderId: string,
): Promise<HandwritingFolderResult> {
  const root = await scrapeFolder(rootFolderId, { fresh: true });
  if (!root.ok) {
    throw new Error(
      root.authError ||
      "לא ניתן לקרוא את תיקיית האב של תמלולי כתב היד. בדוק את חיבור Google ושיתוף התיקייה עם חשבון העמדה.",
    );
  }

  const expected = normalizeFolderName(fullName);
  const folder = root.folders.find((item) => normalizeFolderName(item.name) === expected);
  if (!folder) {
    return {
      needsAssociation: false,
      studentName: fullName,
      folderMissing: true,
      files: [],
      message: 'לא נמצאה בתיקיית האב תיקייה בשם "' + fullName + '".',
    };
  }

  const contents = await scrapeFolder(folder.id, { fresh: true });
  if (!contents.ok) {
    throw new Error(contents.authError || "לא ניתן לקרוא את הקבצים שבתיקיית כתב היד של התלמיד.");
  }

  const files = contents.files
    .filter((item) =>
      item.mimeType === "application/pdf" ||
      item.mimeType === "application/msword" ||
      item.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      item.mimeType === "application/vnd.google-apps.document" ||
      /\.(pdf|docx?)$/i.test(item.name),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      modifiedTime: item.modifiedTime,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  return { needsAssociation: false, studentName: fullName, folderId: folder.id, files };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const studentId = cleanStudentId(url.searchParams.get("studentId"));
    const access = await getFolderSettings(studentId);
    if (!access.ok) return access.response;

    let fullName = await getHandwritingNameForStudent(studentId);
    if (!fullName) {
      const registered = findLocalRegistration(studentId).studentName;
      if (registered) {
        const saved = await saveHandwritingNameForStudent(studentId, registered);
        fullName = saved.fullName;
      }
    }
    if (access.config.localHandwritingSearchEnabled && fullName) {
      const files = searchLocalHandwritingFolder(access.config.localHandwritingSearchPath, fullName);
      return Response.json({
        needsAssociation: false,
        studentName: fullName,
        folderId: "local:" + fullName,
        files,
      } satisfies HandwritingFolderResult);
    }

    if (!fullName) {
      return Response.json({
        needsAssociation: true,
        studentId,
        message: "לא נמצא שם מלא ברישום המקומי. יש להזין את השם פעם אחת כפי שהוא מופיע בשם תיקיית הסריקות.",
      } satisfies HandwritingFolderResult & { studentId: string });
    }

    const result = await resolveFolderResult(fullName, access.config.transcriptionHandwritingRootFolderId);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "לא ניתן לטעון את תיקיית כתב היד.";
    console.error("[transcription/handwriting-folder] lookup failed:", message);
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { studentId?: string; fullName?: string };
    const studentId = cleanStudentId(body.studentId);
    const access = await getFolderSettings(studentId);
    if (!access.ok) return access.response;

    const fullName = String(body.fullName ?? "").replace(/\s+/g, " ").trim();
    if (
      fullName.length > 120 ||
      fullName.split(/\s+/).filter((part) => part.length >= 2).length < 2 ||
      !/[\p{L}]{2}/u.test(fullName)
    ) {
      return Response.json({ error: "יש להזין שם מלא תקין (שם פרטי ושם משפחה)." }, { status: 400 });
    }

    const saved = await saveHandwritingNameForStudent(studentId, fullName);
    if (access.config.localHandwritingSearchEnabled) {
      const files = searchLocalHandwritingFolder(access.config.localHandwritingSearchPath, saved.fullName);
      return Response.json({ ok: true, needsAssociation: false, studentName: saved.fullName, folderId: "local:" + saved.fullName, files });
    }
    const result = await resolveFolderResult(saved.fullName, access.config.transcriptionHandwritingRootFolderId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שמירת השיוך נכשלה.";
    console.error("[transcription/handwriting-folder] association failed:", message);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
