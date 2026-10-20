"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  HelpCircle,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  Upload,
  UserCheck,
} from "lucide-react";
import type { GoogleAuthStatus } from "@/lib/types";
import {
  completeGoogleLoginManualApi,
  disconnectGoogleAccountApi,
  fetchGoogleAuthStatus,
  saveGoogleClientApi,
  saveGoogleFirebaseTokenApi,
  startGoogleLoginApi,
} from "@/lib/client/api";
import { signInWithGoogleForDrive } from "@/lib/client/google-firebase-auth";
import { playSound } from "@/lib/client/sound";
import { FxButton } from "../FxButton";
import { Field, SectionCard, inputClass } from "./ui";

function GoogleLogoSvg() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleAccountCard({
  pin,
  onStatusChange,
}: {
  pin: string;
  onStatusChange?: (status: GoogleAuthStatus | null) => void;
}) {
  const [status, setStatus] = useState<GoogleAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [clientType, setClientType] = useState<"web" | "installed">("web");

  const [showCreds, setShowCreds] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [manualInput, setManualInput] = useState("");

  const [busy, setBusy] = useState(false);
  const [waitingPopup, setWaitingPopup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const callbackUri = `${origin}/api/google/callback`;

  const applyStatus = useCallback(
    (s: GoogleAuthStatus | null, initFields = false) => {
      setStatus(s);
      setAvatarBroken(false);
      onStatusChange?.(s);
      if (s && initFields) {
        setClientId(s.oauthClient.clientId);
        setClientType(s.oauthClient.clientType);
        setClientSecret("");
      }
    },
    [onStatusChange],
  );

  const reloadStatus = useCallback(
    async (initFields = false) => {
      const s = await fetchGoogleAuthStatus(pin);
      applyStatus(s, initFields);
      setLoading(false);
      return s;
    },
    [pin, applyStatus],
  );

  useEffect(() => {
    let cancelled = false;
    fetchGoogleAuthStatus(pin).then((s) => {
      if (cancelled) return;
      applyStatus(s, true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pin, applyStatus]);

  // האזנה לסיום ההתחברות מהחלון הקופץ (BroadcastChannel + storage + postMessage + focus)
  useEffect(() => {
    const handleEventPayload = (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const d = raw as { type?: string; ok?: boolean; error?: string };
      if (d.type !== "kiosk:google-oauth") return;
      setWaitingPopup(false);
      if (d.ok) {
        playSound("success");
        setError(null);
        setShowManualPaste(false);
        setManualInput("");
        void reloadStatus(false);
      } else if (d.error) {
        playSound("error");
        setError(d.error);
      }
    };

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("kiosk-google-oauth");
      bc.onmessage = (ev) => handleEventPayload(ev.data);
    } catch {
      /* ignore */
    }

    const onMessage = (ev: MessageEvent) => handleEventPayload(ev.data);
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "kiosk_google_oauth_event" && ev.newValue) {
        try {
          handleEventPayload(JSON.parse(ev.newValue));
        } catch {
          /* ignore */
        }
      }
    };
    const onFocus = () => {
      if (waitingPopup) {
        void reloadStatus(false).then((s) => {
          if (s?.connected) setWaitingPopup(false);
        });
      }
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      bc?.close();
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [reloadStatus, waitingPopup]);

  const handleUploadJson = async (file: File) => {
    setError(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      const text = await file.text();
      const res = await saveGoogleClientApi(pin, { clientSecretJson: text });
      if (!res.ok || !res.status) {
        playSound("error");
        setError(res.error ?? "קובץ ה-JSON אינו תקין");
        return;
      }
      playSound("success");
      applyStatus(res.status, true);
      setShowCreds(false);
      setInfoMsg("קובץ המפתחות נטען ונשמר בהצלחה! כעת לחץ על 'התחבר עם חשבון Google'.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveCredsOnly = async () => {
    setError(null);
    setInfoMsg(null);
    setBusy(true);
    const res = await saveGoogleClientApi(pin, {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      clientType,
    });
    setBusy(false);
    if (!res.ok || !res.status) {
      playSound("error");
      setError(res.error ?? "השמירה נכשלה");
      return;
    }
    playSound("success");
    applyStatus(res.status, true);
    setShowCreds(false);
    setInfoMsg("מפתחות ה-OAuth נשמרו במסד הנתונים.");
  };

  const handleConnectClick = async () => {
    setError(null);
    setInfoMsg(null);
    setBusy(true);

    // כניסה בחלון Google בלי להזין Client ID או Client Secret ידנית.
    // OAuth קבוע נשאר זמין אם הוגדר מראש ע"י מנהל המערכת.
    if (!status?.oauthClient.configured) {
      try {
        const { accessToken } = await signInWithGoogleForDrive();
        const result = await saveGoogleFirebaseTokenApi(pin, accessToken);
        setBusy(false);
        if (!result.ok || !result.status) {
          playSound("error");
          setError(result.error ?? "לא ניתן לשמור את חיבור Google");
          return;
        }
        applyStatus(result.status, false);
        setShowCreds(false);
        setInfoMsg("החיבור ל-Google הצליח. ההרשאה זמנית; לאחר שתפוג אפשר להתחבר שוב באותה לחיצה.");
        playSound("success");
        return;
      } catch (err) {
        setBusy(false);
        playSound("error");
        const firebaseCode =
          typeof err === "object" && err !== null && "code" in err
            ? String(err.code)
            : "";
        if (firebaseCode === "auth/unauthorized-domain") {
          setError(
            "Firebase אינו מאשר כרגע את הדומיין המקומי של האפליקציה. יש לבצע הגדרה חד-פעמית: " +
              "פתח את Firebase Console של הפרויקט gen-cackup, עבור אל Authentication > Settings > Authorized domains, " +
              "לחץ Add domain והוסף localhost בלבד (בלי http ובלי מספר פורט). שמור ואז נסה להתחבר שוב. " +
              "קישור להגדרות: https://console.firebase.google.com/project/gen-cackup/authentication/settings",
          );
        } else {
          setError(err instanceof Error ? err.message : "התחברות Google נכשלה או שהחלון נסגר");
        }
        return;
      }
    }

    const res = await startGoogleLoginApi(
      pin,
      origin,
      status.oauthClient.source === "env"
        ? undefined
        : {
            clientId: clientId.trim() || status.oauthClient.clientId,
            clientSecret: clientSecret.trim() || undefined,
            clientType,
          },
    );
    setBusy(false);

    if (!res.ok || !res.authUrl) {
      playSound("error");
      setError(res.error ?? "לא ניתן להתחיל התחברות ל-Google");
      setShowCreds(true);
      return;
    }

    const w = 520;
    const h = 660;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
    const popup = window.open(
      res.authUrl,
      "kioskGoogleOAuth",
      `width=${w},height=${h},left=${left},top=${top},popup=yes`,
    );

    if (!popup) {
      window.location.href = res.authUrl;
      return;
    }

    setWaitingPopup(true);
    if (res.needsManualCallbackPaste) setShowManualPaste(true);
    void reloadStatus(false);
  };

  const handleCompleteManual = async () => {
    if (!manualInput.trim()) return;
    setError(null);
    setBusy(true);
    const res = await completeGoogleLoginManualApi(pin, manualInput.trim(), origin);
    setBusy(false);
    if (!res.ok || !res.status) {
      playSound("error");
      setError(res.error ?? "השלמת החיבור נכשלה");
      return;
    }
    playSound("success");
    applyStatus(res.status, false);
    setManualInput("");
    setShowManualPaste(false);
    setWaitingPopup(false);
  };

  const handleDisconnect = async () => {
    setError(null);
    setInfoMsg(null);
    setBusy(true);
    const res = await disconnectGoogleAccountApi(pin);
    setBusy(false);
    if (res.ok && res.status) {
      playSound("click");
      applyStatus(res.status, false);
    } else {
      setError(res.error ?? "הניתוק נכשל");
    }
  };

  const copyCallbackUri = async () => {
    try {
      await navigator.clipboard.writeText(callbackUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const canConnect = true;

  const acc = status?.account ?? null;
  const missingScope = acc && (!acc.scopes.drive || !acc.scopes.sheets);

  return (
    <SectionCard
      title={
        <span>
          חשבון <bdi>Google</bdi> (<bdi>Drive</bdi> פרטי + <bdi>Google Sheets</bdi>)
        </span>
      }
      icon={<UserCheck className="h-4 w-4 text-emerald-400" />}
      hint={
        <span>
          אפשר להתחבר בחלון Google בלי להזין מפתחות. ההרשאה הזו זמנית ויש להתחבר שוב לאחר תפוגתה; OAuth קבוע שהוגדר מראש ממשיך להתחדש אוטומטית.
        </span>
      }
      action={
        <span
          className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-bold ${
            acc
              ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/40"
              : "bg-amber-400/15 text-amber-200"
          }`}
        >
          {loading ? "בודק..." : acc ? (acc.hasRefreshToken ? "מחובר קבוע" : "חיבור זמני") : "לא מחובר"}
        </span>
      }
    >
      <div className="space-y-3.5">
        {/* כרטיס חשבון מחובר */}
        {acc && (
          <div className="rounded-2xl border border-emerald-400/35 bg-gradient-to-l from-emerald-400/[0.11] via-emerald-400/[0.05] to-transparent p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {acc.picture && !avatarBroken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={acc.picture}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarBroken(true)}
                    className="h-11 w-11 shrink-0 rounded-full ring-2 ring-emerald-400/50"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 font-mono text-base font-black text-emerald-200 ring-2 ring-emerald-400/40">
                    {acc.email.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-white">
                      {acc.name || "חשבון Google מורשה"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                      <CheckCircle2 className="h-3 w-3" />
                      {acc.hasRefreshToken ? "נשמר קבוע בהגדרות" : "התחברות זמנית — נדרשת כניסה מחדש לאחר התפוגה"}
                    </span>
                  </div>
                  <div className="truncate font-mono text-xs text-emerald-200" dir="ltr">
                    {acc.email}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <FxButton
                  variant="ghost"
                  onClick={handleConnectClick}
                  disabled={busy}
                  className="h-9 px-3 text-xs"
                  title="התחברות מחדש או החלפת חשבון Google"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  החלף חשבון
                </FxButton>
                <FxButton
                  variant="danger"
                  onClick={handleDisconnect}
                  disabled={busy}
                  className="h-9 px-3 text-xs"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  נתק
                </FxButton>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-2.5 text-[11px]">
              <span
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold ${
                  acc.scopes.drive
                    ? "bg-white/[0.06] text-emerald-200"
                    : "bg-amber-400/15 text-amber-200"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  <bdi>Google Drive</bdi> —{" "}
                  {acc.scopes.drive ? "פעיל (כולל תיקיות פרטיות)" : "חסרה הרשאה"}
                </span>
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold ${
                  acc.scopes.sheets
                    ? "bg-white/[0.06] text-emerald-200"
                    : "bg-amber-400/15 text-amber-200"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  <bdi>Google Sheets</bdi> —{" "}
                  {acc.scopes.sheets ? "פעיל (קריאה וכתיבה)" : "חסרה הרשאה"}
                </span>
              </span>
            </div>

            {missingScope && (
              <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 p-2.5 text-xs text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                לא סומנו כל תיבות ההרשאה במסך ההתחברות של Google. לחץ על &quot;החלף חשבון&quot; וסמן את כולן.
              </div>
            )}
          </div>
        )}

        {/* כפתור ההתחברות הראשי כשטרם מחובר */}
        {!acc && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleConnectClick}
              disabled={busy || !canConnect}
              className="flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-white/25 bg-white px-5 text-sm font-black text-slate-900 shadow-lg transition hover:bg-slate-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="keep-anim h-5 w-5 animate-spin text-slate-700" />
              ) : (
                <GoogleLogoSvg />
              )}
              <span>
                {waitingPopup
                  ? "ממתין לאישור בחלון Google..."
                  : "התחבר עם חשבון Google"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowCreds((v) => !v)}
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-3.5 text-xs font-bold text-slate-200 transition hover:bg-white/10"
            >
              <KeyRound className="h-3.5 w-3.5 text-gold-400" />
              {status?.oauthClient.configured ? "ערוך מפתחות OAuth" : "הגדרת מפתחות OAuth"}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showCreds ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        )}

        {acc && (
          <div className="flex items-center gap-4 text-xs">
            <button
              type="button"
              onClick={() => setShowCreds((v) => !v)}
              className="flex cursor-pointer items-center gap-1 text-slate-400 hover:text-white"
            >
              <KeyRound className="h-3.5 w-3.5 text-gold-400" />
              {showCreds ? "הסתר הגדרות מפתחות OAuth" : "הגדרות מפתחות OAuth מתקדמות"}
            </button>
          </div>
        )}

        {/* הגדרת מפתחות OAuth (העלאת client_secret.json או הזנה ידנית) */}
        {showCreds && (
          <div className="space-y-3.5 rounded-2xl border border-white/10 bg-navy-950/55 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-white">
                  מפתחות <bdi>OAuth 2.0</bdi> מ-<bdi>Google Cloud Console</bdi>
                </div>
                <p className="text-[11px] text-slate-400">
                  מוגדרים פעם אחת בלבד ונשמרים במסד הנתונים של העמדה.
                </p>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadJson(f);
                  }}
                />
                <FxButton
                  variant="gold"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="h-9 px-3.5 text-xs"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>
                    העלה קובץ <bdi>client_secret.json</bdi>
                  </span>
                </FxButton>
              </div>
            </div>

            {status?.oauthClient.source === "env" && (
              <div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.08] p-2.5 text-xs text-sky-100">
                מפתחות <bdi>OAuth</bdi> נטענים ממשתני הסביבה של השרת (<bdi>GOOGLE_CLIENT_ID</bdi>).
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Client ID">
                <input
                  type="text"
                  dir="ltr"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="...apps.googleusercontent.com"
                  className={`${inputClass} font-mono text-left text-xs`}
                />
              </Field>
              <Field
                label={
                  status?.oauthClient.hasClientSecret
                    ? `Client Secret — שמור (${status.oauthClient.maskedSecret})`
                    : "Client Secret"
                }
              >
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={
                    status?.oauthClient.hasClientSecret
                      ? "השאר ריק כדי לשמור את הסוד הקיים"
                      : "GOCSPX-..."
                  }
                  className={`${inputClass} font-mono text-left text-xs`}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-300">סוג לקוח:</span>
                {(
                  [
                    { id: "web", label: "Web Application (דפדפן)" },
                    { id: "installed", label: "Desktop App (ללא הגדרת כתובת)" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setClientType(opt.id)}
                    className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                      clientType === opt.id
                        ? "border-gold-400/60 bg-gold-400/15 text-gold-200"
                        : "border-white/10 bg-white/[0.04] text-slate-400 hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <FxButton
                variant="navy"
                onClick={handleSaveCredsOnly}
                disabled={busy || !clientId.trim()}
                className="h-9 px-4 text-xs"
              >
                שמור מפתחות
              </FxButton>
            </div>

            {clientType === "web" && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-300">
                    כתובת <bdi>Redirect URI</bdi> להוספה ב-<bdi>Google Cloud Console</bdi>:
                  </span>
                  <button
                    type="button"
                    onClick={copyCallbackUri}
                    className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold text-gold-300 transition hover:bg-white/10"
                  >
                    {copiedUri ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedUri ? "הועתק!" : "העתק כתובת"}
                  </button>
                </div>
                <code className="block break-all font-mono text-[11px] text-emerald-200" dir="ltr">
                  {callbackUri}
                </code>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-sky-300 hover:underline"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {showGuide
                ? "הסתר הוראות הקמה"
                : "איך מוציאים קובץ client_secret.json ומונעים שגיאה 403 / פקיעת תוקף? (60 שניות)"}
            </button>

            {showGuide && (
              <ol className="list-decimal space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 pe-7 text-xs leading-relaxed text-slate-300">
                <li>
                  ב-Google Cloud Console הפעל את{" "}
                  <strong>Google Drive API</strong> ואת <strong>Google Sheets API</strong>.
                </li>
                <li>
                  במסך{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials/consent"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-sky-300 hover:underline"
                  >
                    OAuth Consent Screen <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  לחץ על <strong>Publish App (פרסם אפליקציה)</strong> — כך החיבור יישאר קבוע לתמיד (לא יפוג אחרי 7 ימים) ולא יחסום חשבונות עם שגיאה <code className="font-mono">403 access_denied</code>.
                </li>
                <li>
                  במסך{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-sky-300 hover:underline"
                  >
                    Credentials <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  צור <strong>OAuth client ID</strong> (מומלץ <strong>Web application</strong> והוסף את כתובת ה-Redirect URI שלמעלה, או <strong>Desktop app</strong> ללא צורך בכתובת), הורד את קובץ ה-JSON והעלה אותו כאן.
                </li>
              </ol>
            )}
          </div>
        )}

        {/* השלמה ידנית (בשימוש עם Desktop App משרת מרוחק או אם הדפדפן חסם חלונות) */}
        {(showManualPaste || waitingPopup) && (
          <div className="space-y-2.5 rounded-xl border border-gold-400/30 bg-gold-400/[0.06] p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-bold text-gold-200">
                <Link2 className="h-4 w-4 shrink-0" />
                {showManualPaste
                  ? "לאחר האישור ב-Google, העתק את כל הכתובת משורת הכתובת של החלון שנפתח והדבק כאן:"
                  : "אם החלון לא נסגר אוטומטית — ניתן להדביק כאן את כתובת האישור:"}
              </span>
              {!showManualPaste && (
                <button
                  type="button"
                  onClick={() => setShowManualPaste(true)}
                  className="shrink-0 cursor-pointer font-bold text-gold-300 underline"
                >
                  הדבק כתובת
                </button>
              )}
            </div>
            {showManualPaste && (
              <div className="flex gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="http://127.0.0.1/api/google/callback?state=...&code=4/0A..."
                  className={`${inputClass} flex-1 font-mono text-left text-xs`}
                />
                <FxButton
                  variant="gold"
                  onClick={handleCompleteManual}
                  disabled={busy || !manualInput.trim()}
                  className="h-11 shrink-0 px-4 text-xs"
                >
                  אשר והשלם חיבור
                </FxButton>
              </div>
            )}
          </div>
        )}

        {infoMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-400/[0.08] p-3 text-xs font-medium text-emerald-100">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
            <span>{infoMsg}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-xs leading-relaxed text-red-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
