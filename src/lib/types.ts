export type EffectKey =
  | "aurora"
  | "particles"
  | "spotlight"
  | "glass"
  | "pageTransitions"
  | "stagger"
  | "tilt"
  | "shimmer"
  | "ripple"
  | "glowInput"
  | "logoAnimation"
  | "countdownRing"
  | "confetti"
  | "sounds";

export interface EffectsConfig {
  /** מתג ראשי: כיבוי כל האפקטים בלחיצה אחת */
  master: boolean;
  aurora: boolean;
  particles: boolean;
  spotlight: boolean;
  glass: boolean;
  pageTransitions: boolean;
  stagger: boolean;
  tilt: boolean;
  shimmer: boolean;
  ripple: boolean;
  glowInput: boolean;
  logoAnimation: boolean;
  countdownRing: boolean;
  confetti: boolean;
  sounds: boolean;
  /** כמות חלקיקי אבק הזהב (10–120) */
  particlesDensity: number;
  /** עוצמת צלילים באחוזים (0–100) */
  soundVolume: number;
  /** עוצמת השתקפויות הזכוכית (0–100) */
  glassIntensity: number;
  /** מהירות תנועת ההשתקפות (1–10) */
  glassSpeed: number;
}

export interface KioskConfig {
  rootFolderId: string;
  rootFolderName: string;
  kioskTitle: string;
  kioskSubtitle: string;
  autoLogoutSeconds: number;
  targetDriveLetter: string;
  targetFolderName: string;
  fallbackDriveCount: number;
  autoDetectRemovableDrive: boolean;
  limitToDEOnly: boolean;
  kioskLockFullscreen: boolean;
  /** רישום תלמידים חדשים לגיליון Google Sheets מתוך העמדה */
  registrationEnabled: boolean;
  /** מזהה גיליון Google Sheets לרישום תלמידים */
  spreadsheetId: string;
  effects: EffectsConfig;
}

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  clientType: "web" | "installed";
  redirectUriOverride?: string;
}

export interface StoredGoogleAccount {
  email: string;
  name?: string;
  picture?: string;
  refreshToken: string;
  accessToken: string;
  /** זמן תפוגת ה-accessToken במילישניות (Date.now) */
  expiresAt: number;
  scope?: string;
  connectedAt: string;
}

/** הגדרות כפי שהן שמורות במסד (כולל קוד מנהל וסודות שלא נחשפים ללקוח) */
export interface StoredConfig extends KioskConfig {
  adminPin: string;
  /** כתובת Web App של Google Apps Script לכתיבה לגיליון (חלופה לחשבון שירות) */
  sheetsWebhookUrl: string;
  /** מפתחות OAuth של Google Cloud (Client ID + Secret) לחיבור חשבון קבוע */
  googleOAuthClient?: GoogleOAuthClientConfig | null;
  /** חשבון Google מחובר באופן קבוע (עם refresh_token שמתחדש אוטומטית) */
  googleAccount?: StoredGoogleAccount | null;
  /** מפתח JSON של חשבון שירות ל-Google Sheets/Drive שנשמר מקומית בלבד */
  googleServiceAccountJson?: string | null;
}

export interface GoogleAuthStatus {
  connected: boolean;
  account: {
    email: string;
    name?: string;
    picture?: string;
    connectedAt: string;
    hasRefreshToken: boolean;
    scopes: {
      drive: boolean;
      sheets: boolean;
    };
  } | null;
  oauthClient: {
    configured: boolean;
    source: "env" | "db" | null;
    clientId: string;
    hasClientSecret: boolean;
    maskedSecret: string | null;
    clientType: "web" | "installed";
    redirectUriOverride: string;
  };
  serviceAccountEmail: string | null;
}

export type SheetsMethod = "oauth" | "service-account" | "webhook";
export type RegistrationMethod = SheetsMethod | "local-file";

export interface RegistrationStatus {
  enabled: boolean;
  configured: boolean;
  method: RegistrationMethod | null;
  spreadsheetId: string;
  /** למנהל בלבד */
  googleAccountEmail?: string | null;
  serviceAccountEmail?: string | null;
  webhookUrl?: string;
  /** הנתיב המלא לקובץ הרישום המקומי */
  localFilePath?: string;
}

export interface RegistrationPayload {
  firstName: string;
  lastName: string;
  idNumber: string;
  vaad: number;
}

export interface KioskFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  isWordDoc: boolean;
}

export interface KioskFolder {
  id: string;
  name: string;
}

export interface SearchResponse {
  found: boolean;
  folder?: KioskFolder;
  files?: KioskFile[];
  source?: "drive" | "local";
  error?: string;
  message?: string;
}

export interface RemovableDrive {
  letter: string;
  name: string;
  isRemovable: boolean;
}

export interface StatsResponse {
  totals: {
    prints: number;
    copies: number;
    searches: number;
    misses: number;
    registrations: number;
  };
  since: string | null;
  daily: Array<{ date: string; prints: number; copies: number }>;
  recent: Array<{
    id: number;
    type: string;
    studentRef: string | null;
    fileName: string | null;
    detail: string | null;
    success: boolean;
    createdAt: string;
  }>;
}
