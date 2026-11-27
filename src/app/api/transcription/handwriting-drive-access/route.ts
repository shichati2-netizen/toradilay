import { checkAdmin } from "@/lib/server/guard";
import { scrapeFolder } from "@/lib/server/drive";
import { getTranscriptionHandwritingDriveServiceAccountJson, getTranscriptionSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** בדיקת גישה בפועל לתיקיית האב של כתב היד, עם החשבון הייעודי אם הוגדר. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { pin?: string; rootFolderId?: string };
    const check = await checkAdmin(body.pin);
    if (!check.ok) return Response.json({ ok: false, error: check.error }, { status: check.status });

    const rootFolderId = String(body.rootFolderId ?? "").trim().replace(/^.*\/folders\//, "").split(/[?/#]/)[0];
    if (!/^[A-Za-z0-9_-]{10,120}$/.test(rootFolderId)) {
      return Response.json({ ok: false, error: "מזהה תיקיית האב אינו תקין." }, { status: 400 });
    }

    const settings = await getTranscriptionSettings();
    const serviceAccountJson = await getTranscriptionHandwritingDriveServiceAccountJson();
    const started = Date.now();
    const result = await scrapeFolder(rootFolderId, {
      fresh: true,
      serviceAccountJson: serviceAccountJson || undefined,
    });

    return Response.json({
      ok: result.ok,
      authMode: result.authMode,
      accountEmail: settings.handwritingDriveAccountConfigured
        ? settings.handwritingDriveAccountEmail
        : undefined,
      dedicatedAccount: settings.handwritingDriveAccountConfigured,
      folderCount: result.folders.length,
      fileCount: result.files.length,
      sample: result.folders.slice(0, 5).map((folder) => folder.name),
      ms: Date.now() - started,
      error: result.ok
        ? undefined
        : result.authError || "אין גישה לתיקיית האב. שתף אותה עם חשבון הגישה או אפשר גישה ציבורית באמצעות קישור.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "בדיקת הגישה לתיקייה נכשלה.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}