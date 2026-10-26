import { getStoredConfig, verifyPin } from "@/lib/server/settings";
import { getLocalRegistrationFilePath } from "@/lib/server/registrations";
import { loadServiceAccount, PERSONAL_CODE_LOOKUP_SPREADSHEET_ID } from "@/lib/server/sheets";
import type { RegistrationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/** מדווח אם הרישום לגיליון זמין; CSV מקומי משמש רק כגיבוי למיפוי שמות. */
export async function GET(req: Request) {
  const cfg = await getStoredConfig();
  const serviceAccount = loadServiceAccount();
  const hasValidSpreadsheetId = /^[A-Za-z0-9_-]{10,}$/.test(PERSONAL_CODE_LOOKUP_SPREADSHEET_ID);
  const configured = Boolean(serviceAccount && hasValidSpreadsheetId);
  const status: RegistrationStatus = {
    enabled: cfg.registrationEnabled,
    configured,
    method: configured ? "service-account" : null,
    spreadsheetId: PERSONAL_CODE_LOOKUP_SPREADSHEET_ID,
  };

  const pin = req.headers.get("x-admin-pin");
  if (pin && (await verifyPin(pin))) {
    status.googleAccountEmail = cfg.googleAccount?.email ?? null;
    status.serviceAccountEmail = serviceAccount?.client_email ?? null;
    status.localFilePath = getLocalRegistrationFilePath();
  }

  return Response.json(status);
}
