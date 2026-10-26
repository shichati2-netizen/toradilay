import { findPersonalCodeRowByName } from "@/lib/server/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\\u0591-\\u05C7]/g, "")
    .replace(/[^\\p{L}\\p{N}]/gu, "")
    .toLocaleLowerCase("he-IL");
}

/**
 * חיפוש קוד אישי לפי שם בלבד. תעודת זהות אינה חלק מהבקשה, אינה נקראת
 * מהגוף ואינה נשמרת. מוחזר ללקוח רק ערך עמודת סיסמת המרכזייה.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { firstName?: string; lastName?: string };
    const firstName = String(body.firstName ?? "").trim().replace(/\\s+/g, " ").slice(0, 60);
    const lastName = String(body.lastName ?? "").trim().replace(/\\s+/g, " ").slice(0, 60);

    if (firstName.length < 2 || lastName.length < 2) {
      return Response.json(
        { found: false, error: "נא להזין שם פרטי ושם משפחה תקינים." },
        { status: 400 },
      );
    }

    const row = await findPersonalCodeRowByName(firstName, lastName);
    if (!row.found) {
      return Response.json({
        found: false,
        error: 'לא נמצאה התאמה לשם "' + firstName + " " + lastName + '". בדוק את האיות ונסה שוב.',
      });
    }

    const passwordIndex = row.headers.findIndex((header) => {
      const normalized = normalizeHeader(header);
      return normalized.includes("סיסמתמרכז") || normalized === "קודאישי" || normalized === "personalcode";
    });
    if (passwordIndex < 0) {
      return Response.json({
        found: false,
        error: 'נמצאה שורה בשם המבוקש, אבל לא נמצאה עמודת "סיסמת מרכזייה" או "קוד אישי" בכותרות הגיליון.',
      });
    }

    const personalCode = String(row.values[passwordIndex] ?? "").trim();
    if (!personalCode) {
      return Response.json({
        found: false,
        error: "נמצאה רשומה תואמת, אבל שדה הקוד האישי ריק.",
      });
    }

    return Response.json({
      found: true,
      matchedName: firstName + " " + lastName,
      personalCode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "החיפוש בגיליון הנתונים נכשל";
    return Response.json({ found: false, error: message }, { status: 502 });
  }
}
