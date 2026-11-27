import { getStoredConfig, getTranscriptionHandwritingDriveServiceAccountJson } from "@/lib/server/settings";
import { getHandwritingNameForStudent, saveHandwritingNameForStudent } from "@/lib/server/sheets";
import { normalizeFolderName, scrapeFolder } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

type HandwritingFolderResult = {
  needsAssociation: boolean;
  studentName?: string;
  folderUrl?: string;
  folderMissing?: boolean;
  message?: string;
};

function cleanStudentId(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 12);
}

async function verifyStudentAccess(studentId: string) {
  if (!/^\d{9}$/.test(studentId)) {
    return { ok: false as const, response: Response.json({ error: "מספר תעודת הזהות אינו תקין." }, { status: 400 }) };
  }
  const config = await getStoredConfig();
  if (!config.transcriptionEnabled || !config.transcriptionAllowedStudentIds.includes(studentId)) {
    return { ok: false as const, response: Response.json({ error: "החשבון אינו מורשה להשתמש בתמלול." }, { status: 403 }) };
  }
  if (!/^[A-Za-z0-9_-]{10,120}$/.test(config.transcriptionHandwritingRootFolderId || "")) {
    return { ok: false as const, response: Response.json({ error: "תיקיית האב של תמלולי כתב היד עדיין לא הוגדרה בהגדרות." }, { status: 503 }) };
  }
  return { ok: true as const, config };
}

async function resolveFolderResult(
  fullName: string,
  rootFolderId: string,
): Promise<HandwritingFolderResult> {
  const serviceAccountJson = await getTranscriptionHandwritingDriveServiceAccountJson();
  const root = await scrapeFolder(rootFolderId, { fresh: true, serviceAccountJson: serviceAccountJson || undefined });
  if (!root.ok) {
    throw new Error(root.authError || "לא ניתן לקרוא את תיקיית האב של תמלולי כתב היד. בדוק שחשבון השירות שותף בתיקייה.");
  }
  const expected = normalizeFolderName(fullName);
  const folder = root.folders.find((item) => normalizeFolderName(item.name) === expected);
  if (!folder) {
    return {
      needsAssociation: false,
      studentName: fullName,
      folderMissing: true,
      message: 'השיוך נשמר, אך עדיין לא נמצאה בתיקיית האב תיקייה בשם "' + fullName + '".',
    };
  }
  return {
    needsAssociation: false,
    studentName: fullName,
    folderUrl: "https://drive.google.com/drive/folders/" + encodeURIComponent(folder.id),
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const studentId = cleanStudentId(url.searchParams.get("studentId"));
    const access = await verifyStudentAccess(studentId);
    if (!access.ok) return access.response;

    const fullName = await getHandwritingNameForStudent(studentId);
    if (!fullName) {
      return Response.json({
        needsAssociation: true,
        studentId,
        message: "כדי לגשת לתיקיית תמלול כתב היד, יש לשייך תחילה את מספר תעודת הזהות לשם המלא.",
      } satisfies HandwritingFolderResult & { studentId: string });
    }

    const result = await resolveFolderResult(
      fullName,
      access.config.transcriptionHandwritingRootFolderId,
    );
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "לא ניתן לפתוח את תיקיית תמלול כתב היד.";
    console.error("[transcription/handwriting-folder] lookup failed:", message);
    return Response.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { studentId?: string; fullName?: string };
    const studentId = cleanStudentId(body.studentId);
    const access = await verifyStudentAccess(studentId);
    if (!access.ok) return access.response;

    const fullName = String(body.fullName ?? "").replace(/\s+/g, " ").trim();
    if (fullName.length > 120 || fullName.split(/\s+/).filter((part) => part.length >= 2).length < 2 || !/[\p{L}]{2}/u.test(fullName)) {
      return Response.json({ error: "יש להזין שם מלא תקין (שם פרטי ושם משפחה)." }, { status: 400 });
    }

    const saved = await saveHandwritingNameForStudent(studentId, fullName);
    const result = await resolveFolderResult(
      saved.fullName,
      access.config.transcriptionHandwritingRootFolderId,
    );
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שמירת השיוך נכשלה.";
    console.error("[transcription/handwriting-folder] association failed:", message);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
