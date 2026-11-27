import { getStoredConfig, isHandwritingAccessAllowed } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/** בודק בנפרד גישה לתמלול כתב יד; התמלול הקולי נשאר פתוח כבעבר. */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { studentId?: string };
    const studentId = String(body.studentId || "").replace(/\D/g, "").slice(0, 12);
    const valid = /^\d{9}$/.test(studentId);
    const config = await getStoredConfig();
    const handwritingConfigured = config.localHandwritingSearchEnabled
      ? Boolean(config.localHandwritingSearchPath.trim())
      : /^[A-Za-z0-9_-]{10,120}$/.test(config.transcriptionHandwritingRootFolderId || "");
    const handwritingAllowed =
      valid &&
      handwritingConfigured &&
      isHandwritingAccessAllowed(studentId, config);
    return Response.json({
      enabled: valid,
      allowed: valid,
      handwritingConfigured,
      handwritingAllowed,
      handwritingRestricted: config.transcriptionHandwritingAccessRestricted,
    });
  } catch {
    return Response.json({ enabled: false, allowed: false, handwritingAllowed: false }, { status: 400 });
  }
}
