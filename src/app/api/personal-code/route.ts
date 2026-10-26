import {
  checkExistingRegistration,
  findPersonalCodeRowByName,
  resolveTarget,
} from "@/lib/server/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("he-IL")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[׳״"'.,\-_/\\()[\]{}:;]+/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/** מחפש לפי השם שבגיליון הרישום לאחר אימות תעודת הזהות והשם שהוזנו. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      idNumber?: string;
      firstName?: string;
      lastName?: string;
    };
    const idNumber = String(body.idNumber ?? "").replace(/\D/g, "");
    const enteredFirstName = String(body.firstName ?? "").trim();
    const enteredLastName = String(body.lastName ?? "").trim();
    if (!/^\d{5,9}$/.test(idNumber)) {
      return Response.json({ found: false, error: "נא להזין תעודת זהות תקינה (5 עד 9 ספרות)." }, { status: 400 });
    }
    if (enteredFirstName.length < 2 || enteredLastName.length < 2) {
      return Response.json({ found: false, error: "נא להזין שם פרטי ושם משפחה כפי שנרשמו." }, { status: 400 });
    }

    const registrationTarget = await resolveTarget({ webhookUrl: "" });
    if (!registrationTarget || registrationTarget.method !== "service-account" ||
        !/^[A-Za-z0-9_-]{10,}$/.test(registrationTarget.spreadsheetId)) {
      return Response.json({
        found: false,
        error: "החיפוש אינו מוגדר. יש להגדיר חשבון שירות ולשתף אותו גם בגיליון הרישום וגם בגיליון הנתונים.",
      }, { status: 503 });
    }

    const registered = await checkExistingRegistration(registrationTarget, idNumber);
    if (!registered.exists) {
      return Response.json({
        found: false,
        code: "ID_NOT_REGISTERED",
        error: "תעודת הזהות לא נמצאה בגיליון הרישום. אם הרישום החדש כבוי, יש לפנות למנהל.",
      }, { status: 404 });
    }

    let firstName = registered.firstName ?? "";
    let lastName = registered.lastName ?? "";
    if ((!firstName || !lastName) && registered.studentName) {
      const split = registered.studentName.trim().split(/\s+/);
      firstName = firstName || split.shift() || "";
      lastName = lastName || split.join(" ");
    }
    if (normalizeName(firstName) !== normalizeName(enteredFirstName) ||
        normalizeName(lastName) !== normalizeName(enteredLastName)) {
      return Response.json({
        found: false,
        code: "NAME_MISMATCH",
        error: "השם או שם המשפחה אינם תואמים לרשומה של תעודת הזהות. לא הוצגו נתונים.",
      }, { status: 403 });
    }

    const row = await findPersonalCodeRowByName(firstName, lastName);
    if (!row.found) {
      const fullName = (firstName + " " + lastName).trim();
      return Response.json({
        ...row,
        registeredName: fullName,
        registrationRowNumber: registered.rowNumber,
        error: 'השם "' + fullName + '" לא נמצא בגיליון הנתונים השני. בדוק את האיות ואת הרשאות הגישה.',
      });
    }
    return Response.json({
      ...row,
      registeredName: (firstName + " " + lastName).trim(),
      registrationRowNumber: registered.rowNumber,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "החיפוש בגיליון הנתונים נכשל";
    return Response.json({ found: false, error: message }, { status: 502 });
  }
}
