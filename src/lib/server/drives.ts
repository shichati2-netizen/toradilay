import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { getDriveSequence } from "@/lib/defaults";
import type { KioskConfig, KioskFile, RemovableDrive } from "@/lib/types";
import { isWordItem, normalizeFolderName, registerLocalFile, toKioskFile } from "./drive";

export const isWindows = process.platform === "win32";

const g = globalThis as typeof globalThis & {
  __kioskRemovable?: { ts: number; drives: RemovableDrive[] };
};

/** זיהוי דיסק און קי (DriveType=2) בווינדוס. בשאר המערכות מחזיר רשימה ריקה */
export function detectRemovableDrives(): RemovableDrive[] {
  if (!isWindows) return [];

  const cached = g.__kioskRemovable;
  if (cached && Date.now() - cached.ts < 3000) return cached.drives;

  const results: RemovableDrive[] = [];
  try {
    const ps =
      'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | Select-Object -Property DeviceID, VolumeName | ConvertTo-Json -Compress"';
    const output = execSync(ps, { encoding: "utf8", timeout: 2500 }).trim();
    if (output) {
      const parsed = JSON.parse(output);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item?.DeviceID) continue;
        const letter = String(item.DeviceID)
          .replace(/[^A-Za-z]/g, "")
          .toUpperCase();
        if (!letter) continue;
        results.push({
          letter,
          name: item.VolumeName
            ? `${item.VolumeName} (${letter}:)`
            : `דיסק און קי (${letter}:)`,
          isRemovable: true,
        });
      }
    }
  } catch {
    for (const d of ["E", "F", "G", "H", "D", "I", "J"]) {
      try {
        if (fs.existsSync(`${d}:\\`)) {
          results.push({ letter: d, name: `כונן נשלף (${d}:)`, isRemovable: true });
        }
      } catch {
        /* ignore */
      }
    }
  }

  g.__kioskRemovable = { ts: Date.now(), drives: results };
  return results;
}

export interface CopyOutcome {
  /** server = נכתב ישירות לכונן בשרת/עמדה; download = יש להוריד בדפדפן */
  mode: "server" | "download";
  success: boolean;
  path?: string;
  driveLetter?: string;
  isRemovable?: boolean;
  isFallback?: boolean;
  message: string;
}

type TargetCfg = Pick<
  KioskConfig,
  | "targetDriveLetter"
  | "targetFolderName"
  | "fallbackDriveCount"
  | "autoDetectRemovableDrive"
  | "limitToDEOnly"
>;

function candidateDrives(cfg: TargetCfg): string[] {
  let candidates: string[] = [];
  if (cfg.autoDetectRemovableDrive) {
    for (const r of detectRemovableDrives()) {
      if (!candidates.includes(r.letter)) candidates.push(r.letter);
    }
  }
  for (const d of getDriveSequence(
    cfg.targetDriveLetter,
    cfg.fallbackDriveCount,
    cfg.limitToDEOnly,
  )) {
    if (!candidates.includes(d)) candidates.push(d);
  }
  if (cfg.limitToDEOnly) {
    candidates = candidates.filter((d) => d === "D" || d === "E");
  }
  return candidates;
}

/**
 * מעתיק קובץ לכונן היעד. בווינדוס: זיהוי אוטומטי של דיסק און קי וסריקת
 * אותיות חלופיות. בשרת שאינו ווינדוס: מחזיר mode=download והלקוח מוריד את הקובץ.
 */
export function copyToTarget(
  buffer: Buffer,
  fileName: string,
  cfg: TargetCfg,
): CopyOutcome {
  const safeName = path.basename(fileName).replace(/[\\/:*?"<>|]/g, "_");

  if (!isWindows) {
    return {
      mode: "download",
      success: true,
      message: "השרת אינו ווינדוס, הקובץ יורד ישירות למחשב",
    };
  }

  const removables = detectRemovableDrives();
  const candidates = candidateDrives(cfg);

  for (const letter of candidates) {
    const root = `${letter}:\\`;
    const dir = `${letter}:\\${cfg.targetFolderName}`;
    const filePath = path.join(dir, safeName);
    try {
      if (fs.existsSync(root) || candidates.length === 1) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, buffer);
        const isRemovable = removables.some((r) => r.letter === letter);
        const isFallback = letter !== cfg.targetDriveLetter;
        return {
          mode: "server",
          success: true,
          path: filePath,
          driveLetter: letter,
          isRemovable,
          isFallback,
          message: isRemovable
            ? `הקובץ נשמר בדיסק און קי (כונן ${letter}:)`
            : isFallback
              ? `הקובץ הועתק לכונן ${letter}: (${filePath})`
              : `הקובץ הועתק לנתיב ${filePath}`,
        };
      }
    } catch (err) {
      console.warn(`[copy] cannot write to drive ${letter}:`, err);
    }
  }

  return {
    mode: "server",
    success: false,
    message: `לא נמצא כונן זמין לכתיבה (נבדקו: ${candidates.map((c) => c + ":").join(", ")}). חבר דיסק און קי ונסה שוב.`,
  };
}

/** חיפוש תיקיית תלמיד בכוננים מקומיים / דיסק און קי (גיבוי כשהדרייב לא זמין) */
export async function searchLocalFolder(
  cleanId: string,
  cfg: TargetCfg,
  studentName?: string,
): Promise<{ folderName: string; files: KioskFile[] } | null> {
  const folder = cfg.targetFolderName;
  const candidatePaths: string[] = [];

  if (isWindows) {
    for (const d of candidateDrives(cfg)) {
      candidatePaths.push(`${d}:\\${folder}`, `${d}:\\`);
    }
  } else {
    const sim = path.join(process.cwd(), "drive_d_sim");
    candidatePaths.push(path.join(sim, `${cfg.targetDriveLetter}_${folder}`), sim);
  }

  for (const searchPath of candidatePaths) {
    try {
      if (!fs.existsSync(searchPath) || !fs.statSync(searchPath).isDirectory()) {
        continue;
      }
      const entries = fs.readdirSync(searchPath, { withFileTypes: true });
      const dirs = entries.filter((entry) => entry.isDirectory());
      const dirById =
        dirs.find((entry) => entry.name.trim() === cleanId) ||
        dirs.find((entry) => entry.name.trim().startsWith(cleanId)) ||
        dirs.find((entry) => entry.name.includes(cleanId));

      const nameParts = String(studentName ?? "").trim().split(/\s+/).filter(Boolean);
      const nameKeys = [...new Set([
        normalizeFolderName(studentName ?? ""),
        normalizeFolderName(nameParts.slice().reverse().join(" ")),
      ])].filter((key) => key.length >= 4);
      const dirByName = nameKeys.length
        ? dirs.find((entry) => {
            const key = normalizeFolderName(entry.name);
            return nameKeys.some((candidate) => key === candidate || key.includes(candidate));
          })
        : undefined;
      const dir = dirById || dirByName;
      if (!dir) continue;

      const dirPath = path.join(searchPath, dir.name);
      const files: KioskFile[] = fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter((f) => f.isFile())
        .map((f) => {
          const full = path.join(dirPath, f.name);
          const st = fs.statSync(full);
          const id = registerLocalFile(full, f.name);
          return toKioskFile({
            id,
            name: f.name,
            mimeType: isWordItem(f.name, "")
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "application/octet-stream",
            size: st.size,
            modifiedTime: st.mtime.toISOString(),
          });
        });
      return { folderName: dir.name, files };
    } catch (err) {
      console.warn("[local-search] error in", searchPath, err);
    }
  }
  return null;
}
