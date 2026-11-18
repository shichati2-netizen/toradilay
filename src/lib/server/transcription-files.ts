import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { isWindows } from "./drives";

export type TranscriptionKind = "audio" | "handwriting";

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".wma", ".opus", ".amr", ".aiff", ".aif"]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SELECTED_BYTES = 20 * 1024 * 1024;
const TOKEN_TTL = 30 * 60 * 1000;

interface FileToken {
  path: string;
  name: string;
  extension: string;
  size: number;
  kind: TranscriptionKind;
  studentId: string;
  createdAt: number;
}

function tokenStorePath(): string {
  const directory = process.env.KIOSK_DATA_DIR?.trim() || path.join(process.cwd(), ".toradelia-data");
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, "transcription-file-tokens.json");
}

function readTokenRecords(): Record<string, FileToken> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(tokenStorePath(), "utf8"));
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const cutoff = Date.now() - TOKEN_TTL;
  const output: Record<string, FileToken> = {};
  for (const [token, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const item = value as Partial<FileToken>;
    if (
      typeof item.path !== "string" ||
      typeof item.name !== "string" ||
      typeof item.extension !== "string" ||
      typeof item.size !== "number" ||
      (item.kind !== "audio" && item.kind !== "handwriting") ||
      typeof item.studentId !== "string" ||
      typeof item.createdAt !== "number" ||
      item.createdAt < cutoff
    ) continue;
    output[token] = item as FileToken;
  }
  return output;
}

function writeTokenRecords(records: Record<string, FileToken>): void {
  const destination = tokenStorePath();
  const temporary = destination + "." + process.pid + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(records), {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporary, destination);
}

function detectTranscriptionUsbDrives(): Array<{ letter: string; name: string }> {
  if (!isWindows) return [];
  try {
    const command =
      'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | Select-Object -Property DeviceID, VolumeName | ConvertTo-Json -Compress"';
    const output = execSync(command, {
      encoding: "utf8",
      timeout: 3000,
      windowsHide: true,
    }).trim();
    if (!output) return [];
    const parsed: unknown = JSON.parse(output);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object" || !("DeviceID" in row)) return [];
      const item = row as { DeviceID?: unknown; VolumeName?: unknown };
      const letter = String(item.DeviceID || "").replace(/[^A-Za-z]/g, "").toUpperCase();
      if (!/^[A-Z]$/.test(letter)) return [];
      const volume = typeof item.VolumeName === "string" ? item.VolumeName.trim() : "";
      return [{ letter, name: volume ? volume + " (" + letter + ":)" : "דיסק און קי (" + letter + ":)" }];
    });
  } catch (error) {
    console.warn("[transcription] strict USB detection failed; no drives will be shown:", error);
    return [];
  }
}

function allowedExtensions(kind: TranscriptionKind): Set<string> {
  return kind === "audio" ? AUDIO_EXTENSIONS : PDF_EXTENSIONS;
}

function safeRoot(letter: string, verifiedDrives: Array<{ letter: string; name: string }>): string {
  const clean = letter.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1);
  const drive = verifiedDrives.find((item) => item.letter === clean);
  if (!isWindows || !drive) throw new Error("הכונן אינו מזוהה כדיסק נשלף מחובר.");
  return clean + ":\\";
}

function resolveBrowsePath(root: string, relativePath: string): string {
  const segments = String(relativePath || "").split(/[\\/]+/).filter(Boolean);
  if (segments.some((part) => part === "." || part === ".." || part.includes(":") || part.includes("\0"))) {
    throw new Error("נתיב תיקייה לא תקין.");
  }
  const resolved = path.resolve(root, ...segments);
  const rel = path.relative(path.resolve(root), resolved);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new Error("הגישה לתיקייה זו חסומה.");
  }
  const realRoot = fs.realpathSync(root);
  const realTarget = fs.realpathSync(resolved);
  const realRel = path.relative(realRoot, realTarget);
  if (realRel === ".." || realRel.startsWith(".." + path.sep) || path.isAbsolute(realRel)) {
    throw new Error("הגישה מחוץ לכונן הנשלף חסומה.");
  }
  if (!fs.statSync(realTarget).isDirectory()) throw new Error("הנתיב שנבחר אינו תיקייה.");
  return realTarget;
}

export function browseTranscriptionFiles(kind: TranscriptionKind, driveLetter?: string, relativePath = "", studentId = "") {
  const ownerId = String(studentId).replace(/\D/g, "").slice(0, 12);
  if (ownerId.length !== 9) throw new Error("תעודת הזהות אינה תקינה.");
  if (!isWindows) return { drives: [], folders: [], files: [], relativePath: "" };
  const drives = detectTranscriptionUsbDrives();
  if (!driveLetter) {
    return {
      drives: drives.map((drive) => ({ letter: drive.letter, name: drive.name })),
      folders: [],
      files: [],
      relativePath: "",
    };
  }

  const root = safeRoot(driveLetter, drives);
  const current = resolveBrowsePath(root, relativePath);
  const folders: Array<{ name: string; relativePath: string }> = [];
  const files: Array<{ token: string; name: string; size: number; modifiedAt: string }> = [];
  const tokenRecords = readTokenRecords();
  const extSet = allowedExtensions(kind);

  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const fullPath = path.join(current, entry.name);
    try {
      if (entry.isDirectory()) {
        const nextPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
        folders.push({ name: entry.name, relativePath: nextPath });
      } else if (entry.isFile() && extSet.has(path.extname(entry.name).toLowerCase())) {
        const stat = fs.statSync(fullPath);
        if (stat.size <= 0 || stat.size > MAX_FILE_BYTES) continue;
        const token = crypto.randomBytes(18).toString("hex");
        tokenRecords[token] = {
          path: fullPath,
          name: entry.name,
          extension: path.extname(entry.name).toLowerCase(),
          size: stat.size,
          kind,
          studentId: ownerId,
          createdAt: Date.now(),
        };
        files.push({
          token,
          name: entry.name,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    } catch {
      // קובץ או תיקייה שאין הרשאה לקרוא אותם לא יוצגו בסייר.
    }
  }

  const tokenEntries = Object.entries(tokenRecords).sort((a, b) => a[1].createdAt - b[1].createdAt);
  while (tokenEntries.length > 3000) {
    const oldest = tokenEntries.shift();
    if (oldest) delete tokenRecords[oldest[0]];
  }
  writeTokenRecords(tokenRecords);
  folders.sort((a, b) => a.name.localeCompare(b.name, "he"));
  files.sort((a, b) => a.name.localeCompare(b.name, "he"));
  return {
    drives: drives.map((drive) => ({ letter: drive.letter, name: drive.name })),
    folders,
    files: files.slice(0, 500),
    relativePath,
  };
}

export function readSelectedTranscriptionFiles(fileTokens: string[], kind: TranscriptionKind, studentId: string) {
  if (!Array.isArray(fileTokens) || fileTokens.length < 1 || fileTokens.length > 20) {
    throw new Error("יש לבחור בין קובץ אחד ל-20 קבצים.");
  }
  const tokenRecords = readTokenRecords();
  const seen = new Set<string>();
  let totalBytes = 0;
  const selected = fileTokens.map((token) => {
    if (typeof token !== "string" || seen.has(token)) throw new Error("בחירת קבצים לא תקינה.");
    seen.add(token);
    const item = tokenRecords[token];
    if (!item || item.kind !== kind || item.studentId !== studentId || !fs.existsSync(item.path)) {
      throw new Error("אחד הקבצים כבר אינו זמין. רענן את הסייר ובחר אותו שוב.");
    }
    const stat = fs.statSync(item.path);
    if (!stat.isFile() || stat.size !== item.size || stat.size > MAX_FILE_BYTES) {
      throw new Error("אחד הקבצים השתנה או חורג מהמגבלה.");
    }
    totalBytes += stat.size;
    return {
      originalName: item.name,
      extension: item.extension,
      size: stat.size,
      buffer: fs.readFileSync(item.path),
    };
  });
  if (totalBytes > MAX_SELECTED_BYTES) {
    throw new Error("הגודל הכולל של הקבצים חורג מ-20MB. יש לפצל למספר שליחות.");
  }
  return selected;
}

export function consumeTranscriptionFileTokens(fileTokens: string[]): void {
  const tokenRecords = readTokenRecords();
  for (const token of fileTokens) delete tokenRecords[token];
  writeTokenRecords(tokenRecords);
}
