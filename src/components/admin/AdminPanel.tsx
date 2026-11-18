"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3,
  Check,
  Cloud,
  Delete,
  FileSpreadsheet,
  HardDrive,
  Loader2,
  Lock,
  Mic,
  Settings2,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import type { GoogleAuthStatus, KioskConfig } from "@/lib/types";
import {
  adminLogin,
  fetchGoogleAuthStatus,
  fetchRegistrationStatus,
  saveSettings,
} from "@/lib/client/api";
import { RegistrationTab } from "./RegistrationTab";
import { useFx } from "@/lib/client/fx";
import { playSound } from "@/lib/client/sound";
import { FxButton } from "../FxButton";
import { DriveTab } from "./DriveTab";
import { EffectsTab } from "./EffectsTab";
import { GeneralTab } from "./GeneralTab";
import { GoogleTab } from "./GoogleTab";
import { SetupTab } from "./SetupTab";
import { StatsTab } from "./StatsTab";
import { TranscriptionTab } from "./TranscriptionTab";

type TabId = "effects" | "drive" | "google" | "registration" | "transcription" | "general" | "stats" | "setup";

const TABS: Array<{ id: TabId; label: string; icon: typeof Sparkles }> = [
  { id: "effects", label: "אפקטים ועיצוב", icon: Sparkles },
  { id: "drive", label: "כונן יעד ודיסק און קי", icon: HardDrive },
  { id: "google", label: "חשבון Google ודרייב", icon: Cloud },
  { id: "registration", label: "רישום תלמידים", icon: FileSpreadsheet },
  { id: "transcription", label: "תמלול קולי וכתבי יד", icon: Mic },
  { id: "general", label: "כללי ומיתוג", icon: Settings2 },
  { id: "stats", label: "סטטיסטיקה ויומן", icon: BarChart3 },
  { id: "setup", label: "עמדה ויציאה", icon: Terminal },
];

export function AdminPanel({
  open,
  config,
  onClose,
  onPreview,
  onSaved,
  onShutdown,
}: {
  open: boolean;
  config: KioskConfig;
  onClose: () => void;
  /** תצוגה חיה של טיוטת ההגדרות (אפקטים), או null לחזרה להגדרות השמורות */
  onPreview: (c: KioskConfig | null) => void;
  onSaved: (c: KioskConfig) => void;
  onShutdown: () => void;
}) {
  const { on } = useFx();
  const anim = on("pageTransitions");

  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pin, setPin] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>("effects");
  const [draft, setDraft] = useState<KioskConfig>(config);
  const [newPin, setNewPin] = useState("");
  // כתובת ה-Apps Script נשמרת בנפרד (לא נחשפת בהגדרות הציבוריות)
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savedWebhookUrl, setSavedWebhookUrl] = useState("");
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // איפוס בכל פתיחה
  useEffect(() => {
    if (!open) return;
    setPinInput("");
    setPinError(null);
    setPin(null);
    setTab("effects");
    setDraft(config);
    setNewPin("");
    setWebhookUrl("");
    setSavedWebhookUrl("");
    setGoogleEmail(null);
    setSaved(false);
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // אחרי אימות: טעינת כתובת ה-Apps Script השמורה
  useEffect(() => {
    if (!pin) return;
    let cancelled = false;
    fetchRegistrationStatus(pin).then((s) => {
      if (cancelled || !s) return;
      const url = s.webhookUrl ?? "";
      setWebhookUrl(url);
      setSavedWebhookUrl(url);
      if (s.googleAccountEmail) setGoogleEmail(s.googleAccountEmail);
    });
    fetchGoogleAuthStatus(pin).then((g) => {
      if (cancelled || !g) return;
      setGoogleEmail(g.account?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [pin]);

  // תצוגה חיה של הטיוטה
  useEffect(() => {
    if (open && pin) onPreview(draft);
  }, [draft, open, pin, onPreview]);

  const update = useCallback(
    (patch: Partial<KioskConfig>) => setDraft((d) => ({ ...d, ...patch })),
    [],
  );

  const dirty = useMemo(
    () =>
      JSON.stringify(draft) !== JSON.stringify(config) ||
      newPin.length > 0 ||
      webhookUrl.trim() !== savedWebhookUrl,
    [draft, config, newPin, webhookUrl, savedWebhookUrl],
  );
  const pinInvalid = newPin.length > 0 && !/^\d{4,12}$/.test(newPin);

  const close = useCallback(() => {
    onPreview(null);
    onClose();
  }, [onClose, onPreview]);

  const submitPin = useCallback(async () => {
    if (!pinInput || checking) return;
    setChecking(true);
    setPinError(null);
    const res = await adminLogin(pinInput);
    setChecking(false);
    if (res.ok) {
      playSound("found");
      setPin(pinInput);
    } else {
      playSound("error");
      setPinError(res.error ?? "קוד שגוי");
      setPinInput("");
    }
  }, [pinInput, checking]);

  const handleSave = async () => {
    if (!pin || pinInvalid) return;
    setSaving(true);
    setSaveError(null);
    const res = await saveSettings(pin, draft, {
      newPin: newPin || undefined,
      sheetsWebhookUrl: webhookUrl.trim(),
    });
    setSaving(false);
    if (res.ok && res.config) {
      playSound("success");
      if (newPin) setPin(newPin);
      setNewPin("");
      setSavedWebhookUrl(webhookUrl.trim());
      setSaved(true);
      onSaved(res.config);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 700);
    } else {
      playSound("error");
      setSaveError(res.error ?? "השמירה נכשלה");
    }
  };

  // Esc לסגירה
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, close]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="admin"
          className="fixed inset-0 z-[65] flex select-none items-center justify-center bg-navy-950/80 p-3 backdrop-blur-sm sm:p-5"
          initial={anim ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={anim ? { opacity: 0 } : { opacity: 0, transition: { duration: 0 } }}
        >
          <motion.div
            className="panel-solid relative flex max-h-[94vh] w-full flex-col overflow-hidden shadow-2xl"
            style={{ maxWidth: pin ? "64rem" : "26rem", height: pin ? "min(780px, 94vh)" : "auto" }}
            initial={anim ? { opacity: 0, y: 40, scale: 0.95 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={anim ? { opacity: 0, y: 24, scale: 0.97 } : { opacity: 0, transition: { duration: 0 } }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            {/* כותרת */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-navy-900">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-black text-white">ניהול העמדה</h3>
                  <p className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span>{pin ? "הגדרות, אפקטים וסטטיסטיקה" : "נדרש קוד מנהל"}</span>
                    {pin && googleEmail && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-200" dir="ltr">
                        ● {googleEmail}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <FxButton variant="ghost" onClick={close} className="h-10 w-10 !rounded-xl" aria-label="סגירה">
                <X className="h-5 w-5" />
              </FxButton>
            </div>

            {!pin ? (
              <PinGate
                value={pinInput}
                onChange={setPinInput}
                error={pinError}
                checking={checking}
                onSubmit={submitPin}
              />
            ) : (
              <>
                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                  {/* תפריט צד */}
                  <nav className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-white/10 p-2.5 md:w-56 md:flex-col md:overflow-visible md:border-b-0 md:border-l md:p-3">
                    {TABS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          playSound("click");
                          setTab(t.id);
                        }}
                        className={`flex shrink-0 cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm font-bold transition ${
                          tab === t.id
                            ? "bg-gradient-to-l from-gold-400/20 to-gold-400/5 text-gold-200 ring-1 ring-gold-400/40"
                            : "text-slate-300 hover:bg-white/[0.07]"
                        }`}
                      >
                        <t.icon className={`h-[18px] w-[18px] ${tab === t.id ? "text-gold-400" : "text-slate-400"}`} />
                        <span className="whitespace-nowrap">{t.label}</span>
                        {t.id === "google" && googleEmail && (
                          <span className="ms-auto h-2 w-2 rounded-full bg-emerald-400" title={`מחובר: ${googleEmail}`} />
                        )}
                      </button>
                    ))}
                  </nav>

                  {/* תוכן */}
                  <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                    {tab === "effects" && (
                      <EffectsTab effects={draft.effects} onChange={(effects) => update({ effects })} />
                    )}
                    {tab === "drive" && <DriveTab draft={draft} update={update} />}
                    {tab === "google" && (
                      <GoogleTab
                        draft={draft}
                        update={update}
                        pin={pin}
                        onGoogleStatusChange={(g: GoogleAuthStatus | null) =>
                          setGoogleEmail(g?.account?.email ?? null)
                        }
                      />
                    )}
                    {tab === "registration" && (
                      <RegistrationTab
                        draft={draft}
                        update={update}
                        pin={pin}
                        webhookUrl={webhookUrl}
                        setWebhookUrl={setWebhookUrl}
                        googleAccountEmail={googleEmail}
                        onOpenGoogleTab={() => setTab("google")}
                      />
                    )}
                    {tab === "transcription" && pin && <TranscriptionTab pin={pin} />}
                    {tab === "general" && (
                      <GeneralTab draft={draft} update={update} newPin={newPin} setNewPin={setNewPin} />
                    )}
                    {tab === "stats" && <StatsTab pin={pin} />}
                    {tab === "setup" && <SetupTab onShutdown={onShutdown} />}
                  </div>
                </div>

                {/* שורת שמירה */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-navy-950/50 px-5 py-3">
                  <div className="text-xs">
                    {saveError ? (
                      <span className="font-bold text-red-300">{saveError}</span>
                    ) : dirty ? (
                      <span className="flex items-center gap-1.5 font-medium text-amber-300">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                        יש שינויים שלא נשמרו
                      </span>
                    ) : (
                      <span className="text-slate-500">כל השינויים נשמרו</span>
                    )}
                  </div>
                  <div className="flex gap-2.5">
                    <FxButton variant="ghost" onClick={close} className="h-11 px-5 text-sm">
                      {dirty ? "ביטול" : "סגירה"}
                    </FxButton>
                    <FxButton
                      variant="gold"
                      onClick={handleSave}
                      disabled={!dirty || saving || pinInvalid}
                      className="h-11 min-w-[9rem] px-6 text-sm"
                    >
                      {saving ? (
                        <Loader2 className="keep-anim h-4 w-4 animate-spin" />
                      ) : saved ? (
                        <Check className="h-4 w-4" />
                      ) : null}
                      {saved ? "נשמר!" : "שמירת שינויים"}
                    </FxButton>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PinGate({
  value,
  onChange,
  error,
  checking,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  checking: boolean;
  onSubmit: () => void;
}) {
  const add = (d: string) => {
    if (value.length < 12) onChange(value + d);
  };

  return (
    <form
      className="flex flex-col items-center gap-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        autoFocus
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
        placeholder="• • • • • • • • •"
        aria-label="קוד מנהל"
        className={`h-14 w-full rounded-2xl border bg-navy-950/60 text-center font-mono text-2xl tracking-[0.5em] text-white placeholder-slate-600 outline-none transition focus:ring-2 ${
          error
            ? "shake border-red-400/70 focus:ring-red-400/30"
            : "border-white/15 focus:border-gold-400 focus:ring-gold-400/25"
        }`}
      />
      <div className="h-4 text-xs font-bold text-red-300" role="alert">
        {error}
      </div>

      <div className="grid w-full grid-cols-3 gap-2" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <FxButton key={d} variant="key" sound="key" onMouseDown={(e) => e.preventDefault()} onClick={() => add(d)} className="h-12 font-mono text-xl">
            {d}
          </FxButton>
        ))}
        <FxButton variant="ghost" sound="clear" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange("")} className="h-12 text-xs">
          איפוס
        </FxButton>
        <FxButton variant="key" sound="key" onMouseDown={(e) => e.preventDefault()} onClick={() => add("0")} className="h-12 font-mono text-xl">
          0
        </FxButton>
        <FxButton variant="ghost" sound="delete" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(value.slice(0, -1))} className="h-12">
          <Delete className="h-5 w-5" />
        </FxButton>
      </div>

      <FxButton type="submit" variant="gold" sound="none" disabled={!value || checking} className="h-12 w-full text-base">
        {checking ? <Loader2 className="keep-anim h-5 w-5 animate-spin" /> : null}
        כניסה
      </FxButton>
    </form>
  );
}
