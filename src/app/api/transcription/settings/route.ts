import { checkAdmin } from "@/lib/server/guard";
import { getTranscriptionSettings, saveTranscriptionSettings } from "@/lib/server/settings";
import type { TranscriptionSettingsInput } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const check = await checkAdmin(req.headers.get("x-admin-pin"));
  if (!check.ok) return Response.json({ error: check.error }, { status: check.status });
  return Response.json({ settings: await getTranscriptionSettings() });
}

export async function PUT(req: Request) {
  try {
    const body = await req.json() as { pin?: string; settings?: TranscriptionSettingsInput };
    const check = await checkAdmin(body.pin);
    if (!check.ok) return Response.json({ error: check.error }, { status: check.status });
    if (!body.settings || typeof body.settings !== "object") {
      return Response.json({ error: "הגדרות התמלול חסרות." }, { status: 400 });
    }
    const settings = await saveTranscriptionSettings(body.settings);
    return Response.json({ ok: true, settings });
  } catch (error) {
    console.error("[transcription/settings] save failed:", error);
    return Response.json({ error: "שמירת הגדרות התמלול נכשלה." }, { status: 500 });
  }
}
