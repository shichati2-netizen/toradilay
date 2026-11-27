import { findLocalRegistration } from "@/lib/server/registrations";
import { checkExistingRegistration, resolveTarget } from "@/lib/server/sheets";

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

  let localMatch = { exists: false as boolean, studentName: undefined as string | undefined, firstName: undefined as string | undefined, lastName: undefined as string | undefined, rowNumber: undefined as number | undefined };
  try {
    localMatch = findLocalRegistration(idNumber);
  } catch (err) {
    console.warn("[register] local CSV lookup failed:", err);
  }

  try {
    const target = await resolveTarget({ webhookUrl: "" });
    if (!target || target.method === "webhook" || !/^[A-Za-z0-9_-]{10,}$/.test(target.spreadsheetId)) {
      return Response.json({ ...localMatch, source: localMatch.exists ? "local-csv" : undefined });
    }

    const sheetMatch = await checkExistingRegistration(target, idNumber);
    if (sheetMatch.exists) {
      const firstName = sheetMatch.firstName || localMatch.firstName;
      const lastName = sheetMatch.lastName || localMatch.lastName;
      const studentName =
        firstName && lastName
          ? firstName + " " + lastName
          : sheetMatch.studentName || localMatch.studentName;
      return Response.json({
        ...sheetMatch,
        firstName,
        lastName,
        studentName,
        source: "sheets",
      });
    }

    if (localMatch.exists) {
      return Response.json({ ...localMatch, source: "local-csv" });
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
