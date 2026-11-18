import { getStoredConfig } from "@/lib/server/settings";
import { listTranscriptionRequests } from "@/lib/server/transcription-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const studentId = (url.searchParams.get("studentId") || "").replace(/\D/g, "").slice(0, 12);
  if (studentId.length < 5) return Response.json({ items: [] });
  const config = await getStoredConfig();
  if (!config.transcriptionEnabled || !config.transcriptionAllowedStudentIds.includes(studentId)) {
    return Response.json({ items: [] });
  }
  return Response.json({ items: listTranscriptionRequests(studentId) });
}
