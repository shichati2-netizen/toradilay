import { checkAdmin } from "@/lib/server/guard";
import { extractGoogleId, normalizeWebhookUrl } from "@/lib/defaults";
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

    const spreadsheetId = extractGoogleId(String(body.spreadsheetId ?? "")).replace(
      /[^A-Za-z0-9_-]/g,
      "",
    );
    if (spreadsheetId.length < 10) {
      return Response.json({ ok: false, error: "מזהה גיליון לא תקין" });
    }

    const target = await resolveTarget({
      spreadsheetId,
      webhookUrl: normalizeWebhookUrl(body.webhookUrl),
    });
    if (!target) {
      return Response.json({
        ok: false,
        error: "לא הוגדרה שיטת חיבור. העלה JSON של חשבון שירות בלשונית חשבון Google ודרייב, והענק לו גישה לגיליון.",
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
