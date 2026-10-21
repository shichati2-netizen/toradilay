import fs from "node:fs";
import path from "node:path";
import type { RegistrationPayload } from "@/lib/types";

export interface LocalRegistrationRecord extends RegistrationPayload {
  registeredAt: string;
  rowNumber: number;
}

const HEADERS = ["שם פרטי", "שם משפחה", "תעודת זהות", "ועד", "תאריך רישום"];

export function getLocalRegistrationFilePath(): string {
  return (
    process.env.KIOSK_REGISTRATIONS_FILE?.trim() ||
    path.join(process.env.KIOSK_DATA_DIR?.trim() || path.join(process.cwd(), ".toradilay-data"), "ToraDelia-Registrations.csv")
  );
}

function cleanCell(value: string | number): string {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

function csvCell(value: string | number, asText = false): string {
  let text = cleanCell(value);
  if (asText && text) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += ch;
    }
  }
  values.push(value);
  return values;
}

function ensureFile(): string {
  const file = getLocalRegistrationFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    fs.writeFileSync(file, "\uFEFF" + HEADERS.map(csvCell).join(",") + "\r\n", "utf8");
  }
  return file;
}

export function readLocalRegistrations(): LocalRegistrationRecord[] {
  const file = getLocalRegistrationFilePath();
  let content: string;
  try {
    content = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  return lines.slice(1).map((line, index) => {
    const row = parseCsvLine(line);
    return {
      firstName: row[0] ?? "",
      lastName: row[1] ?? "",
      idNumber: (row[2] ?? "").replace(/^'/, "").trim(),
      vaad: Number(row[3] ?? 0),
      registeredAt: row[4] ?? "",
      rowNumber: index + 2,
    };
  }).filter((row) => row.idNumber.length > 0);
}

export function findLocalRegistration(idNumber: string): {
  exists: boolean;
  studentName?: string;
  rowNumber?: number;
} {
  const cleanId = idNumber.replace(/\D/g, "");
  const match = readLocalRegistrations().find((row) => row.idNumber === cleanId);
  if (!match) return { exists: false };
  return {
    exists: true,
    studentName: `${match.firstName} ${match.lastName}`.trim() || undefined,
    rowNumber: match.rowNumber,
  };
}

export function appendLocalRegistration(payload: RegistrationPayload): {
  filePath: string;
  rowNumber: number;
  registeredAt: string;
} {
  const file = ensureFile();
  const registeredAt = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
  const currentRows = readLocalRegistrations();
  const rowNumber = currentRows.length + 2;
  const cells = [
    csvCell(payload.firstName),
    csvCell(payload.lastName),
    csvCell(payload.idNumber, true),
    csvCell(payload.vaad),
    csvCell(registeredAt),
  ];
  fs.appendFileSync(file, cells.join(",") + "\r\n", "utf8");
  return { filePath: file, rowNumber, registeredAt };
}
