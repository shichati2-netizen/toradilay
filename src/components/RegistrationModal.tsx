"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Loader2,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { lookupPersonalCode, type PersonalCodeLookupResult } from "@/lib/client/api";
import { fireConfetti, useFx } from "@/lib/client/fx";
import { playSound } from "@/lib/client/sound";
import { FxButton } from "./FxButton";

const inputClass =
  "h-12 w-full rounded-xl border border-white/15 bg-navy-950/60 px-3.5 text-base text-white placeholder-slate-500 outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/25";

interface DialogProps {
  initialId: string;
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
            className="panel-solid flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden shadow-2xl"
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

function PersonalCodeDialog({ initialId, onClose }: DialogProps) {
  const { on } = useFx();
  const [idNumber, setIdNumber] = useState(() => initialId.replace(/\D/g, "").slice(0, 9));
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<PersonalCodeLookupResult | null>(null);

  const fail = (message: string) => {
    setError(message);
    playSound("error");
  };

  const search = async () => {
    setError(null);
    if (firstName.trim().length < 2) {
      fail("נא להזין שם פרטי.");
      return;
    }
    if (lastName.trim().length < 2) {
      fail("נא להזין שם משפחה.");
      return;
    }
    if (!/^\d{5,9}$/.test(idNumber.trim())) {
      fail("נא להזין תעודת זהות תקינה, בת 5 עד 9 ספרות.");
      return;
    }

    // The ID is only validated in this component. It is deliberately NOT sent
    // to the API, written to Sheets, logged, or used as a lookup key.
    setBusy(true);
    try {
      const result = await lookupPersonalCode(firstName.trim(), lastName.trim());
      setLookup(result);
      if (result.found && result.personalCode) {
        playSound("success");
        if (on("confetti")) fireConfetti({ x: 0.5, y: 0.5 });
      } else {
        playSound("error");
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setIdNumber("");
    setFirstName("");
    setLastName("");
    setError(null);
    setLookup(null);
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
            <p className="text-xs text-slate-400">חיפוש לפי שם פרטי ושם משפחה</p>
          </div>
        </div>
        <FxButton variant="ghost" onClick={onClose} disabled={busy} className="h-10 w-10 !rounded-xl" aria-label="סגירה">
          <X className="h-5 w-5" />
        </FxButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {!lookup ? (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void search(); }}>
            <div className="flex items-start gap-2.5 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] p-3 text-sm leading-relaxed text-sky-100">
              <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
              <span>ממלאים את הפרטים, והמערכת מחפשת בגיליון הקודים לפי השם הפרטי ושם המשפחה.</span>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-300">שם פרטי <span className="text-red-400">*</span></span>
              <input
                autoFocus
                type="text"
                value={firstName}
                onChange={(event) => { setFirstName(event.target.value); setLookup(null); setError(null); }}
                placeholder="לדוגמה: יעקב"
                maxLength={60}
                autoComplete="given-name"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-300">שם משפחה <span className="text-red-400">*</span></span>
              <input
                type="text"
                value={lastName}
                onChange={(event) => { setLastName(event.target.value); setLookup(null); setError(null); }}
                placeholder="לדוגמה: כהן"
                maxLength={60}
                autoComplete="family-name"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-300">תעודת זהות <span className="text-red-400">*</span></span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={9}
                value={idNumber}
                onChange={(event) => { setIdNumber(event.target.value.replace(/\D/g, "").slice(0, 9)); setError(null); }}
                placeholder="לדוגמה: 215000000"
                autoComplete="off"
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
              {busy ? "מחפש בגיליון הקודים..." : "חפש קוד אישי"}
            </FxButton>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-sky-400/25 bg-sky-400/[0.07] p-4">
              {lookup.found && lookup.personalCode ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              )}
              <div className="min-w-0">
                <h4 className="font-bold text-white">{lookup.found && lookup.personalCode ? "נמצא הקוד האישי" : "לא נמצא קוד אישי"}</h4>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">
                  {lookup.found && lookup.personalCode
                    ? "החיפוש הושלם בהצלחה."
                    : lookup.error || "לא נמצאה התאמה לשם שהוזן. בדוק את האיות ונסה שוב."}
                </p>
              </div>
            </div>

            {lookup.found && lookup.personalCode && (
              <div className="rounded-2xl border border-emerald-300/30 bg-emerald-400/[0.08] p-6 text-center">
                <div className="flex items-center justify-center gap-2 text-sm font-bold text-emerald-100">
                  <KeyRound className="h-5 w-5" />
                  קוד אישי
                </div>
                <div className="mt-3 break-all font-mono text-3xl font-black tracking-widest text-white" dir="auto">
                  {lookup.personalCode}
                </div>
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
