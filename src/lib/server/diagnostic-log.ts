import fs from "node:fs";
import path from "node:path";

type DiagnosticLevel = "info" | "warn" | "error" | "fatal";

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:access_token|refresh_token|token|key|api_key|pin)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(access_token|refresh_token|token|password|secret|api[_-]?key|authorization|pin)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b\d{9,12}\b/g, "[ID]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .slice(0, 12000);
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[MAX_DEPTH]";
  if (value instanceof Error) {
    return {
      name: redactString(value.name),
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 60)) {
      output[key] = /token|secret|password|authorization|cookie|api.?key|^pin$/i.test(key)
        ? "[REDACTED]"
        : sanitize(item, depth + 1);
    }
    return output;
  }
  return redactString(String(value));
}

function rotateIfNeeded(file: string): void {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size < 5 * 1024 * 1024) return;
    for (let index = 3; index >= 1; index--) {
      const from = index === 1 ? file : file + "." + (index - 1);
      const to = file + "." + index;
      if (fs.existsSync(from)) {
        if (index === 3 && fs.existsSync(to)) fs.unlinkSync(to);
        fs.renameSync(from, to);
      }
    }
  } catch {
    // Rotation failure must not interrupt a user action.
  }
}

export function writeDiagnosticLog(input: {
  level?: DiagnosticLevel;
  event: string;
  details?: unknown;
}): void {
  try {
    const dataDirectory = process.env.KIOSK_DATA_DIR?.trim() || path.join(process.cwd(), ".toradilay-data");
    const directory = path.join(dataDirectory, "logs");
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "toradelia-diagnostics.jsonl");
    rotateIfNeeded(file);
    const record = {
      timestamp: new Date().toISOString(),
      level: input.level ?? "error",
      event: redactString(input.event).slice(0, 160),
      source: "next-server",
      pid: process.pid,
      details: sanitize(input.details ?? {}),
    };
    fs.appendFileSync(file, JSON.stringify(record) + "\n", { encoding: "utf8", mode: 0o600 });
  } catch {
    // Diagnostics are best-effort and must never cause another application failure.
  }
}


export interface DiagnosticLogEntry {
  timestamp: string;
  level: DiagnosticLevel;
  event: string;
  source?: string;
  pid?: number;
  appVersion?: string;
  details?: unknown;
}

/** Reads the newest entries from the active log and its rotated archives. */
export function readDiagnosticLogs(limit = 200): DiagnosticLogEntry[] {
  const dataDirectory = process.env.KIOSK_DATA_DIR?.trim() || path.join(process.cwd(), ".toradilay-data");
  const directory = path.join(dataDirectory, "logs");
  const file = path.join(directory, "toradelia-diagnostics.jsonl");
  const entries: DiagnosticLogEntry[] = [];

  for (let archive = 4; archive >= 0; archive--) {
    const candidate = archive === 0 ? file : file + "." + archive;
    try {
      if (!fs.existsSync(candidate)) continue;
      const lines = fs.readFileSync(candidate, "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const value = JSON.parse(line) as Partial<DiagnosticLogEntry>;
          if (
            typeof value.timestamp === "string" &&
            typeof value.event === "string" &&
            (value.level === "info" || value.level === "warn" || value.level === "error" || value.level === "fatal")
          ) {
            entries.push({
              timestamp: value.timestamp,
              level: value.level,
              event: redactString(value.event),
              source: typeof value.source === "string" ? redactString(value.source) : "electron",
              pid: typeof value.pid === "number" ? value.pid : undefined,
              appVersion: typeof value.appVersion === "string" ? value.appVersion : undefined,
              details: sanitize(value.details ?? {}),
            });
          }
        } catch {
          // Ignore a single malformed JSONL line; keep the remaining diagnostics.
        }
      }
    } catch {
      // An inaccessible rotated file must not hide readable current logs.
    }
  }

  return entries
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, Math.max(1, Math.min(500, Math.floor(limit))));
}
