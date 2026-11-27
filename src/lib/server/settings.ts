import {
  DEFAULT_ADMIN_PIN,
  DEFAULT_CONFIG,
  DEFAULT_TRANSCRIPTION_HANDWRITING_FOLDER_ID,
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
    const pathname = url.pathname.replace(/\/+$/, "");
    if (
      url.protocol !== "https:" ||
      url.hostname !== "script.google.com" ||
      !/^\/macros\/(?:u\/\d+\/)?s\/[^/]+\/exec$/i.test(pathname)
    ) return "";
    url.pathname = pathname;
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

/** Removes quotation marks accidentally pasted or corrupted by UTF-8/Windows-1252 decoding. */
function cleanConfiguredEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Extract the email address itself. This safely drops any encoding debris,
  // quotes, or other stray characters surrounding the address.
  const emailMatch = raw.trim().match(/[A-Z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/i);
  return emailMatch ? emailMatch[0].slice(0, 254) : "";
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
    transcriptionHandwritingRootFolderId: DEFAULT_TRANSCRIPTION_HANDWRITING_FOLDER_ID,
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
      transcriptionAudioModelOneEmail: cleanConfiguredEmail(
        typeof raw.transcriptionAudioModelOneEmail === "string"
          ? raw.transcriptionAudioModelOneEmail
          : raw.transcriptionModelOneEmail
      ),
      transcriptionAudioModelTwoEmail: cleanConfiguredEmail(
        typeof raw.transcriptionAudioModelTwoEmail === "string"
          ? raw.transcriptionAudioModelTwoEmail
          : raw.transcriptionModelTwoEmail
      ),
      transcriptionHandwritingModelOneEmail: cleanConfiguredEmail(raw.transcriptionHandwritingModelOneEmail),
      transcriptionHandwritingModelTwoEmail: cleanConfiguredEmail(raw.transcriptionHandwritingModelTwoEmail),
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
      transcriptionHandwritingRootFolderId: typeof raw.transcriptionHandwritingRootFolderId === "string"
        ? raw.transcriptionHandwritingRootFolderId.trim().replace(/^.*\\/folders\\//, "").slice(0, 200)
        : DEFAULT_TRANSCRIPTION_HANDWRITING_FOLDER_ID,
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
      transcriptionHandwritingRootFolderId: DEFAULT_TRANSCRIPTION_HANDWRITING_FOLDER_ID,
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
    transcriptionHandwritingRootFolderId: _transcriptionHandwritingRootFolderId,
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
  void _transcriptionHandwritingRootFolderId;
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
    handwritingRootFolderId: stored.transcriptionHandwritingRootFolderId,
  };
}

function validEmail(value: unknown): string {
  const email = cleanConfiguredEmail(value);
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

  const rawAppsScriptUrl = typeof input.appsScriptUrl === "string" ? input.appsScriptUrl.trim() : "";
  const normalizedAppsScriptUrl = normalizeAppsScriptWebAppUrl(rawAppsScriptUrl);
  const warnings: string[] = [];
  let appsScriptUrl = current.transcriptionAppsScriptUrl;
  if (!rawAppsScriptUrl) {
    appsScriptUrl = "";
  } else if (normalizedAppsScriptUrl) {
    appsScriptUrl = normalizedAppsScriptUrl;
  } else {
    warnings.push("כתובת Google Apps Script אינה בפורמט תקין ולכן לא עודכנה. שאר הגדרות התמלול נשמרו.");
  }

  const incomingToken = typeof input.appsScriptToken === "string" ? input.appsScriptToken.trim() : "";
  let appsScriptToken = current.transcriptionAppsScriptToken;
  if (input.clearAppsScriptToken) {
    appsScriptToken = "";
  } else if (incomingToken) {
    if (incomingToken.length < 32) {
      warnings.push("מפתח החיבור קצר מ-32 תווים ולכן לא עודכן. שאר הגדרות התמלול נשמרו.");
    } else {
      appsScriptToken = incomingToken;
    }
  }
  if (appsScriptUrl && !appsScriptToken) {
    warnings.push("כתובת הסקריפט נשמרה, אך נדרש גם מפתח חיבור משותף בן 32 תווים לפחות כדי לשלוח בקשות.");
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
    transcriptionHandwritingRootFolderId: typeof input.handwritingRootFolderId === "string"
      ? (input.handwritingRootFolderId.trim().match(/(?:\\/folders\\/)?([A-Za-z0-9_-]{10,})/)?.[1] || "")
      : current.transcriptionHandwritingRootFolderId,
  });

  const savedSettings = await getTranscriptionSettings();
  return warnings.length
    ? { ...savedSettings, saveWarning: warnings.join(" ") }
    : savedSettings;
}
