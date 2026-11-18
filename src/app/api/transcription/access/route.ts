import { getStoredConfig } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { studentId?: string };
    const studentId = String(body.studentId || "").replace(/\D/g, "").slice(0, 12);
    if (studentId.length !== 9) return Response.json({ enabled: false, allowed: false });
    const config = await getStoredConfig();
    const enabled = config.transcriptionEnabled === true;
    const allowed = enabled && config.transcriptionAllowedStudentIds.includes(studentId);
    return Response.json({ enabled, allowed });
  } catch {
    return Response.json({ enabled: false, allowed: false }, { status: 400 });
  }
}
