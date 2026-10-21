import { appendLocalRegistration } from "@/lib/server/registrations";
import { logActivity } from "@/lib/server/activity";
import { validateRegistration } from "@/lib/server/registration-validation";
import { resolveTarget, registerStudent as appendToGoogleSheets } from "@/lib/server/sheets";
import { getStoredConfig } from "@/lib/server/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** רישום תלמיד: Google Sheets הוא היעד הראשי, ו-CSV המקומי משמש גיבוי ומפת שמות ל-Drive. */
export async function POST(req: Request) {
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ success: false, error: "בקשה לא תקינה" }, { status: 400 });
  }

  const v = validateRegistration(raw);
  if (!v.ok) {
    return Response.json({ success: false, error: v.error }, { status: 400 });
  }

  const cfg = await getStoredConfig();
  if (!cfg.registrationEnabled) {
    return Response.json({ success: false, error: "הרישום מהעמדה כבוי בהגדרות" }, { status: 403 });
  }

  const fullName = `${v.payload.firstName} ${v.payload.lastName}`;
  try {
    const target = await resolveTarget();
    if (!target || target.method !== "service-account") {
      return Response.json(
        {
          success: false,
          code: "SERVICE_ACCOUNT_REQUIRED",
          error: "כדי לרשום תלמידים יש להגדיר חשבון שירות, לשמור מזהה Google Sheets, ולשתף את הגיליון עם חשבון השירות בהרשאת עריכה.",
        },
        { status: 503 },
      );
    }
    if (!/^[A-Za-z0-9_-]{10,}$/.test(target.spreadsheetId)) {
      return Response.json(
        {
          success: false,
          code: "SHEETS_ID_REQUIRED",
          error: "מזהה Google Sheets אינו מוגדר או אינו תקין. פתח את הניהול ← חשבון Google ודרייב, הזן מזהה גיליון ושמור.",
        },
        { status: 400 },
      );
    }

    // קודם כותבים לגיליון; במקרה של כשל גישה אין להציג לתלמיד רישום שהצליח רק מקומית.
    const sheetResult = await appendToGoogleSheets(target, v.payload);

    let localBackupRow: number | undefined;
    let localBackupError: string | undefined;
    try {
      const localResult = appendLocalRegistration(v.payload);
      localBackupRow = localResult.rowNumber;
    } catch (err) {
      localBackupError = err instanceof Error ? err.message : "שמירת הגיבוי המקומי נכשלה";
    }

    const message = localBackupError
      ? "התלמיד נוסף ל-Google Sheets בהצלחה, אך לא נשמר גיבוי מקומי. חיפוש לפי שם עלול שלא להתעדכן."
      : "התלמיד נוסף ל-Google Sheets ונשמר גם בקובץ CSV המקומי.";

    await logActivity({
      type: "register",
      studentId: v.payload.idNumber,
      fileName: fullName,
      detail: localBackupError
        ? `Google Sheets ${sheetResult.updatedRange || "נשמר"} · גיבוי מקומי נכשל: ${localBackupError}`
        : `Google Sheets ${sheetResult.updatedRange || "נשמר"} · CSV שורה ${localBackupRow}`,
    });

    return Response.json({
      success: true,
      message,
      updatedRange: sheetResult.updatedRange,
      localBackupRow,
      localBackupError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "הוספת התלמיד ל-Google Sheets נכשלה";
    await logActivity({
      type: "register",
      studentId: v.payload.idNumber,
      fileName: fullName,
      success: false,
      detail: message,
    });
    return Response.json(
      {
        success: false,
        code: "SHEETS_WRITE_FAILED",
        error: `לא ניתן להוסיף את התלמיד ל-Google Sheets: ${message}`,
      },
      { status: 502 },
    );
  }
}
