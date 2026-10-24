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

type Step = "form" | "confirm" | "result";

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
  const [step, setStep] = useState<Step>("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState(() => initialId.replace(/\D/g, "").slice(0, 9));
  const [vaad, setVaad] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [resultMessage, setResultMessage] = useState("");
  const [lookup, setLookup] = useState<PersonalCodeLookupResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationStatus().then((s) => !cancelled && setStatus(s));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, onClose]);

  const fail = (message: string) => {
    setError(message);
    playSound("error");
  };

  const validate = () => {
    if (firstName.trim().length < 2) {
      fail("נא להזין שם פרטי כפי שרשום בגיליון.");
      return false;
    }
    if (lastName.trim().length < 2) {
      fail("נא להזין שם משפחה כפי שרשום בגיליון.");
      return false;
    }
    if (!/^\d{5,9}$/.test(idNumber.trim())) {
      fail("נא להזין תעודת זהות תקינה, בת 5 עד 9 ספרות.");
      return false;
    }
    if (registrationEnabled && (!/^\d{1,2}$/.test(vaad.trim()) || Number(vaad) < 1 || Number(vaad) > 99)) {
      fail("נא להזין מספר ועד תקין בין 1 ל־99.");
      return false;
    }
    return true;
  };

  const runLookup = async (message: string) => {
    setBusy(true);
    setError(null);
    const result = await lookupPersonalCode(idNumber.trim(), firstName.trim(), lastName.trim());
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
    if (!validate()) return;
    if (status && !status.configured) {
      fail("החיבור לגיליון הרישום אינו מוגדר. יש לפנות למנהל המערכת.");
      return;
    }

    setBusy(true);
    const result = await checkRegistration(idNumber.trim());
    setBusy(false);
    if (result.error || result.code) {
      fail(result.error || "בדיקת תעודת הזהות נכשלה.");
      return;
    }

    if (result.exists) {
      await runLookup("תעודת הזהות כבר רשומה. לא נוספה שורה כפולה; נבדקת כעת התאמת השם והמידע בגיליון השני.");
      return;
    }

    if (!registrationEnabled) {
      fail("תעודת הזהות לא נמצאה בגיליון הרישום, והוספת רישומים חדשים כבויה בהגדרות מנהל.");
      return;
    }

    setStep("confirm");
    playSound("click");
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await registerStudentApi({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      idNumber: idNumber.trim(),
      vaad: Number(vaad.trim()),
    });

    if (res.duplicate) {
      const result = await lookupPersonalCode(idNumber.trim(), firstName.trim(), lastName.trim());
      setLookup(result);
      setResultMessage("תעודת הזהות כבר קיימת. לא הוספנו רישום כפול.");
      setStep("result");
      setBusy(false);
      if (result.found) playSound("success");
      else playSound("error");
      return;
    }

    if (!res.success) {
      setBusy(false);
      setStep("form");
      fail(res.error || "שמירת פרטי התלמיד נכשלה.");
      return;
    }

    const result = await lookupPersonalCode(idNumber.trim(), firstName.trim(), lastName.trim());
    setLookup(result);
    setResultMessage("פרטי התלמיד נשמרו בגיליון הרישום. בוצע חיפוש של השם בגיליון הנתונים השני.");
    setStep("result");
    setBusy(false);
    playSound(result.found ? "success" : "click");
    if (result.found && on("confetti")) fireConfetti({ x: 0.5, y: 0.5 });
  };

  const reset = () => {
    setStep("form");
    setFirstName("");
    setLastName("");
    setIdNumber("");
    setVaad("1");
    setBusy(false);
    setError(null);
    setLookup(null);
    setResultMessage("");
  };

  const showProblem = lookup && !lookup.found ? lookup.error || "לא נמצאה שורה תואמת בגיליון הנתונים השני." : null;

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-300 to-blue-600 text-navy-900 shadow-lg shadow-sky-500/20">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-black text-white">חיפוש קוד אישי</h3>
            <p className="text-xs text-slate-400">הזן תעודת זהות ושם לחיפוש הרשומה בגיליון הנתונים</p>
          </div>
        </div>
        <FxButton variant="ghost" onClick={onClose} disabled={busy} className="h-10 w-10 !rounded-xl" aria-label="סגירה">
          <X className="h-5 w-5" />
        </FxButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {step === "form" && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void proceed(); }}>
            {status && !status.configured && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/35 bg-amber-400/[0.08] p-3 text-xs leading-relaxed text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                יש להגדיר גישה לגיליון הרישום ולגיליון הנתונים השני באזור הניהול.
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] px-3 py-2 text-xs font-medium text-sky-100">
              <Search className="h-4 w-4 shrink-0 text-sky-300" />
              בדיקת תעודת הזהות מונעת רישום כפול, והשם חייב להתאים לרשומה הקיימת.
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-300">שם פרטי <span className="text-red-400">*</span></span>
                <input autoFocus type="text" value={firstName} onChange={(e) => { setFirstName(e.target.value); setError(null); }} placeholder="לדוגמה: ישראל" maxLength={60} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-300">שם משפחה <span className="text-red-400">*</span></span>
                <input type="text" value={lastName} onChange={(e) => { setLastName(e.target.value); setError(null); }} placeholder="לדוגמה: כהן" maxLength={60} className={inputClass} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-300">תעודת זהות <span className="text-red-400">*</span></span>
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={9} value={idNumber} onChange={(e) => { setIdNumber(e.target.value.replace(/\D/g, "")); setError(null); }} placeholder="הזן 5–9 ספרות" dir="ltr" className={inputClass + " text-left font-mono tracking-[0.25em]"} />
            </label>
            {registrationEnabled && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-300">מספר ועד <span className="text-red-400">*</span></span>
                <input type="number" min={1} max={99} value={vaad} onChange={(e) => { setVaad(e.target.value); setError(null); }} className={inputClass} />
                <span className="mt-1 block text-[10px] text-slate-500">נדרש רק אם תעודת הזהות אינה רשומה ויש להוסיף רשומה חדשה.</span>
              </label>
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <span>{error}</span>
              </div>
            )}
            <FxButton variant="gold" type="submit" disabled={busy} className="h-12 w-full text-base">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
              {busy ? "בודק ומחפש..." : "חפש קוד אישי"}
            </FxButton>
          </form>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gold-400/30 bg-gold-400/[0.07] p-4 text-sm leading-relaxed text-gold-100">
              תעודת הזהות אינה קיימת בגיליון הרישום. אם תאשר, תישמר שורה חדשה עם השם, תעודת הזהות ומספר הוועד; לאחר מכן יחפש המערכת את השם בגיליון הנתונים השני. אם לא תימצא התאמה, הרישום יישמר אך לא יוצגו פרטי שורה.
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white"><UserRound className="h-4 w-4 text-sky-300" />פרטי הרישום</div>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-400">שם מלא</span><span className="font-bold text-white">{firstName.trim()} {lastName.trim()}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-400">תעודת זהות</span><span dir="ltr" className="font-mono font-bold text-white">{idNumber}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-400">ועד</span><span className="font-mono font-bold text-white">{vaad}</span></div>
              </div>
            </div>
            {error && <p className="text-sm text-red-200">{error}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <FxButton variant="ghost" onClick={() => setStep("form")} className="h-12">חזרה לעריכה</FxButton>
              <FxButton variant="emerald" onClick={() => void submit()} disabled={busy} className="h-12">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {busy ? "שומר ומחפש..." : "שמור וחפש קוד אישי"}
              </FxButton>
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-sky-400/25 bg-sky-400/[0.07] p-4">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
              <div className="min-w-0">
                <h4 className="font-bold text-white">{lookup?.found ? "נמצאה רשומה בגיליון הנתונים" : "תוצאת חיפוש קוד אישי"}</h4>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">{resultMessage}</p>
                {lookup?.found && (
                  <p className="mt-1 text-xs text-slate-400">
                    {lookup.sheetTitle || "גיליון הנתונים"} · {lookup.tabName || "גיליון ראשון"} · שורה {lookup.rowNumber}
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
                {showProblem || "לא נמצאה שורה תואמת בגיליון הנתונים השני."}
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
