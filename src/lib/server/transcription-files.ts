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

const tokens = new Map<string, FileToken>();

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

function pruneTokens() {
  const cutoff = Date.now() - TOKEN_TTL;
  for (const [token, item] of tokens) {
    if (item.createdAt < cutoff) tokens.delete(token);
  }
  while (tokens.size > 3000) {
    const oldest = tokens.keys().next().value;
    if (!oldest) break;
    tokens.delete(oldest);
  }
}

function allowedExtensions(kind: TranscriptionKind): Set<string> {
  return kind === "audio" ? AUDIO_EXTENSIONS : PDF_EXTENSIONS;
}

function safeRoot(letter: string): string {
  const clean = letter.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1);
  const drive = detectTranscriptionUsbDrives().find((item) => item.letter === clean);
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

  const root = safeRoot(driveLetter);
  const current = resolveBrowsePath(root, relativePath);
  const folders: Array<{ name: string; relativePath: string }> = [];
  const files: Array<{ token: string; name: string; size: number; modifiedAt: string }> = [];
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
        tokens.set(token, {
          path: fullPath,
          name: entry.name,
          extension: path.extname(entry.name).toLowerCase(),
          size: stat.size,
          kind,
          studentId: ownerId,
          createdAt: Date.now(),
        });
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

  pruneTokens();
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
  pruneTokens();
  if (!Array.isArray(fileTokens) || fileTokens.length < 1 || fileTokens.length > 20) {
    throw new Error("יש לבחור בין קובץ אחד ל-20 קבצים.");
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  const selected = fileTokens.map((token) => {
    if (typeof token !== "string" || seen.has(token)) throw new Error("בחירת קבצים לא תקינה.");
    seen.add(token);
    const item = tokens.get(token);
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
  for (const token of fileTokens) tokens.delete(token);
}
