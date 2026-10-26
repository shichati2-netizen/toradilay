import { extractGoogleId } from "@/lib/defaults";
import { checkAdmin } from "@/lib/server/guard";
import { getSheetInfo, resolveTarget } from "@/lib/server/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** בדיקת חיבור לגיליון לפי הטיוטה בניהול (לפני שמירה) */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      pin?: string;
      spreadsheetId?: string;
      webhookUrl?: string;
    };
    const check = await checkAdmin(body.pin);
    if (!check.ok) {
      return Response.json({ error: check.error }, { status: check.status });
    }

    // Test the spreadsheet ID currently entered in the admin form. If blank,
    // fall back to the ID already stored in settings.
    const enteredId = typeof body.spreadsheetId === "string"
      ? extractGoogleId(body.spreadsheetId).replace(/[^A-Za-z0-9_-]/g, "")
      : "";
    const spreadsheetId = /^[A-Za-z0-9_-]{10,}$/.test(enteredId) ? enteredId : undefined;
    const target = await resolveTarget({
      spreadsheetId,
      webhookUrl: "",
    });
    if (!target || target.method !== "service-account") {
      return Response.json({
        ok: false,
        error: "לא מוגדר חשבון שירות פעיל. העלה JSON של חשבון שירות בלשונית חשבון Google ודרייב, ושמור את מזהה הגיליון.",
      });
    }

    const started = Date.now();
    const info = await getSheetInfo(target);
    return Response.json({
      ok: true,
      method: target.method,
      ms: Date.now() - started,
      title: info.title,
      sheets: info.sheets,
      firstSheetTitle: info.firstSheetTitle,
      rowCount: info.rowCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "הבדיקה נכשלה";
    return Response.json({ ok: false, error: message });
  }
}
