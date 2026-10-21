import { checkAdmin } from "@/lib/server/guard";
import { buildGoogleAuthStatus } from "@/lib/server/google-oauth";
import { loadServiceAccount, parseServiceAccountJson } from "@/lib/server/sheets";
import { saveGoogleServiceAccountJson } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/** שומר או מסיר פרטי חשבון שירות מקומית; המפתח הפרטי לא מוחזר ללקוח. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      pin?: string;
      json?: string;
      clear?: boolean;
    };
    const check = await checkAdmin(body.pin);
    if (!check.ok) {
      return Response.json({ ok: false, error: check.error }, { status: check.status });
    }

    if (body.clear) {
      await saveGoogleServiceAccountJson(null);
      const active = loadServiceAccount();
      return Response.json({
        ok: true,
        status: await buildGoogleAuthStatus(active?.client_email ?? null),
      });
    }

    if (typeof body.json !== "string" || !body.json.trim() || body.json.length > 100_000) {
      return Response.json(
        { ok: false, error: "יש להדביק JSON תקין של חשבון שירות (עד 100KB)." },
        { status: 400 },
      );
    }

    const account = parseServiceAccountJson(body.json);
    if (!account) {
      return Response.json(
        {
          ok: false,
          error: "ה-JSON אינו תקין או שחסרים בו client_email ו-private_key של חשבון שירות Google.",
        },
        { status: 400 },
      );
    }

    // שומרים רק את השדות הדרושים לאימות, ולא את כל המטא-נתונים בקובץ המקורי.
    await saveGoogleServiceAccountJson(JSON.stringify(account));
    const active = loadServiceAccount();
    return Response.json({
      ok: true,
      status: await buildGoogleAuthStatus(active?.client_email ?? null),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שמירת חשבון השירות נכשלה";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
