import type { EffectKey, EffectsConfig, KioskConfig, StoredConfig } from "./types";

export const DEFAULT_ROOT_FOLDER_ID = "1CXFm0VyVtSZIqONXJYMmIu0hJyxUqj2B";
export const DEFAULT_SPREADSHEET_ID = "1USjVzJgyDmHfaAnN6MYJ9qrqlh3qhWclgdJ1LDF7UTk";
// The codes workbook URL previously supplied by the user; kept separate from registration.
export const DEFAULT_PERSONAL_CODE_SPREADSHEET_ID = "1USjVzJgyDmHfaAnN6MYJ9qrqlh3qhWclgdJ1LDF7UTk";
export const DEFAULT_ADMIN_PIN = "545454545";

/** מחלץ מזהה גיליון/תיקייה מתוך קישור מלא של Google, או מחזיר את הקלט כפי שהוא */
export function extractGoogleId(raw: string): string {
  const m = raw.match(/\/(?:d|folders)\/([A-Za-z0-9_-]{10,})/);
  return (m ? m[1] : raw).trim();
}

export const FULL_EFFECTS: EffectsConfig = {
  master: true,
  aurora: true,
  particles: true,
  spotlight: true,
  glass: true,
  pageTransitions: true,
  stagger: true,
  tilt: true,
  shimmer: true,
  ripple: true,
  glowInput: true,
  logoAnimation: true,
  countdownRing: true,
  confetti: true,
  sounds: false,
  particlesDensity: 45,
  soundVolume: 40,
  glassIntensity: 88,
  glassTransparency: 78,
  glassShape: 72,
  glassPrecision: 78,
  glassGel: 68,
};

export const DEFAULT_CONFIG: KioskConfig = {
  rootFolderId: DEFAULT_ROOT_FOLDER_ID,
  rootFolderName: "תיקיית תורה דיליה הראשית",
  kioskTitle: "תורה דיליה",
  kioskSubtitle: "עמדת קליטה והדפסת מסמכים",
  backgroundColor: "#0a1530",
  autoLogoutSeconds: 60,
  targetDriveLetter: "D",
  targetFolderName: "תורה דיליה",
  fallbackDriveCount: 5,
  autoDetectRemovableDrive: true,
  limitToDEOnly: false,
  kioskLockFullscreen: false,
  registrationEnabled: false,
  spreadsheetId: DEFAULT_SPREADSHEET_ID,
  personalCodeSpreadsheetId: DEFAULT_PERSONAL_CODE_SPREADSHEET_ID,
  effects: FULL_EFFECTS,
};

export const DEFAULT_STORED_CONFIG: StoredConfig = {
  ...DEFAULT_CONFIG,
  adminPin: DEFAULT_ADMIN_PIN,
  sheetsWebhookUrl: "",
};

export interface EffectMeta {
  key: EffectKey;
  label: string;
  description: string;
  group: "ambient" | "motion" | "controls" | "feedback";
}

export const EFFECT_GROUPS: Array<{
  id: EffectMeta["group"];
  title: string;
  hint: string;
}> = [
  { id: "ambient", title: "רקע ואווירה", hint: "מה שרואים מאחורי התוכן" },
  { id: "motion", title: "תנועה ומעברים", hint: "אנימציות של מסכים וכרטיסים" },
  { id: "controls", title: "כפתורים ומקלדת", hint: "תחושת מגע ומשוב ויזואלי" },
  { id: "feedback", title: "משוב והצלחה", hint: "חגיגה, צלילים ומחוונים" },
];

export const EFFECT_META: EffectMeta[] = [
  {
    key: "aurora",
    label: "זוהר רקע מונפש",
    description: "כתמי אור זהובים וכחולים שנעים לאט ברקע",
    group: "ambient",
  },
  {
    key: "particles",
    label: "אבק זהב צף",
    description: "חלקיקים זוהרים שמרחפים על המסך",
    group: "ambient",
  },
  {
    key: "spotlight",
    label: "זרקור עוקב מגע",
    description: "הילת אור שעוקבת אחרי האצבע או העכבר",
    group: "ambient",
  },
  {
    key: "glass",
    label: "זכוכית נוזלית (Liquid Glass)",
    description: "חומר זכוכיתי בסגנון iOS: רקע שנראה דרך המשטח, טשטוש ורוויית צבע עדינים ושפה רגועה — ללא פסי אור נעים.",
    group: "ambient",
  },
  {
    key: "pageTransitions",
    label: "מעברי מסכים חלקים",
    description: "דהייה והחלקה בין מסך הקלדה למסך הקבצים",
    group: "motion",
  },
  {
    key: "stagger",
    label: "כניסה מדורגת של כרטיסים",
    description: "כל מסמך נכנס בהשהיה קלה אחרי הקודם",
    group: "motion",
  },
  {
    key: "tilt",
    label: "הטיית תלת-מימד",
    description: "כרטיסי המסמכים מוטים בהתאם למיקום העכבר, עם ברק משתקף",
    group: "motion",
  },
  {
    key: "shimmer",
    label: "ברק רץ על כפתורים",
    description: "פס אור שעובר מעל כפתורים ראשיים",
    group: "controls",
  },
  {
    key: "ripple",
    label: "אדווה במגע",
    description: "גלים שמתפשטים מנקודת הלחיצה",
    group: "controls",
  },
  {
    key: "glowInput",
    label: "זוהר בשדה ת.ז.",
    description: "הדגשה זוהרת של הספרה הפעילה וקפיצה בהקלדה",
    group: "controls",
  },
  {
    key: "logoAnimation",
    label: "אנימציית לוגו",
    description: "הילה מסתובבת וריחוף עדין של הלוגו",
    group: "feedback",
  },
  {
    key: "countdownRing",
    label: "טבעת ספירה לאחור",
    description: "טבעת התקדמות לזמן האיפוס האוטומטי",
    group: "feedback",
  },
  {
    key: "confetti",
    label: "קונפטי בהצלחה",
    description: "פיצוץ קונפטי זהוב אחרי הדפסה או העתקה מוצלחת",
    group: "feedback",
  },
  {
    key: "sounds",
    label: "צלילי מערכת",
    description: "צליל עדין בהקשה, בהצלחה ובשגיאה",
    group: "feedback",
  },
];

export type EffectPresetId = "full" | "balanced" | "light" | "off";

export const EFFECT_PRESETS: Array<{
  id: EffectPresetId;
  label: string;
  description: string;
  effects: EffectsConfig;
}> = [
  {
    id: "full",
    label: "מלא",
    description: "כל האפקטים כולל צלילים",
    effects: { ...FULL_EFFECTS, sounds: true, particlesDensity: 70 },
  },
  {
    id: "balanced",
    label: "מאוזן",
    description: "ברירת המחדל, בלי צלילים",
    effects: { ...FULL_EFFECTS },
  },
  {
    id: "light",
    label: "חסכוני",
    description: "רק מה שקל למחשב: מעברים, ברק ואדווה",
    effects: {
      ...FULL_EFFECTS,
      aurora: false,
      particles: false,
      spotlight: false,
      glass: false,
      tilt: false,
      logoAnimation: false,
      confetti: false,
      sounds: false,
    },
  },
  {
    id: "off",
    label: "כבוי",
    description: "עיצוב נקי וסטטי, ללא שום אפקט",
    effects: { ...FULL_EFFECTS, master: false, sounds: false },
  },
];

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function str(v: unknown, fallback: string, max = 120): string {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
}

export function normalizeEffects(raw: unknown): EffectsConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<EffectsConfig>;
  const d = FULL_EFFECTS;
  return {
    master: bool(r.master, d.master),
    aurora: bool(r.aurora, d.aurora),
    particles: bool(r.particles, d.particles),
    spotlight: bool(r.spotlight, d.spotlight),
    glass: bool(r.glass, d.glass),
    pageTransitions: bool(r.pageTransitions, d.pageTransitions),
    stagger: bool(r.stagger, d.stagger),
    tilt: bool(r.tilt, d.tilt),
    shimmer: bool(r.shimmer, d.shimmer),
    ripple: bool(r.ripple, d.ripple),
    glowInput: bool(r.glowInput, d.glowInput),
    logoAnimation: bool(r.logoAnimation, d.logoAnimation),
    countdownRing: bool(r.countdownRing, d.countdownRing),
    confetti: bool(r.confetti, d.confetti),
    sounds: bool(r.sounds, d.sounds),
    particlesDensity: num(r.particlesDensity, d.particlesDensity, 10, 120),
    soundVolume: num(r.soundVolume, d.soundVolume, 0, 100),
    glassIntensity: num(r.glassIntensity, d.glassIntensity, 0, 100),
    glassTransparency: num(r.glassTransparency, d.glassTransparency, 0, 100),
    glassShape: num(r.glassShape, d.glassShape, 0, 100),
    glassPrecision: num(r.glassPrecision, d.glassPrecision, 0, 100),
    glassGel: num(r.glassGel, d.glassGel, 0, 100),
  };
}

/** מנקה ומשלים הגדרות לא תקינות / חסרות לפי ברירות המחדל */
export function normalizeConfig(raw: unknown): KioskConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<KioskConfig>;
  const d = DEFAULT_CONFIG;
  const letter =
    (typeof r.targetDriveLetter === "string"
      ? r.targetDriveLetter.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1)
      : "") || d.targetDriveLetter;

  return {
    rootFolderId: str(r.rootFolderId, d.rootFolderId, 200),
    rootFolderName: str(r.rootFolderName, d.rootFolderName),
    kioskTitle: str(r.kioskTitle, d.kioskTitle, 40),
    kioskSubtitle: str(r.kioskSubtitle, d.kioskSubtitle, 80),
    backgroundColor:
      typeof r.backgroundColor === "string" && /^#[0-9a-fA-F]{6}$/.test(r.backgroundColor)
        ? r.backgroundColor.toLowerCase()
        : d.backgroundColor,
    autoLogoutSeconds: num(r.autoLogoutSeconds, d.autoLogoutSeconds, 10, 600),
    targetDriveLetter: letter,
    targetFolderName: str(r.targetFolderName, d.targetFolderName, 80).replace(
      /[\\/:*?"<>|]/g,
      "",
    ),
    fallbackDriveCount: num(r.fallbackDriveCount, d.fallbackDriveCount, 0, 20),
    autoDetectRemovableDrive: bool(
      r.autoDetectRemovableDrive,
      d.autoDetectRemovableDrive,
    ),
    limitToDEOnly: bool(r.limitToDEOnly, d.limitToDEOnly),
    kioskLockFullscreen: bool(r.kioskLockFullscreen, d.kioskLockFullscreen),
    registrationEnabled: bool(r.registrationEnabled, d.registrationEnabled),
    spreadsheetId: extractGoogleId(str(r.spreadsheetId, d.spreadsheetId, 200)).replace(
      /[^A-Za-z0-9_-]/g,
      "",
    ) || d.spreadsheetId,
    personalCodeSpreadsheetId: extractGoogleId(
      str(r.personalCodeSpreadsheetId, DEFAULT_PERSONAL_CODE_SPREADSHEET_ID, 200),
    ).replace(/[^A-Za-z0-9_-]/g, "") || DEFAULT_PERSONAL_CODE_SPREADSHEET_ID,
    effects: normalizeEffects(r.effects),
  };
}

/** כתובת Web App של Apps Script: חייבת להיות https, אחרת מתעלמים ממנה */
export function normalizeWebhookUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const v = raw.trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
    if (u.protocol === "https:" || (u.protocol === "http:" && loopback)) {
      return u.toString();
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * רצף אותיות הכוננים לסריקה, החל מהאות הראשית ועד N אותיות קדימה.
 */
export function getDriveSequence(
  primaryLetter = "D",
  fallbackCount = 5,
  limitToDEOnly = false,
): string[] {
  const clean = (primaryLetter || "D").toUpperCase().replace(/[^A-Z]/g, "") || "D";
  if (limitToDEOnly) {
    return clean === "E" ? ["E", "D"] : ["D", "E"];
  }
  const startCode = clean.charCodeAt(0);
  const validStart = startCode >= 65 && startCode <= 90 ? startCode : 68;
  const count = Math.max(0, Math.min(20, fallbackCount));
  const seq: string[] = [];
  for (let i = 0; i <= count; i++) {
    const code = validStart + i;
    if (code <= 90) seq.push(String.fromCharCode(code));
  }
  return seq.length ? seq : [clean];
}
