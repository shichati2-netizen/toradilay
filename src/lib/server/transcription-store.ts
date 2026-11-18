import fs from "node:fs";
import path from "node:path";

export type TranscriptionStatus = "pending" | "completed" | "failed";
export type TranscriptionKind = "audio" | "handwriting";
export type TranscriptionModel = "model1" | "model2";

export interface TranscriptionRequestRecord {
  id: string;
  studentId: string;
  folderId: string;
  folderName: string;
  source: "drive" | "local";
  destinationPath: string;
  kind: TranscriptionKind;
  model: TranscriptionModel;
  recipient: string;
  createdAt: string;
  status: TranscriptionStatus;
  fileNames: string[];
  failureReason?: string;
}

function storePath(): string {
  const directory = process.env.KIOSK_DATA_DIR?.trim() || path.join(process.cwd(), ".toradelia-data");
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, "transcription-requests.json");
}

function readAll(): TranscriptionRequestRecord[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TranscriptionRequestRecord =>
      Boolean(item && typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.studentId === "string" &&
        typeof item.createdAt === "string" &&
        (item.source === "drive" || item.source === "local") &&
        typeof item.destinationPath === "string" &&
        typeof item.status === "string")
    );
  } catch {
    return [];
  }
}

function writeAll(items: TranscriptionRequestRecord[]) {
  const destination = storePath();
  const temporary = destination + "." + process.pid + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(items.slice(-1000), null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporary, destination);
}

export function addTranscriptionRequest(record: TranscriptionRequestRecord) {
  const items = readAll();
  items.push(record);
  writeAll(items);
}

export function updateTranscriptionRequestStatus(
  requestId: string,
  status: Exclude<TranscriptionStatus, "pending">,
  details: { fileNames?: string[]; failureReason?: string } = {},
): boolean {
  const items = readAll();
  const index = items.findIndex((item) => item.id === requestId);
  if (index < 0) return false;

  const current = items[index];
  if (current.status !== "pending") return true;
  items[index] = {
    ...current,
    status,
    fileNames: Array.isArray(details.fileNames) && details.fileNames.length
      ? details.fileNames.slice(0, 20)
      : current.fileNames,
    failureReason: typeof details.failureReason === "string"
      ? details.failureReason.slice(0, 500)
      : undefined,
  };
  writeAll(items);
  return true;
}

export function listTranscriptionRequests(studentId: string) {
  return readAll()
    .filter((item) => item.studentId === studentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30)
    .map(({ id, kind, model, createdAt, status, fileNames, failureReason }) => ({
      id, kind, model, createdAt, status, fileNames, failureReason,
    }));
}
