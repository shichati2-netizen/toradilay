import { findRegistrationByName, resolveTarget } from "@/lib/server/sheets";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { firstName?: unknown; lastName?: unknown } = {};
  try { body = await req.json(); } catch {
    return Response.json({ found: false, error: "בקשה לא תקינה." }, { status: 400 });
  }
  const firstName = String(body.firstName ?? "").replace(/\\s+/g, " ").trim().slice(0, 80);
  const lastName = String(body.lastName ?? "").replace(/\\s+/g, " ").trim().slice(0, 80);
  if (firstName.length < 2 || lastName.length < 2 || !/^[\\p{L}][\\p{L} .'-]*$/u.test(firstName) || !/^[\\p{L}][\\p{L} .'-]*$/u.test(lastName)) {
    return Response.json({ found: false, error: "יש להזין שם פרטי ושם משפחה תקינים." }, { status: 400 });
  }
  try {
    const target = await resolveTarget({ webhookUrl: "" });
    if (!target || target.method !== "service-account" || !/^[A-Za-z0-9_-]{10,}$/.test(target.spreadsheetId)) {
      return Response.json({ found: false, error: "חיבור גיליון הרישום אינו מוגדר. פנה למנהל." }, { status: 503 });
    }
    const result = await findRegistrationByName(target, firstName, lastName);
    if (result.ambiguous) return Response.json({ found: false, ambiguous: true });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "חיפוש השם נכשל.";
    return Response.json({ found: false, error: message }, { status: 502 });
  }
}
