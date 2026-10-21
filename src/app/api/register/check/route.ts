import { findLocalRegistration } from "@/lib/server/registrations";
import { checkExistingRegistration, resolveTarget } from "@/lib/server/sheets";
import { getStoredConfig } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/** בודק כפילויות בגיליון לפני הרישום; ה-CSV המקומי נבדק כגיבוי למיפוי שמות ישן. */
export async function POST(req: Request) {
  let idNumber = "";
  try {
    const body = (await req.json()) as { idNumber?: string };
    idNumber = String(body.idNumber ?? "").replace(/\D/g, "");
  } catch {
    /* handled below */
  }

  if (!/^\d{5,9}$/.test(idNumber)) {
    return Response.json({ error: "מספר תעודת זהות לא תקין", code: "INVALID_ID" }, { status: 400 });
  }

  const cfg = await getStoredConfig();
  if (!cfg.registrationEnabled) {
    return Response.json({ error: "הרישום מהעמדה כבוי בהגדרות", code: "DISABLED" }, { status: 403 });
  }

  try {
    const target = await resolveTarget();
    if (!target || target.method !== "service-account" || !/^[A-Za-z0-9_-]{10,}$/.test(target.spreadsheetId)) {
      return Response.json(
        {
          exists: false,
          error: "הרישום ל-Google Sheets אינו מוגדר. יש להגדיר חשבון שירות ומזהה גיליון במסך הניהול.",
          code: "NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const sheetMatch = await checkExistingRegistration(target, idNumber);
    if (sheetMatch.exists) {
      return Response.json({ ...sheetMatch, source: "sheets" });
    }

    // מגבה מפני רשומות ישנות ששמורות ב-CSV מלפני החיבור ל-Sheets.
    try {
      const localMatch = findLocalRegistration(idNumber);
      if (localMatch.exists) {
        return Response.json({ ...localMatch, source: "local-csv" });
      }
    } catch (err) {
      // אם קובץ הגיבוי אינו קריא, לא מייחסים את התקלה ל-Sheets ואפשר להמשיך לפי תוצאת הגיליון.
      console.warn("[register] local CSV duplicate fallback failed:", err);
    }

    return Response.json({ exists: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "בדיקת הכפילות מול Google Sheets נכשלה";
    return Response.json(
      { exists: false, error: `לא ניתן לבדוק כפילות ב-Google Sheets: ${message}`, code: "SHEETS_ERROR" },
      { status: 502 },
    );
  }
}
