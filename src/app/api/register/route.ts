import { getStoredConfig } from "@/lib/server/settings";
import { appendLocalRegistration } from "@/lib/server/registrations";
import { validateRegistration } from "@/lib/server/registration-validation";
import { logActivity } from "@/lib/server/activity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** רישום תלמיד חדש לקובץ CSV מקומי, ללא צורך בחיבור ל-Google. */
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
    const result = appendLocalRegistration(v.payload);
    await logActivity({
      type: "register",
      studentId: v.payload.idNumber,
      fileName: fullName,
      detail: `ועד ${v.payload.vaad} · CSV שורה ${result.rowNumber}`,
    });
    return Response.json({
      success: true,
      message: "הרישום נשמר בקובץ המקומי",
      filePath: result.filePath,
      rowNumber: result.rowNumber,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "אירעה שגיאה בעת שמירת הרישום בקובץ המקומי";
    await logActivity({
      type: "register",
      studentId: v.payload.idNumber,
      fileName: fullName,
      success: false,
      detail: message,
    });
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
