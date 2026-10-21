import { getStoredConfig, verifyPin } from "@/lib/server/settings";
import { getLocalRegistrationFilePath } from "@/lib/server/registrations";
import type { RegistrationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/** רישום המקומי תמיד זמין; Google אינו נדרש כדי לרשום תלמיד. */
export async function GET(req: Request) {
  const cfg = await getStoredConfig();
  const status: RegistrationStatus = {
    enabled: cfg.registrationEnabled,
    configured: true,
    method: "local-file",
    spreadsheetId: cfg.spreadsheetId,
  };

  const pin = req.headers.get("x-admin-pin");
  if (pin && (await verifyPin(pin))) {
    status.googleAccountEmail = cfg.googleAccount?.email ?? null;
    status.localFilePath = getLocalRegistrationFilePath();
  }

  return Response.json(status);
}
