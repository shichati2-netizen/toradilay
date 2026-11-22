import {
  DEFAULT_ADMIN_PIN,
  DEFAULT_CONFIG,
  normalizeConfig,
  normalizeWebhookUrl,
} from "@/lib/defaults";
import type {
  GoogleOAuthClientConfig,
  KioskConfig,
  StoredConfig,
  StoredGoogleAccount,
  TranscriptionSettings,
  TranscriptionSettingsInput,
} from "@/lib/types";
import { mergeLocalSettings, readLocalSettings } from "./local-store";

function normalizeOAuthClient(raw: unknown): GoogleOAuthClientConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<GoogleOAuthClientConfig>;
  const clientId = typeof r.clientId === "string" ? r.clientId.trim().slice(0, 240) : "";
  const clientSecret =
    typeof r.clientSecret === "string" ? r.clientSecret.trim().slice(0, 240) : "";
  const clientType = r.clientType === "installed" ? "installed" : "web";
  const redirectUriOverride =
    typeof r.redirectUriOverride === "string" ? r.redirectUriOverride.trim().slice(0, 300) : "";
  if (!clientId && !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    clientType,
    redirectUriOverride: redirectUriOverride || undefined,
  };
}

function normalizeAppsScriptWebAppUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    const url = new URL(raw.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "script.google.com" ||
      !url.pathname.startsWith("/macros/s/") ||
      !url.pathname.endsWith("/exec")
    ) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeGoogleAccount(raw: unknown): StoredGoogleAccount | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<StoredGoogleAccount>;
  if (typeof r.email !== "string" || !r.email.trim()) return null;
  const refreshToken = typeof r.refreshToken === "string" ? r.refreshToken.trim() : "";
  const accessToken = typeof r.accessToken === "string" ? r.accessToken.trim() : "";
  const expiresAt =
    typeof r.expiresAt === "number" && Number.isFinite(r.expiresAt) ? r.expiresAt : 0;
  if (!refreshToken && (!accessToken || !expiresAt)) return null;
  return {
    email: r.email.trim(),
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : undefined,
    picture: typeof r.picture === "string" && r.picture.trim() ? r.picture.trim() : undefined,
    refreshToken,
    accessToken,
    expiresAt,
    scope: typeof r.scope === "string" ? r.scope : undefined,
    connectedAt:
      typeof r.connectedAt === "string" && r.connectedAt
        ? r.connectedAt
        : new Date().toISOString(),
  };
}

/** שמירת הגדרות מקומית, ללא צורך בשרת PostgreSQL. */
async function mergeStoredFields(patch: Record<string, unknown>): Promise<void> {
  const initial: StoredConfig = {
    ...DEFAULT_CONFIG,
    adminPin: DEFAULT_ADMIN_PIN,
    sheetsWebhookUrl: "",
    googleOAuthClient: null,
    googleAccount: null,
    googleServiceAccountJson: null,
    transcriptionEnabled: false,
    transcriptionAllowedStudentIds: [],
    transcriptionAudioModelOneEmail: "",
    transcriptionAudioModelTwoEmail: "",
    transcriptionHandwritingModelOneEmail: "",
    transcriptionHandwritingModelTwoEmail: "",
    transcriptionAudioModelOneReplyEmail: "",
    transcriptionAudioModelTwoReplyEmail: "",
    transcriptionHandwritingModelOneReplyEmail: "",
    transcriptionHandwritingModelTwoReplyEmail: "",
    transcriptionAppsScriptUrl: "",
    transcriptionAppsScriptToken: "",
    ...(patch as Partial<StoredConfig>),
  };
  await mergeLocalSettings(
    initial as unknown as Record<string, unknown>,
    patch,
  );
}

export async function getStoredConfig(): Promise<StoredConfig> {
  try {
    const raw = (readLocalSettings() ?? {}) as Partial<StoredConfig> & Record<string, unknown>;
    const pin =
      typeof raw.adminPin === "string" && raw.adminPin.length >= 4
        ? raw.adminPin
        : DEFAULT_ADMIN_PIN;
    return {
      ...normalizeConfig(raw),
      adminPin: pin,
      sheetsWebhookUrl: normalizeWebhookUrl(raw.sheetsWebhookUrl),
      googleOAuthClient: normalizeOAuthClient(raw.googleOAuthClient),
      googleAccount: normalizeGoogleAccount(raw.googleAccount),
      googleServiceAccountJson:
        typeof raw.googleServiceAccountJson === "string" && raw.googleServiceAccountJson.trim()
          ? raw.googleServiceAccountJson
          : null,
      transcriptionEnabled: raw.transcriptionEnabled === true,
      transcriptionAllowedStudentIds: Array.isArray(raw.transcriptionAllowedStudentIds)
        ? [...new Set(raw.transcriptionAllowedStudentIds
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.replace(/\D/g, "").slice(0, 12))
            .filter((value) => value.length === 9))]
        : [],
      transcriptionAudioModelOneEmail: typeof raw.transcriptionAudioModelOneEmail === "string"
        ? raw.transcriptionAudioModelOneEmail.trim().slice(0, 254)
        : typeof raw.transcriptionModelOneEmail === "string" ? raw.transcriptionModelOneEmail.trim().slice(0, 254) : "",
      transcriptionAudioModelTwoEmail: typeof raw.transcriptionAudioModelTwoEmail === "string"
        ? raw.transcriptionAudioModelTwoEmail.trim().slice(0, 254)
        : typeof raw.transcriptionModelTwoEmail === "string" ? raw.transcriptionModelTwoEmail.trim().slice(0, 254) : "",
      transcriptionHandwritingModelOneEmail: typeof raw.transcriptionHandwritingModelOneEmail === "string"
        ? raw.transcriptionHandwritingModelOneEmail.trim().slice(0, 254) : "",
      transcriptionHandwritingModelTwoEmail: typeof raw.transcriptionHandwritingModelTwoEmail === "string"
        ? raw.transcriptionHandwritingModelTwoEmail.trim().slice(0, 254) : "",
      transcriptionAudioModelOneReplyEmail: typeof raw.transcriptionAudioModelOneReplyEmail === "string"
        ? raw.transcriptionAudioModelOneReplyEmail.trim().slice(0, 254) : "",
      transcriptionAudioModelTwoReplyEmail: typeof raw.transcriptionAudioModelTwoReplyEmail === "string"
        ? raw.transcriptionAudioModelTwoReplyEmail.trim().slice(0, 254) : "",
      transcriptionHandwritingModelOneReplyEmail: typeof raw.transcriptionHandwritingModelOneReplyEmail === "string"
        ? raw.transcriptionHandwritingModelOneReplyEmail.trim().slice(0, 254) : "",
      transcriptionHandwritingModelTwoReplyEmail: typeof raw.transcriptionHandwritingModelTwoReplyEmail === "string"
        ? raw.transcriptionHandwritingModelTwoReplyEmail.trim().slice(0, 254) : "",
      transcriptionAppsScriptUrl: normalizeAppsScriptWebAppUrl(
        typeof raw.transcriptionAppsScriptUrl === "string" && raw.transcriptionAppsScriptUrl.trim()
          ? raw.transcriptionAppsScriptUrl
          : raw.transcriptionReplyStatusUrl
      ),
      transcriptionAppsScriptToken: typeof raw.transcriptionAppsScriptToken === "string"
        ? raw.transcriptionAppsScriptToken.trim().slice(0, 256) : "",
    };
  } catch (err) {
    console.error("[settings] failed to load, using defaults:", err);
    return {
      ...DEFAULT_CONFIG,
      adminPin: DEFAULT_ADMIN_PIN,
      sheetsWebhookUrl: "",
      googleOAuthClient: null,
      googleAccount: null,
      googleServiceAccountJson: null,
      transcriptionEnabled: false,
      transcriptionAllowedStudentIds: [],
      transcriptionAudioModelOneEmail: "",
      transcriptionAudioModelTwoEmail: "",
      transcriptionHandwritingModelOneEmail: "",
      transcriptionHandwritingModelTwoEmail: "",
      transcriptionAudioModelOneReplyEmail: "",
      transcriptionAudioModelTwoReplyEmail: "",
      transcriptionHandwritingModelOneReplyEmail: "",
      transcriptionHandwritingModelTwoReplyEmail: "",
      transcriptionAppsScriptUrl: "",
      transcriptionAppsScriptToken: "",
    };
  }
}

/** ההגדרות שנשלחות ללקוח: בלי קוד מנהל, בלי מפתחות OAuth, ובלי טוקנים */
export async function getPublicConfig(): Promise<KioskConfig> {
  const {
    adminPin: _pin,
    sheetsWebhookUrl: _hook,
    googleOAuthClient: _oauth,
    googleAccount: _account,
    googleServiceAccountJson: _serviceAccountJson,
    transcriptionEnabled: _transcriptionEnabled,
    transcriptionAllowedStudentIds: _transcriptionAllowedStudentIds,
    transcriptionAudioModelOneEmail: _transcriptionAudioModelOneEmail,
    transcriptionAudioModelTwoEmail: _transcriptionAudioModelTwoEmail,
    transcriptionHandwritingModelOneEmail: _transcriptionHandwritingModelOneEmail,
    transcriptionHandwritingModelTwoEmail: _transcriptionHandwritingModelTwoEmail,
    transcriptionAudioModelOneReplyEmail: _transcriptionAudioModelOneReplyEmail,
    transcriptionAudioModelTwoReplyEmail: _transcriptionAudioModelTwoReplyEmail,
    transcriptionHandwritingModelOneReplyEmail: _transcriptionHandwritingModelOneReplyEmail,
    transcriptionHandwritingModelTwoReplyEmail: _transcriptionHandwritingModelTwoReplyEmail,
    transcriptionAppsScriptUrl: _transcriptionAppsScriptUrl,
    transcriptionAppsScriptToken: _transcriptionAppsScriptToken,
    ...config
  } = await getStoredConfig();
  void _pin;
  void _hook;
  void _oauth;
  void _account;
  void _serviceAccountJson;
  void _transcriptionEnabled;
  void _transcriptionAllowedStudentIds;
  void _transcriptionAudioModelOneEmail;
  void _transcriptionAudioModelTwoEmail;
  void _transcriptionHandwritingModelOneEmail;
  void _transcriptionHandwritingModelTwoEmail;
  void _transcriptionAudioModelOneReplyEmail;
  void _transcriptionAudioModelTwoReplyEmail;
  void _transcriptionHandwritingModelOneReplyEmail;
  void _transcriptionHandwritingModelTwoReplyEmail;
  void _transcriptionAppsScriptUrl;
  void _transcriptionAppsScriptToken;
  return config;
}

export async function verifyPin(pin: unknown): Promise<boolean> {
  if (typeof pin !== "string" || !pin) return false;
  const stored = await getStoredConfig();
  return pin.trim() === stored.adminPin;
}

export async function saveConfig(
  next: unknown,
  opts: { newPin?: string; sheetsWebhookUrl?: string } = {},
): Promise<KioskConfig> {
  const current = await getStoredConfig();
  const normalized = normalizeConfig(next);
  const pin =
    typeof opts.newPin === "string" && /^\d{4,12}$/.test(opts.newPin.trim())
      ? opts.newPin.trim()
      : current.adminPin;
  const sheetsWebhookUrl =
    typeof opts.sheetsWebhookUrl === "string"
      ? normalizeWebhookUrl(opts.sheetsWebhookUrl)
      : current.sheetsWebhookUrl;

  await mergeStoredFields({
    ...normalized,
    adminPin: pin,
    sheetsWebhookUrl,
  });

  return normalized;
}

/** שמירת מפתחות ה-OAuth של Google (שומר סוד קיים אם נשלח ריק בעדכון) */
export async function saveGoogleOAuthClient(
  input: Partial<GoogleOAuthClientConfig> | null,
): Promise<GoogleOAuthClientConfig | null> {
  if (!input) {
    await mergeStoredFields({ googleOAuthClient: null });
    return null;
  }
  const current = await getStoredConfig();
  const clientId = typeof input.clientId === "string" ? input.clientId.trim() : "";
  const incomingSecret =
    typeof input.clientSecret === "string" ? input.clientSecret.trim() : "";
  const preservedSecret =
    !incomingSecret && current.googleOAuthClient?.clientId === clientId
      ? current.googleOAuthClient.clientSecret
      : !incomingSecret && current.googleOAuthClient?.clientSecret && !clientId
        ? current.googleOAuthClient.clientSecret
        : incomingSecret;

  const normalized = normalizeOAuthClient({
    clientId: clientId || current.googleOAuthClient?.clientId || "",
    clientSecret: preservedSecret,
    clientType: input.clientType ?? current.googleOAuthClient?.clientType ?? "web",
    redirectUriOverride:
      input.redirectUriOverride !== undefined
        ? input.redirectUriOverride
        : current.googleOAuthClient?.redirectUriOverride,
  });

  await mergeStoredFields({ googleOAuthClient: normalized });
  return normalized;
}

/** שמירת JSON של חשבון שירות מקומי, בלי לחשוף אותו ללקוח. */
export async function saveGoogleServiceAccountJson(json: string | null): Promise<void> {
  await mergeStoredFields({ googleServiceAccountJson: json });
}

/** שמירה או ניתוק של חשבון ה-Google המחובר */
export async function saveGoogleAccount(
  account: StoredGoogleAccount | null,
): Promise<void> {
  await mergeStoredFields({ googleAccount: account });
}

/** עדכון אטומי של accessToken מחודש רק אם אותו refreshToken עדיין שמור במסד */
export async function updateRefreshedGoogleToken(params: {
  expectedRefreshToken: string;
  accessToken: string;
  expiresAt: number;
  newRefreshToken?: string;
}): Promise<void> {
  const current = await getStoredConfig();
  if (
    !current.googleAccount ||
    current.googleAccount.refreshToken !== params.expectedRefreshToken
  ) {
    return;
  }
  await mergeStoredFields({
    googleAccount: {
      ...current.googleAccount,
      accessToken: params.accessToken,
      expiresAt: params.expiresAt,
      refreshToken: params.newRefreshToken || current.googleAccount.refreshToken,
    },
  });
}


export async function getTranscriptionSettings(): Promise<TranscriptionSettings> {
  const stored = await getStoredConfig();
  return {
    enabled: stored.transcriptionEnabled,
    allowedStudentIds: stored.transcriptionAllowedStudentIds,
    audioModelOneEmail: stored.transcriptionAudioModelOneEmail,
    audioModelTwoEmail: stored.transcriptionAudioModelTwoEmail,
    handwritingModelOneEmail: stored.transcriptionHandwritingModelOneEmail,
    handwritingModelTwoEmail: stored.transcriptionHandwritingModelTwoEmail,
    audioModelOneReplyEmail: stored.transcriptionAudioModelOneReplyEmail,
    audioModelTwoReplyEmail: stored.transcriptionAudioModelTwoReplyEmail,
    handwritingModelOneReplyEmail: stored.transcriptionHandwritingModelOneReplyEmail,
    handwritingModelTwoReplyEmail: stored.transcriptionHandwritingModelTwoReplyEmail,
    appsScriptUrl: stored.transcriptionAppsScriptUrl,
    appsScriptTokenConfigured: Boolean(stored.transcriptionAppsScriptToken),
  };
}

function validEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const email = value.trim().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export async function saveTranscriptionSettings(
  input: TranscriptionSettingsInput,
): Promise<TranscriptionSettings> {
  const current = await getStoredConfig();
  const allowedStudentIds = Array.isArray(input.allowedStudentIds)
    ? [...new Set(input.allowedStudentIds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.replace(/\D/g, "").slice(0, 12))
        .filter((value) => value.length === 9))]
    : [];

  const appsScriptUrl = normalizeAppsScriptWebAppUrl(input.appsScriptUrl);
  if (input.appsScriptUrl?.trim() && !appsScriptUrl) {
    throw new Error("כתובת Web App חייבת להיות כתובת HTTPS תקינה של Google Apps Script שמסתיימת ב-/exec.");
  }
  const incomingToken = typeof input.appsScriptToken === "string" ? input.appsScriptToken.trim() : "";
  const appsScriptToken = input.clearAppsScriptToken
    ? ""
    : incomingToken || current.transcriptionAppsScriptToken;
  if (appsScriptToken && appsScriptToken.length < 32) {
    throw new Error("מפתח החיבור צריך להכיל לפחות 32 תווים.");
  }
  if (appsScriptUrl && !appsScriptToken) {
    throw new Error("יש להגדיר גם מפתח חיבור משותף ל-Google Apps Script.");
  }

  await mergeStoredFields({
    transcriptionEnabled: input.enabled === true,
    transcriptionAllowedStudentIds: allowedStudentIds,
    transcriptionAudioModelOneEmail: validEmail(input.audioModelOneEmail),
    transcriptionAudioModelTwoEmail: validEmail(input.audioModelTwoEmail),
    transcriptionHandwritingModelOneEmail: validEmail(input.handwritingModelOneEmail),
    transcriptionHandwritingModelTwoEmail: validEmail(input.handwritingModelTwoEmail),
    transcriptionAudioModelOneReplyEmail: validEmail(input.audioModelOneReplyEmail),
    transcriptionAudioModelTwoReplyEmail: validEmail(input.audioModelTwoReplyEmail),
    transcriptionHandwritingModelOneReplyEmail: validEmail(input.handwritingModelOneReplyEmail),
    transcriptionHandwritingModelTwoReplyEmail: validEmail(input.handwritingModelTwoReplyEmail),
    transcriptionAppsScriptUrl: appsScriptUrl,
    transcriptionAppsScriptToken: appsScriptToken,
  });

  return getTranscriptionSettings();
}
