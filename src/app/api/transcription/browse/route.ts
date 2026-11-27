import { getStoredConfig } from "@/lib/server/settings";
import { browseTranscriptionFiles, type TranscriptionKind } from "@/lib/server/transcription-files";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const studentId = (url.searchParams.get("studentId") || "").replace(/\D/g, "").slice(0, 12);
    const kindRaw = url.searchParams.get("kind");
    const kind: TranscriptionKind | null =
      kindRaw === "audio" ? "audio" : kindRaw === "handwriting" ? "handwriting" : null;
    const config = await getStoredConfig();
    if (kind !== "audio") {
      return Response.json({ error: "עיון בקובצי תמלול מתוך האפליקציה זמין לתמלול קולי בלבד." }, { status: 400 });
    }
    if (!config.transcriptionEnabled || !config.transcriptionAllowedStudentIds.includes(studentId)) {
      return Response.json({ error: "הגישה לתמלול אינה מאושרת לחשבון זה." }, { status: 403 });
    }
    const drive = url.searchParams.get("drive") || undefined;
    const relativePath = url.searchParams.get("path") || "";
    const result = browseTranscriptionFiles(kind, drive, relativePath, studentId);
    return Response.json(result);
  } catch (error) {
    console.warn("[transcription/browse] failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "לא ניתן לקרוא את הכונן." }, { status: 400 });
  }
}
