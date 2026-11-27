import { clearDriveCaches } from "@/lib/server/drive";
import { checkAdmin } from "@/lib/server/guard";
import { parseServiceAccountJson } from "@/lib/server/sheets";
import {
  getTranscriptionSettings,
  saveTranscriptionHandwritingDriveServiceAccountJson,
} from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/** שומר פרטי חשבון שירות נפרד לתיקיית תמלולי כתב היד; המפתח הפרטי לעולם לא מוחזר ללקוח. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { pin?: string; json?: string; clear?: boolean };
    const check = await checkAdmin(body.pin);
    if (!check.ok) {
      return Response.json({ ok: false, error: check.error }, { status: check.status });
    }

    if (body.clear === true) {
      await saveTranscriptionHandwritingDriveServiceAccountJson(null);
      clearDriveCaches();
      return Response.json({ ok: true, settings: await getTranscriptionSettings() });
    }

    if (typeof body.json !== "string" || !body.json.trim() || body.json.length > 100_000) {
      return Response.json(
        { ok: false, error: "יש לבחור קובץ JSON תקין של חשבון שירות Google (עד 100KB)." },
        { status: 400 },
      );
    }

    const account = parseServiceAccountJson(body.json);
    if (!account) {
      return Response.json(
        { ok: false, error: "קובץ ה-JSON אינו תקין או שחסרים בו client_email ו-private_key של חשבון שירות Google." },
        { status: 400 },
      );
    }

    // שומרים רק את הנתונים הנדרשים, ללא מטא-נתונים מיותרים מהקובץ.
    await saveTranscriptionHandwritingDriveServiceAccountJson(JSON.stringify(account));
    clearDriveCaches();
    return Response.json({ ok: true, settings: await getTranscriptionSettings() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "שמירת חשבון הגישה נכשלה.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}