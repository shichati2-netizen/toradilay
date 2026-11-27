import { logActivity } from "@/lib/server/activity";
import { upsertLocalRegistrationName } from "@/lib/server/registrations";
import { saveRegistrationNameById, resolveTarget } from "@/lib/server/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Completes a missing name for a known ID; it never overwrites an existing name. */
export async function POST(req: Request) {
  let body: { idNumber?: unknown; firstName?: unknown; lastName?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, error: "בקשה לא תקינה." }, { status: 400 });
  }

  const idNumber = String(body.idNumber ?? "").replace(/\D/g, "");
  const firstName = String(body.firstName ?? "").trim().replace(/[\r\n]+/g, " ").slice(0, 60);
  const lastName = String(body.lastName ?? "").trim().replace(/[\r\n]+/g, " ").slice(0, 60);
  const validName = (value: string) =>
    value.length >= 2 && /^[\p{L}][\p{L} .'-]*$/u.test(value);

  if (!/^\d{5,9}$/.test(idNumber) || !validName(firstName) || !validName(lastName)) {
    return Response.json(
      { success: false, error: "יש להזין תעודת זהות תקינה, שם פרטי ושם משפחה." },
      { status: 400 },
    );
  }

  try {
    const target = await resolveTarget({ webhookUrl: "" });
    if (!target || target.method === "webhook" || !/^[A-Za-z0-9_-]{10,}$/.test(target.spreadsheetId)) {
      return Response.json(
        { success: false, error: "חיבור ישיר ל-Google Sheets אינו מוגדר. יש לפנות למנהל המערכת." },
        { status: 503 },
      );
    }

    const saved = await saveRegistrationNameById(target, idNumber, firstName, lastName);
    let backupWarning: string | undefined;
    try {
      upsertLocalRegistrationName(idNumber, saved.firstName, saved.lastName);
    } catch (error) {
      backupWarning = error instanceof Error ? error.message : "גיבוי השם המקומי לא נשמר.";
      console.warn("[register/complete-name] local backup failed:", backupWarning);
    }

    await logActivity({
      type: "register",
      studentId: idNumber,
      fileName: saved.studentName,
      detail: saved.alreadyComplete ? "שם כבר היה מעודכן" : "הושלם שם לפי תעודת זהות",
    });

    return Response.json({
      success: true,
      studentName: saved.studentName,
      alreadyComplete: saved.alreadyComplete === true,
      warning: backupWarning,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "עדכון השם נכשל.";
    await logActivity({
      type: "register",
      studentId: idNumber,
      fileName: firstName + " " + lastName,
      success: false,
      detail: message,
    });
    return Response.json({ success: false, error: message }, { status: 502 });
  }
}
