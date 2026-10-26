"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Fingerprint,
  Loader2,
  Search,
  UserRound,
  X,
} from "lucide-react";
import type { RegistrationStatus } from "@/lib/types";
import {
  checkRegistration,
  fetchRegistrationStatus,
  lookupPersonalCode,
  registerStudentApi,
  type PersonalCodeLookupResult,
} from "@/lib/client/api";
import { fireConfetti, useFx } from "@/lib/client/fx";
import { playSound } from "@/lib/client/sound";
import { FxButton } from "./FxButton";

type Step = "id" | "name" | "result";

const inputClass =
  "h-12 w-full rounded-xl border border-white/15 bg-navy-950/60 px-3.5 text-base text-white placeholder-slate-500 outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/25";

interface DialogProps {
  initialId: string;
  registrationEnabled: boolean;
  onClose: () => void;
}

export function RegistrationModal({
  open,
  ...props
}: DialogProps & { open: boolean }) {
  const { on } = useFx();
  const anim = on("pageTransitions");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="personal-code"
          className="fixed inset-0 z-[62] flex select-none items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm"
          initial={anim ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={anim ? { opacity: 0 } : { opacity: 0, transition: { duration: 0 } }}
        >
          <motion.div
            className="panel-solid flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl"
            initial={anim ? { opacity: 0, y: 36, scale: 0.95 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={anim ? { opacity: 0, y: 24, scale: 0.97 } : { opacity: 0, transition: { duration: 0 } }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <PersonalCodeDialog {...props} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PersonalCodeDialog({ initialId, registrationEnabled, onClose }: DialogProps) {
  const { on } = useFx();
  const [step, setStep] = useState<Step>("id");
  const [idNumber, setIdNumber] = useState(() => initialId.replace(/\D/g, "").slice(0, 9));
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [vaad, setVaad] = useState("1");
  const [completeExisting, setCompleteExisting] = useState(false);
  const [namePrompt, setNamePrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [resultMessage, setResultMessage] = useState("");
  const [lookup, setLookup] = useState<PersonalCodeLookupResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationStatus().then((value) => { if (!cancelled) setStatus(value); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, onClose]);

  const fail = (message: string) => {
    setError(message);
    playSound("error");
  };

  const validateId = () => {
    if (!/^\d{5,9}$/.test(idNumber.trim())) {
      fail("נא להזין תחילה תעודת זהות תקינה, בת 5 עד 9 ספרות.");
      return false;
    }
    return true;
  };

  const validateName = () => {
    if (firstName.trim().length < 2) {
      fail("נא להזין שם פרטי כפי שרשום בגיליון.");
      return false;
    }
    if (lastName.trim().length < 2) {
      fail("נא להזין שם משפחה כפי שרשום בגיליון.");
      return false;
    }
    if (!/^\d{1,2}$/.test(vaad.trim()) || Number(vaad) < 1 || Number(vaad) > 99) {
      fail("נא להזין מספר ועד תקין בין 1 ל־99.");
      return false;
    }
    return true;
  };

  const showLookup = async (first: string, last: string, message: string) => {
    setBusy(true);
    setError(null);
    const result = await lookupPersonalCode(idNumber.trim(), first.trim(), last.trim());
    setLookup(result);
    setResultMessage(message);
    setStep("result");
    setBusy(false);
    if (result.found) {
      playSound("success");
      if (on("confetti")) fireConfetti({ x: 0.5, y: 0.5 });
    } else {
      playSound("error");
    }
  };

  const proceed = async () => {
    setError(null);
    if (!validateId()) return;
    if (status && !status.configured) {
      fail("החיבור ל-Google Sheets אינו מוגדר. יש לפנות למנהל כדי להגדיר חשבון שירות ולשתף אותו עם הגיליון.");
      return;
    }

    setBusy(true);
    const result = await checkRegistration(idNumber.trim());
    setBusy(false);
    if (result.error || result.code) {
      fail(result.error || "בדיקת תעודת הזהות נכשלה.");
      return;
    }

    if (result.exists && result.source === "sheets" && result.firstName?.trim() && result.lastName?.trim()) {
      setFirstName(result.firstName);
      setLastName(result.lastName);
      await showLookup(
        result.firstName,
        result.lastName,
        "נמצאה תעודת הזהות בגיליון הרישום. מחפשים את השם בגיליון הקודים.",
      );
      return;
    }

    if (!registrationEnabled) {
      fail("תעודת הזהות לא נמצאה עם שם מלא בגיליון הרישום. כדי להוסיף או להשלים שם, יש להפעיל רישום חדש בהגדרות הניהול.");
      return;
    }

    const missingNameInExistingRow = Boolean(result.exists && result.source === "sheets");
    setCompleteExisting(missingNameInExistingRow);
    setNamePrompt(
      missingNameInExistingRow
        ? "תעודת הזהות קיימת בגיליון הרישום אבל חסר בה שם. הזן את השם כדי להשלים את אותה שורה, בלי ליצור כפילות."
        : result.exists && result.source === "local-csv"
          ? "נמצא גיבוי מקומי בלבד. הזן את השם כדי לרשום את תעודת הזהות בגיליון הרישום עצמו."
          : "תעודת הזהות לא נמצאה בגיליון הרישום. הזן את השם כדי להוסיף אותה, ואז המערכת תחפש בגיליון הקודים.",
    );
    setStep("name");
    playSound("click");
  };

  const submitName = async () => {
    setError(null);
    if (!validateId() || !validateName()) return;
    if (!registrationEnabled) {
      fail("רישום חדש כבוי בהגדרות המנהל.");
      return;
    }

    setBusy(true);
    const saved = await registerStudentApi({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      idNumber: idNumber.trim(),
      vaad: Number(vaad.trim()),
    });
    if (!saved.success && !saved.duplicate) {
      setBusy(false);
      fail(saved.error || "לא ניתן לשמור את השם בגיליון הרישום.");
      return;
    }

    // Re-read the registration sheet so the lookup uses its canonical name, never the unverified input.
    const confirmed = await checkRegistration(idNumber.trim());
    if (confirmed.exists && confirmed.source === "sheets" && confirmed.firstName?.trim() && confirmed.lastName?.trim()) {
      setFirstName(confirmed.firstName);
      setLastName(confirmed.lastName);
      const message = saved.duplicate
        ? "תעודת הזהות כבר רשומה. לא נוצר רישום כפול; נעשה שימוש בשם שבגיליון הרישום."
        : completeExisting
          ? "השם הושלם בשורה הקיימת בגיליון הרישום."
          : "הפרטים נשמרו בגיליון הרישום. כעת מחפשים את השם בגיליון הקודים.";
      await showLookup(confirmed.firstName, confirmed.lastName, message);
      return;
    }

    setBusy(false);
    fail(confirmed.error || "השמירה לא אומתה בגיליון הרישום. לא ממשיכים לחיפוש הקוד.");
  };

  const reset = () => {
    setStep("id");
    setIdNumber("");
    setFirstName("");
    setLastName("");
    setVaad("1");
    setCompleteExisting(false);
    setNamePrompt("");
    setBusy(false);
    setError(null);
    setLookup(null);
    setResultMessage("");
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-300 to-blue-600 text-navy-900 shadow-lg shadow-sky-500/20">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-black text-white">חיפוש קוד אישי</h3>
            <p className="text-xs text-slate-400">מתחילים בתעודת זהות וממשיכים לפי גיליון הרישום</p>
          </div>
        </div>
        <FxButton variant="ghost" onClick={onClose} disabled={busy} className="h-10 w-10 !rounded-xl" aria-label="סגירה">
          <X className="h-5 w-5" />
        </FxButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {step === "id" && (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void proceed(); }}>
            {status && !status.configured && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/35 bg-amber-400/[0.08] p-3 text-xs leading-relaxed text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                יש להגדיר גישה לחשבון השירות ולגיליון הרישום והקודים באזור הניהול.
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] px-3 py-2 text-xs font-medium text-sky-100">
              <Search className="h-4 w-4 shrink-0 text-sky-300" />
              תחילה נבדוק את תעודת הזהות בגיליון הרישום. אם יש שם, נחפש את הקוד בלי לבקש את השם שוב.
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-300">תעודת זהות <span className="text-red-400">*</span></span>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={9}
                value={idNumber}
                onChange={(event) => { setIdNumber(event.target.value.replace(/\D/g, "")); setError(null); }}
                placeholder="הזן 5–9 ספרות"
                dir="ltr"
                className={inputClass + " text-left font-mono tracking-[0.25em]"}
              />
            </label>
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <span>{error}</span>
              </div>
            )}
            <FxButton variant="gold" type="submit" disabled={busy} className="h-12 w-full text-base">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
              {busy ? "בודק בגיליון הרישום..." : "המשך"}
            </FxButton>
          </form>
        )}

        {step === "name" && (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submitName(); }}>
            <div className="flex items-start gap-2.5 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] p-3 text-sm leading-relaxed text-sky-100">
              <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
              <span>{namePrompt}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <span className="text-xs text-slate-400">תעודת זהות</span>
              <span className="font-mono font-bold text-white" dir="ltr">{idNumber}</span>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-300">שם פרטי <span className="text-red-400">*</span></span>
                <input autoFocus type="text" value={firstName} onChange={(event) => { setFirstName(event.target.value); setError(null); }} placeholder="לדוגמה: יעקב יוסף" maxLength={60} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-300">שם משפחה <span className="text-red-400">*</span></span>
                <input type="text" value={lastName} onChange={(event) => { setLastName(event.target.value); setError(null); }} placeholder="לדוגמה: אבאייב" maxLength={60} className={inputClass} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-300">ועד <span className="text-red-400">*</span></span>
              <input type="number" min={1} max={99} value={vaad} onChange={(event) => { setVaad(event.target.value); setError(null); }} className={inputClass} />
              <span className="mt-1 block text-[10px] text-slate-500">נדרש רק עבור רשומה חדשה או שורה שחסר בה ועד.</span>
            </label>
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <span>{error}</span>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <FxButton variant="ghost" onClick={() => { setError(null); setStep("id"); }} className="h-12" disabled={busy}>חזרה לתעודת זהות</FxButton>
              <FxButton variant="emerald" type="submit" className="h-12" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {busy ? "שומר ומחפש..." : completeExisting ? "השלם שם וחפש קוד" : "רשום וחפש קוד אישי"}
              </FxButton>
            </div>
          </form>
        )}

        {step === "result" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-sky-400/25 bg-sky-400/[0.07] p-4">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
              <div className="min-w-0">
                <h4 className="font-bold text-white">{lookup?.found ? "נמצאה רשומה בגיליון הקודים" : "תוצאת חיפוש קוד אישי"}</h4>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{resultMessage}</p>
                {lookup?.found && (
                  <p className="mt-1 text-xs text-slate-400">
                    {lookup.sheetTitle || "גיליון הקודים"} · {lookup.tabName || "לשונית הקודים"} · שורה {lookup.rowNumber}
                  </p>
                )}
              </div>
            </div>
            {lookup?.found && lookup.headers && lookup.values ? (
              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="border-b border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-bold text-slate-300">כל הנתונים בשורה שנמצאה</div>
                <div className="max-h-[48vh] overflow-y-auto">
                  {lookup.headers.map((header, index) => (
                    <div key={header + "-" + index} className="grid gap-1 border-b border-white/[0.06] px-4 py-3 last:border-0 sm:grid-cols-[minmax(120px,0.8fr)_minmax(0,1.5fr)]">
                      <div className="break-words text-xs font-bold text-slate-400">{header || ("עמודה " + (index + 1))}</div>
                      <div className="break-words text-sm text-white">{lookup.values?.[index] || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm leading-relaxed text-amber-100">
                {lookup?.error || "לא נמצאה שורה תואמת בגיליון הקודים."}
              </div>
            )}
            <FxButton variant="gold" onClick={reset} className="h-12 w-full">
              <Search className="h-4 w-4" />
              חיפוש קוד אישי נוסף
            </FxButton>
          </div>
        )}
      </div>
    </>
  );
}
