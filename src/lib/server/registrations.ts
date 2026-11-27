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
  if (/^[=+@-]/.test(text) || (asText && text)) text = "'" + text;
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
    fs.writeFileSync(file, "\uFEFF" + HEADERS.map((header) => csvCell(header)).join(",") + "\r\n", "utf8");
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
  firstName?: string;
  lastName?: string;
  rowNumber?: number;
} {
  const cleanId = idNumber.replace(/\D/g, "");
  const match = readLocalRegistrations().find((row) => row.idNumber === cleanId);
  if (!match) return { exists: false };
  return {
    exists: true,
    studentName: `${match.firstName} ${match.lastName}`.trim() || undefined,
    firstName: match.firstName,
    lastName: match.lastName,
    rowNumber: match.rowNumber,
  };
}

export function upsertLocalRegistrationName(
  idNumber: string,
  firstNameInput: string,
  lastNameInput: string,
): { rowNumber: number; studentName: string } {
  const cleanId = String(idNumber).replace(/\\D/g, "");
  const firstName = String(firstNameInput).trim().replace(/[\\r\\n]+/g, " ").slice(0, 60);
  const lastName = String(lastNameInput).trim().replace(/[\\r\\n]+/g, " ").slice(0, 60);
  if (!/^\\d{5,9}$/.test(cleanId) || firstName.length < 2 || lastName.length < 2) {
    throw new Error("פרטי תעודת הזהות או השם אינם תקינים.");
  }

  const file = ensureFile();
  const records = readLocalRegistrations();
  const existingIndex = records.findIndex((row) => row.idNumber === cleanId);
  let rowNumber: number;
  if (existingIndex >= 0) {
    const existing = records[existingIndex];
    if (existing.firstName && existing.firstName !== firstName) {
      throw new Error("בקובץ הרישום המקומי מופיע שם פרטי אחר לתעודת זהות זו.");
    }
    if (existing.lastName && existing.lastName !== lastName) {
      throw new Error("בקובץ הרישום המקומי מופיע שם משפחה אחר לתעודת זהות זו.");
    }
    records[existingIndex] = {
      ...existing,
      firstName: existing.firstName || firstName,
      lastName: existing.lastName || lastName,
    };
    rowNumber = existing.rowNumber;
  } else {
    rowNumber = records.length + 2;
    records.push({
      firstName,
      lastName,
      idNumber: cleanId,
      vaad: 0,
      registeredAt: new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
      rowNumber,
    });
  }

  const lines = [
    HEADERS.map((header) => csvCell(header)).join(","),
    ...records.map((row) => [
      csvCell(row.firstName),
      csvCell(row.lastName),
      csvCell(row.idNumber, true),
      row.vaad > 0 ? csvCell(row.vaad) : '""',
      csvCell(row.registeredAt),
    ].join(",")),
  ];
  fs.writeFileSync(file, "\\uFEFF" + lines.join("\\r\\n") + "\\r\\n", "utf8");
  return { rowNumber, studentName: firstName + " " + lastName };
}

export function appendLocalRegistration(payload: RegistrationPayload): {
  filePath: string;
  rowNumber: number;
  registeredAt: string;
} {
  const file = ensureFile();
  const currentRows = readLocalRegistrations();
  const existing = currentRows.find((row) => row.idNumber === String(payload.idNumber).replace(/\D/g, ""));
  const registeredAt = existing?.registeredAt || new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
  const cells = [
    csvCell(payload.firstName),
    csvCell(payload.lastName),
    csvCell(payload.idNumber, true),
    csvCell(payload.vaad),
    csvCell(registeredAt),
  ];

  if (existing) {
    const content = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    lines[existing.rowNumber - 1] = cells.join(",");
    fs.writeFileSync(file, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
    return { filePath: file, rowNumber: existing.rowNumber, registeredAt };
  }

  const rowNumber = currentRows.length + 2;
  fs.appendFileSync(file, cells.join(",") + "\r\n", "utf8");
  return { filePath: file, rowNumber, registeredAt };
}