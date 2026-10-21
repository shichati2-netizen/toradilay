"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  ShieldCheck,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import type { RegistrationStatus } from "@/lib/types";
import {
  checkRegistration,
  fetchRegistrationStatus,
  registerStudentApi,
} from "@/lib/client/api";
import { fireConfetti, useFx } from "@/lib/client/fx";
import { playSound } from "@/lib/client/sound";
import { FxButton } from "./FxButton";

type Step = "form" | "duplicate" | "confirm" | "success";

const inputClass =
  "h-12 w-full rounded-xl border border-white/15 bg-navy-950/60 px-3.5 text-base text-white placeholder-slate-500 outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-400/25";

function Row({
  label,
  col,
  value,
  mono,
}: {
  label: string;
  col: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <span className="text-xs text-slate-400">
        {label}{" "}
        <span className="font-mono text-[10px] text-slate-500">
          (עמודה {col})
        </span>
      </span>
      <span
        className={`text-sm font-bold text-white ${mono ? "font-mono tracking-wider" : "font-serif"}`}
      >
        {value}
      </span>
    </div>
  );
}

interface DialogProps {
  initialId: string;
  onClose: () => void;
  /** נקרא כשהמשתמש בוחר לאתר את התיקייה של התלמיד שנרשם */
  onRegistered: (studentId: string, studentName: string) => void;
}

/** עטיפה עם אנימציה; הטופס עצמו נטען מחדש בכל פתיחה ולכן מתחיל תמיד נקי */
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
          key="register"
          className="fixed inset-0 z-[62] flex select-none items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm"
          initial={anim ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={
            anim ? { opacity: 0 } : { opacity: 0, transition: { duration: 0 } }
          }
        >
          <motion.div
            className="panel-solid flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden shadow-2xl"
            initial={anim ? { opacity: 0, y: 36, scale: 0.95 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              anim
                ? { opacity: 0, y: 24, scale: 0.97 }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <RegistrationDialog {...props} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RegistrationDialog({ initialId, onClose, onRegistered }: DialogProps) {
  const { on } = useFx();

  const [step, setStep] = useState<Step>("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [idNumber, setIdNumber] = useState(() =>
    initialId.replace(/\D/g, "").slice(0, 9),
  );
  const [vaad, setVaad] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{
    studentName?: string;
    rowNumber?: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRegistrationStatus().then((s) => !cancelled && setStatus(s));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [busy, onClose]);

  const clearError = () => error && setError(null);
  const notConfigured = status !== null && !status.configured;

  const validate = (): boolean => {
    const f = firstName.trim();
    const l = lastName.trim();
    const id = idNumber.trim();
    const v = vaad.trim();
    if (f.length < 2)
      return fail("נא להזין שם פרטי מדויק כפי שרשום בישיבה (לפחות 2 אותיות)");
    if (l.length < 2)
      return fail("נא להזין שם משפחה מדויק כפי שרשום בישיבה (לפחות 2 אותיות)");
    if (!/^\d{5,9}$/.test(id))
      return fail("נא להזין תעודת זהות תקינה (ספרות בלבד, 5 עד 9 ספרות)");
    if (!v || Number.isNaN(Number(v)) || Number(v) < 1)
      return fail("בוועד יש להכניס מספר תקין (לדוגמה: 1, 2, 3...)");
    return true;
  };

  const fail = (msg: string) => {
    setError(msg);
    playSound("error");
    return false;
  };

  const proceed = async () => {
    setError(null);
    if (!validate()) return;
    if (notConfigured) {
      fail("הרישום ל-Google Sheets אינו מוגדר. יש לפנות למנהל כדי להגדיר חשבון שירות ולשמור את מזהה הגיליון.");
      return;
    }
    setBusy(true);
    const res = await checkRegistration(idNumber.trim());
    setBusy(false);
    if (
      res.code === "NOT_CONFIGURED" ||
      (res.error && !res.exists && res.code)
    ) {
      fail(res.error ?? "שגיאה");
      return;
    }
    if (res.exists) {
      setDuplicate({ studentName: res.studentName, rowNumber: res.rowNumber });
      setStep("duplicate");
      playSound("click");
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
    setBusy(false);
    if (res.success) {
      setSuccessMessage(res.message ?? "התלמיד נוסף ל-Google Sheets בהצלחה.");
      setStep("success");
      playSound("success");
      if (on("confetti")) fireConfetti({ x: 0.5, y: 0.5 });
    } else {
      setStep("form");
      fail(res.error ?? "אירעה שגיאה בעת הוספת התלמיד ל-Google Sheets");
    }
  };

  const resetForAnother = () => {
    setStep("form");
    setFirstName("");
    setLastName("");
    setIdNumber("");
    setVaad("1");
    setError(null);
    setDuplicate(null);
    setSuccessMessage(null);
  };

  const searchRegistered = () => {
    const id = idNumber.trim();
    const name = `${firstName.trim()} ${lastName.trim()}`;
    onClose();
    onRegistered(id, name);
  };

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  return (
    <>
      {/* כותרת */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-white shadow-lg shadow-emerald-500/25">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-black text-white">
              רישום תלמיד חדש
            </h3>
            <p className="text-xs text-slate-400">
              הזנת פרטים להוספה ל-Google Sheets
            </p>
          </div>
        </div>
        <FxButton
          variant="ghost"
          onClick={onClose}
          disabled={busy}
          className="h-10 w-10 !rounded-xl"
          aria-label="סגירה"
        >
          <X className="h-5 w-5" />
        </FxButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {/* ---------- הצלחה ---------- */}
        {step === "success" && (
          <div className="space-y-5 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/15 ring-2 ring-emerald-400/50">
              <CheckCircle2 className="h-10 w-10 text-emerald-300" />
            </div>
            <div>
              <h4 className="font-serif text-2xl font-black text-white">
                הרישום הושלם בהצלחה!
              </h4>
              <p className="mt-1 text-xs text-slate-400">
                {successMessage ?? "התלמיד נוסף ל-Google Sheets ונשמר גם בקובץ CSV מקומי."}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-1 text-right">
              <Row label="שם פרטי" col="A" value={firstName.trim()} />
              <Row label="שם משפחה" col="B" value={lastName.trim()} />
              <Row label="תעודת זהות" col="C" value={idNumber.trim()} mono />
              <Row label="ועד" col="D" value={vaad.trim()} mono />
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <FxButton
                variant="gold"
                onClick={searchRegistered}
                className="h-12 text-sm"
              >
                <UserCheck className="h-4 w-4" />
                אתר תיקייה כעת עם ת.ז. זו
              </FxButton>
              <FxButton
                variant="ghost"
                onClick={resetForAnother}
                className="h-12 text-sm"
              >
                <UserPlus className="h-4 w-4" />
                רישום תלמיד נוסף
              </FxButton>
            </div>
          </div>
        )}

        {/* ---------- כפילות ---------- */}
        {step === "duplicate" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-400/35 bg-amber-400/[0.08] p-4">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-300" />
              <div className="text-sm leading-relaxed text-amber-50">
                <p className="font-bold">
                  לתשומת לבך: תעודת זהות{" "}
                  <span className="font-mono">{idNumber.trim()}</span> כבר רשומה
                  במאגר הרישום.
                </p>
                <p className="mt-1 text-xs text-amber-100/90">
                  שם קיים: <strong>{duplicate?.studentName || "ללא שם"}</strong>
                  {duplicate?.rowNumber ? (
                    <> · שורה {duplicate.rowNumber}</>
                  ) : null}
                </p>
                <p className="mt-2 text-xs text-amber-100/80">
                  האם ברצונך להמשיך ברישום בכל זאת?
                </p>
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <FxButton
                variant="ghost"
                onClick={() => setStep("form")}
                className="h-12 text-sm"
              >
                חזור לעריכה
              </FxButton>
              <FxButton
                variant="gold"
                onClick={() => setStep("confirm")}
                className="h-12 text-sm"
              >
                המשך בכל זאת
              </FxButton>
            </div>
          </div>
        )}

        {/* ---------- אישור ---------- */}
        {step === "confirm" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-gold-400/30 bg-gold-400/[0.07] p-4 text-sm text-gold-100">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
              פעולה זו תוסיף שורה ל-Google Sheets וגם תשמור עותק מקומי לצורך חיפוש שמות:
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-1">
              <Row label="שם פרטי" col="A" value={firstName.trim()} />
              <Row label="שם משפחה" col="B" value={lastName.trim()} />
              <Row label="תעודת זהות" col="C" value={idNumber.trim()} mono />
              <Row label="מספר ועד" col="D" value={vaad.trim()} mono />
            </div>
            <p className="break-all text-[11px] text-slate-400">
              גיבוי מקומי: <span className="font-mono" dir="ltr">Documents\\ToraDelia-Registrations.csv</span>
            </p>
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-300" />
                {error}
              </div>
            )}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <FxButton
                variant="ghost"
                onClick={() => setStep("form")}
                disabled={busy}
                className="h-12 text-sm"
              >
                חזור לעריכה
              </FxButton>
              <FxButton
                variant="emerald"
                onClick={submit}
                disabled={busy}
                className="h-12 text-sm"
              >
                {busy ? (
                  <Loader2 className="keep-anim h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {busy ? "מוסיף ל-Sheets..." : "אשר והוסף ל-Sheets"}
              </FxButton>
            </div>
          </div>
        )}

        {/* ---------- טופס ---------- */}
        {step === "form" && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              proceed();
            }}
          >
            {notConfigured && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/35 bg-amber-400/[0.08] p-3 text-xs leading-relaxed text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                כדי לרשום תלמידים יש להגדיר חשבון שירות ומזהה Google Sheets באזור הניהול.
              </div>
            )}

            <div className="flex items-center gap-2 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] px-3 py-2 text-xs font-medium text-sky-100">
              <HelpCircle className="h-4 w-4 shrink-0 text-sky-300" />
              נא להזין את השם המדויק כפי שרשום בישיבה
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-300">
                  שם פרטי <span className="text-red-400">*</span>
                </span>
                <input
                  autoFocus
                  type="text"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    clearError();
                  }}
                  placeholder="לדוגמה: ישראל"
                  maxLength={60}
                  className={inputClass}
                />
                <span className="mt-1 block text-[10px] text-slate-500">
                  עמודה A בקובץ CSV
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-300">
                  שם משפחה <span className="text-red-400">*</span>
                </span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    clearError();
                  }}
                  placeholder="לדוגמה: כהן"
                  maxLength={60}
                  className={inputClass}
                />
                <span className="mt-1 block text-[10px] text-slate-500">
                  עמודה B בקובץ CSV
                </span>
              </label>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-[1.6fr_1fr]">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-300">
                  תעודת זהות <span className="text-red-400">*</span>
                </span>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={9}
                    value={idNumber}
                    onChange={(e) => {
                      setIdNumber(e.target.value.replace(/\D/g, ""));
                      clearError();
                    }}
                    placeholder="הזן 9 ספרות"
                    dir="ltr"
                    className={`${inputClass} text-left font-mono tracking-[0.25em]`}
                  />
                  {idNumber.length > 0 && (
                    <span className="absolute right-3 top-3.5 font-mono text-[11px] text-slate-500">
                      {idNumber.length}/9
                    </span>
                  )}
                </div>
                <span className="mt-1 block text-[10px] text-slate-500">
                  עמודה C בקובץ CSV
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-300">
                  ועד <span className="text-red-400">*</span>
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={vaad}
                  onChange={(e) => {
                    setVaad(e.target.value);
                    clearError();
                  }}
                  placeholder="1"
                  dir="ltr"
                  className={`${inputClass} text-left font-mono`}
                />
                <span className="mt-1 block text-[10px] text-slate-500">
                  להכניס מספר (1, 2, 3...) · עמודה D בקובץ CSV
                </span>
              </label>
            </div>

            {error && (
              <div className="shake flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid gap-2.5 pt-1 sm:grid-cols-2">
              <FxButton
                variant="ghost"
                onClick={onClose}
                disabled={busy}
                className="h-12 text-sm"
              >
                ביטול
              </FxButton>
              <FxButton
                type="submit"
                variant="emerald"
                sound="none"
                disabled={busy}
                className="h-12 text-sm"
              >
                {busy ? (
                  <Loader2 className="keep-anim h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {busy ? "בודק בקובץ..." : "המשך לאישור הרישום"}
              </FxButton>
            </div>
            <p className="text-center text-[11px] text-slate-500">
              שם: {fullName || "—"} · הרישום נשמר במחשב בקובץ CSV
            </p>
          </form>
        )}
      </div>
    </>
  );
}
