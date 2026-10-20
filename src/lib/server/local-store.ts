import fs from "node:fs";
import path from "node:path";

/** יומן מקומי לקיוסק. נשמר מחוץ לתיקיית ההתקנה כדי שעדכונים לא ימחקו נתונים. */
export interface LocalActivityRecord {
  id: number;
  type: string;
  studentRef: string | null;
  fileName: string | null;
  detail: string | null;
  success: boolean;
  createdAt: string;
}

function dataDirectory(): string {
  return process.env.KIOSK_DATA_DIR?.trim() || path.join(process.cwd(), ".toradilay-data");
}

function ensureDataDirectory(): string {
  const directory = dataDirectory();
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function settingsFile(): string {
  return path.join(dataDirectory(), "kiosk-settings.json");
}

function activityFile(): string {
  return path.join(dataDirectory(), "kiosk-activity.jsonl");
}

export function readLocalSettings(): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[local-store] could not read settings:", error);
    }
    return null;
  }
}

/** מיזוג הגדרות אטומי: קובץ זמני + rename, בלי שרת מסד נתונים. */
export async function mergeLocalSettings(
  initial: Record<string, unknown>,
  patch: Record<string, unknown>,
): Promise<void> {
  const directory = ensureDataDirectory();
  const existing = readLocalSettings();
  const next = existing ? { ...existing, ...patch } : { ...initial, ...patch };
  const destination = path.join(directory, "kiosk-settings.json");
  const temporary = `${destination}.${process.pid}.tmp`;

  fs.writeFileSync(temporary, JSON.stringify(next, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporary, destination);
}

let lastActivityId = 0;

export function appendLocalActivity(entry: Omit<LocalActivityRecord, "id" | "createdAt">): void {
  const directory = ensureDataDirectory();
  lastActivityId = Math.max(lastActivityId + 1, Date.now() * 1000);
  const record: LocalActivityRecord = {
    ...entry,
    id: lastActivityId,
    createdAt: new Date().toISOString(),
  };
  fs.appendFileSync(activityFile(), `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function readLocalActivities(): LocalActivityRecord[] {
  try {
    const contents = fs.readFileSync(activityFile(), "utf8");
    const records: LocalActivityRecord[] = [];
    for (const line of contents.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line) as Partial<LocalActivityRecord>;
        if (
          typeof value.id === "number" &&
          typeof value.type === "string" &&
          typeof value.createdAt === "string"
        ) {
          records.push({
            id: value.id,
            type: value.type,
            studentRef: typeof value.studentRef === "string" ? value.studentRef : null,
            fileName: typeof value.fileName === "string" ? value.fileName : null,
            detail: typeof value.detail === "string" ? value.detail : null,
            success: value.success !== false,
            createdAt: value.createdAt,
          });
        }
      } catch {
        // מתעלמים משורה פגומה בודדת כדי ששאר יומן הפעילות יישאר זמין.
      }
    }
    return records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[local-store] could not read activity log:", error);
    }
    return [];
  }
}
