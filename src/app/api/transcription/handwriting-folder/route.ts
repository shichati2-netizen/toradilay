import { getStoredConfig, isHandwritingAccessAllowed } from "@/lib/server/settings";
import {
  getHandwritingNameForStudent,
  getRegisteredStudentNameById,
  hasConfiguredRegistrationLookupSource,
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

function usableStudentName(value: unknown): string | null {
  const name = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const parts = name.split(" ").filter((part) => part.length >= 2);
  return parts.length >= 2 && /[\p{L}]{2}/u.test(name) ? name : null;
}

async function getFolderSettings(studentId: string) {
  if (!/^\d{9}$/.test(studentId)) {
    return {
      ok: false as const,
      response: Response.json({ error: "מספר תעודת הזהות אינו תקין." }, { status: 400 }),
    };
  }
  const config = await getStoredConfig();
  if (!isHandwritingAccessAllowed(studentId, config)) {
    return { ok: false as const, response: Response.json({ error: "הגישה לתמלול כתב יד מוגבלת לחשבונות מורשים בלבד." }, { status: 403 }) };
  }
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

    // Prefer the handwriting-specific mapping, then use the registration sheet,
    // and finally the local CSV. A missing/temporarily unavailable mapping tab must
    // never prevent a student with a registered name from opening handwriting.
    let fullName: string | null = null;
    try {
      fullName = usableStudentName(await getHandwritingNameForStudent(studentId));
    } catch (error) {
      console.warn("[transcription/handwriting-folder] mapping lookup unavailable:", error);
    }

    let registrationLookupError: string | undefined;
    let centralRegistrationConfigured = true;
    try {
      centralRegistrationConfigured = await hasConfiguredRegistrationLookupSource();
    } catch (error) {
      // A configuration read failure must not make a stale local CSV authoritative.
      console.warn("[transcription/handwriting-folder] could not determine central registration configuration:", error);
    }

    if (!fullName && centralRegistrationConfigured) {
      try {
        // Include Apps Script webhook as well as direct Sheets connections.
        fullName = usableStudentName(await getRegisteredStudentNameById(studentId));
      } catch (error) {
        registrationLookupError = error instanceof Error ? error.message : "שגיאה בקריאת הרישום המרכזי.";
        console.warn("[transcription/handwriting-folder] registration lookup unavailable:", registrationLookupError);
      }
    }

    if (!fullName && !centralRegistrationConfigured) {
      try {
        fullName = usableStudentName(findLocalRegistration(studentId).studentName);
      } catch (error) {
        console.warn("[transcription/handwriting-folder] local registration lookup unavailable:", error);
      }
    }

    // Never ask the student to update a name when the central lookup failed.
    // A lookup failure is not evidence that the registration/name is missing.
    if (!fullName && registrationLookupError) {
      return Response.json(
        { error: "לא הצלחנו לבדוק את השם ברישום המרכזי ולכן לא נבקש לעדכן אותו כעת. " + registrationLookupError },
        { status: 502 },
      );
    }

    if (fullName) {
      try {
        const saved = await saveHandwritingNameForStudent(studentId, fullName);
        fullName = saved.fullName;
      } catch (error) {
        // The local-only search path needs no Google mapping table.
        if (!access.config.localHandwritingSearchEnabled) {
          console.warn("[transcription/handwriting-folder] name mapping could not be persisted:", error);
        }
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

    if (access.config.localHandwritingSearchEnabled) {
      // For a separate local handwriting directory, the name is enough to locate
      // the folder; do not require a Google Sheets mapping connection.
      const files = searchLocalHandwritingFolder(access.config.localHandwritingSearchPath, fullName);
      return Response.json({ ok: true, needsAssociation: false, studentName: fullName, folderId: "local:" + fullName, files });
    }
    const saved = await saveHandwritingNameForStudent(studentId, fullName);
    const result = await resolveFolderResult(saved.fullName, access.config.transcriptionHandwritingRootFolderId);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שמירת השיוך נכשלה.";
    console.error("[transcription/handwriting-folder] association failed:", message);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
