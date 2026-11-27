import { getStoredConfig } from "@/lib/server/settings";
import {
  listTranscriptionRequests,
  updateTranscriptionRequestStatus,
} from "@/lib/server/transcription-store";

export const dynamic = "force-dynamic";

async function syncReturnedStatuses(
  appsScriptUrl: string,
  appsScriptToken: string,
  studentId: string,
): Promise<void> {
  if (!appsScriptUrl || !appsScriptToken) return;

  const pending = listTranscriptionRequests(studentId)
    .filter((item) => item.status === "pending")
    .slice(0, 10);

  await Promise.all(pending.map(async (item) => {
    try {
      const url = new URL(appsScriptUrl);
      url.searchParams.set("action", "status");
      url.searchParams.set("requestId", item.id);
      url.searchParams.set("token", appsScriptToken);
      const response = await fetch(url.toString(), {
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) return;

      const result = await response.json() as {
        ok?: boolean;
        status?: string;
        savedFileNames?: unknown;
        error?: unknown;
      };
      if (result.ok !== true) return;

      if (result.status === "completed") {
        updateTranscriptionRequestStatus(item.id, "completed", {
          fileNames: Array.isArray(result.savedFileNames)
            ? result.savedFileNames.filter((name): name is string => typeof name === "string")
            : undefined,
        });
      } else if (result.status === "failed") {
        updateTranscriptionRequestStatus(item.id, "failed", {
          failureReason: typeof result.error === "string" ? result.error : "לא התקבלה תוצאה תקינה ממערכת התמלול.",
        });
      }
    } catch (error) {
      // The local request remains pending; a temporary Apps Script outage must not break the files screen.
      console.warn("[transcription/status] reply status check failed:", error);
    }
  }));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const studentId = (url.searchParams.get("studentId") || "").replace(/\D/g, "").slice(0, 12);
  if (studentId.length !== 9) return Response.json({ items: [] });

  const config = await getStoredConfig();

  await syncReturnedStatuses(
    config.transcriptionAppsScriptUrl,
    config.transcriptionAppsScriptToken,
    studentId,
  );
  return Response.json({ items: listTranscriptionRequests(studentId) });
}
