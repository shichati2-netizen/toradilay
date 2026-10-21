import { getStoredConfig } from "@/lib/server/settings";
import { findLocalRegistration } from "@/lib/server/registrations";

export const dynamic = "force-dynamic";

/** בדיקת כפילות בקובץ הרישומים המקומי. */
export async function POST(req: Request) {
  let idNumber = "";
  try {
    const body = (await req.json()) as { idNumber?: string };
    idNumber = String(body.idNumber ?? "").replace(/\D/g, "");
  } catch {
    /* handled below */
  }

  if (!/^\d{5,9}$/.test(idNumber)) {
    return Response.json({ error: "מספר תעודת זהות לא תקין" }, { status: 400 });
  }

  const cfg = await getStoredConfig();
  if (!cfg.registrationEnabled) {
    return Response.json({ error: "הרישום מהעמדה כבוי בהגדרות" }, { status: 403 });
  }

  try {
    return Response.json(findLocalRegistration(idNumber));
  } catch (err) {
    const message = err instanceof Error ? err.message : "קריאת קובץ הרישום נכשלה";
    return Response.json({ error: message, code: "LOCAL_FILE_ERROR" }, { status: 500 });
  }
}
