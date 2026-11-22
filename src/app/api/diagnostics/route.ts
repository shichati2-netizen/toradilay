import { writeDiagnosticLog } from "@/lib/server/diagnostic-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EVENTS = new Set(["window.error", "window.unhandledrejection"]);

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 20_000) {
      return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    }
    const body = JSON.parse(raw) as {
      event?: unknown;
      details?: unknown;
      page?: unknown;
    };
    if (typeof body.event !== "string" || !ALLOWED_EVENTS.has(body.event)) {
      return Response.json({ ok: false, error: "invalid_event" }, { status: 400 });
    }
    writeDiagnosticLog({
      level: "error",
      event: "renderer." + body.event,
      details: {
        page: typeof body.page === "string" ? body.page.slice(0, 300).split("?")[0] : undefined,
        details: body.details,
      },
    });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
