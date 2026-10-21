import type { RegistrationPayload } from "@/lib/types";

/** אימות שדות רישום תלמיד לפני שמירה לקובץ המקומי. */
export function validateRegistration(
  raw: unknown,
): { ok: true; payload: RegistrationPayload } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const firstName = String(r.firstName ?? "").trim().replace(/[\r\n]+/g, " ").slice(0, 60);
  const lastName = String(r.lastName ?? "").trim().replace(/[\r\n]+/g, " ").slice(0, 60);
  const idNumber = String(r.idNumber ?? "").replace(/\D/g, "");
  const vaadNum = Number(String(r.vaad ?? "").trim());

  if (firstName.length < 2) return { ok: false, error: "נא להזין שם פרטי מדויק כפי שרשום בישיבה (לפחות 2 אותיות)" };
  if (lastName.length < 2) return { ok: false, error: "נא להזין שם משפחה מדויק כפי שרשום בישיבה (לפחות 2 אותיות)" };
  if (!/^\d{5,9}$/.test(idNumber)) return { ok: false, error: "נא להזין תעודת זהות תקינה (ספרות בלבד, 5 עד 9 ספרות)" };
  if (!Number.isInteger(vaadNum) || vaadNum < 1 || vaadNum > 99) {
    return { ok: false, error: "בוועד יש להכניס מספר תקין (לדוגמה: 1, 2, 3...)" };
  }
  return { ok: true, payload: { firstName, lastName, idNumber, vaad: vaadNum } };
}
