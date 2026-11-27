import { getFileBuffer, getKnownFileName } from "@/lib/server/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function mimeTypeForName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId") ?? "";
  if (!fileId) {
    return Response.json({ error: "fileId is required" }, { status: 400 });
  }

  try {
    const buffer = await getFileBuffer(fileId);
    const name = getKnownFileName(fileId) || searchParams.get("name") || "document";
    const safe = name.replace(/[\\/:*?"<>|\r\n]/g, "_");
    const inline = searchParams.get("inline") === "1" && name.toLowerCase().endsWith(".pdf");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mimeTypeForName(name),
        "Content-Length": String(buffer.length),
        "Content-Disposition": (inline ? "inline" : "attachment") + "; filename*=UTF-8''" + encodeURIComponent(safe),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "שגיאה בהורדה";
    return Response.json({ error: message }, { status: 502 });
  }
}
