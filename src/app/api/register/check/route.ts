import { findLocalRegistration } from "@/lib/server/registrations";
import { checkExistingRegistration, resolveTarget } from "@/lib/server/sheets";

export const dynamic = "force-dynamic";

/** בודק את ה-ID ברישום המרכזי דרך Service Account, OAuth או Webhook; CSV הוא גיבוי בלבד. */
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

  let localMatch: ReturnType<typeof findLocalRegistration> = { exists: false };
  try {
    localMatch = findLocalRegistration(idNumber);
  } catch (err) {
    console.warn("[register] local CSV lookup failed:", err);
  }

  try {
    // Use the administrator's configured connection, including Apps Script webhook.
    // Passing webhookUrl:"" here used to disable that connection and silently check
    // only the local CSV, even when the ID and name were present in Google Sheets.
    const target = await resolveTarget();
    if (!target) {
      if (localMatch.exists) return Response.json({ ...localMatch, source: "local-csv" });
      return Response.json(
        { exists: false, error: "לא הוגדר חיבור פעיל ל-Google Sheets ולכן לא ניתן לאמת את הרישום.", code: "SHEETS_NOT_CONFIGURED" },
        { status: 503 },
      );
    }
    if (!/^[A-Za-z0-9_-]{10,}$/.test(target.spreadsheetId)) {
      if (localMatch.exists) return Response.json({ ...localMatch, source: "local-csv" });
      return Response.json(
        { exists: false, error: "מזהה Google Sheets אינו מוגדר או אינו תקין.", code: "SHEETS_ID_REQUIRED" },
        { status: 503 },
      );
    }

    const sheetMatch = await checkExistingRegistration(target, idNumber);
    if (sheetMatch.exists) {
      let firstName = sheetMatch.firstName || localMatch.firstName;
      let lastName = sheetMatch.lastName || localMatch.lastName;
      const returnedName = String(sheetMatch.studentName || "").replace(/\s+/g, " ").trim();
      if ((!firstName || !lastName) && returnedName) {
        const parts = returnedName.split(" ").filter(Boolean);
        if (parts.length >= 2) {
          firstName = firstName || parts[0];
          lastName = lastName || parts.slice(1).join(" ");
        }
      }
      const studentName =
        firstName && lastName
          ? firstName + " " + lastName
          : returnedName || localMatch.studentName;
      return Response.json({
        ...sheetMatch,
        firstName,
        lastName,
        studentName,
        source: target.method === "webhook" ? "sheets-webhook" : "sheets",
      });
    }

    if (localMatch.exists) {
      return Response.json({ ...localMatch, source: "local-csv" });
    }
    return Response.json({ exists: false });

  } catch (err) {
    const message = err instanceof Error ? err.message : "בדיקת הרישום מול Google Sheets נכשלה";
    // A Sheets/network error is not evidence that the student is unregistered.
    if (localMatch.exists && localMatch.studentName) {
      return Response.json({ ...localMatch, source: "local-csv", lookupWarning: message });
    }
    return Response.json(
      { exists: false, error: `לא ניתן לבדוק את הרישום ב-Google Sheets: ${message}`, code: "SHEETS_ERROR" },
      { status: 502 },
    );
  }
}
