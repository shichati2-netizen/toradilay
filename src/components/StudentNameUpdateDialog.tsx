"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Loader2, UserRound, X } from "lucide-react";
import { FxButton } from "./FxButton";

interface StudentNameUpdateDialogProps {
  open: boolean;
  studentId: string;
  initialFirstName?: string;
  initialLastName?: string;
  saving: boolean;
  error: string | null;
  onSubmit: (firstName: string, lastName: string) => void;
  onSkip: () => void;
}

export function StudentNameUpdateDialog({
  open,
  studentId,
  initialFirstName = "",
  initialLastName = "",
  saving,
  error,
  onSubmit,
  onSkip,
}: StudentNameUpdateDialogProps) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);

  useEffect(() => {
    if (!open) return;
    setFirstName(initialFirstName);
    setLastName(initialLastName);
  }, [open, studentId, initialFirstName, initialLastName]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    if (first.length < 2 || last.length < 2 || saving) return;
    onSubmit(first, last);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-name-update-title"
            className="panel-solid w-full max-w-md overflow-hidden rounded-3xl shadow-2xl"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-400/15 text-gold-300">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="student-name-update-title" className="font-serif text-xl font-black text-white">עדכון שם</h2>
                  <p className="text-xs text-slate-400">הכניסה נשארת באמצעות תעודת הזהות</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSkip}
                disabled={saving}
                aria-label="סגירה והמשך"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 p-5">
              <div className="rounded-xl border border-gold-300/20 bg-gold-300/[0.07] p-3 text-sm leading-relaxed text-gold-100">
                לא מצאנו שם מלא מעודכן עבור תעודת הזהות הזו. נא להשלים את השם כדי שנוכל להציג את התיקייה גם לפי שם התלמיד.
              </div>

              <label className="block text-sm font-semibold text-slate-200">
                שם פרטי
                <input
                  autoFocus
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  disabled={saving}
                  maxLength={60}
                  autoComplete="given-name"
                  placeholder="שם פרטי"
                  className="mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-slate-950/60 px-4 text-base text-white outline-none transition focus:border-gold-400 disabled:opacity-60"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-200">
                שם משפחה
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={saving}
                  maxLength={60}
                  autoComplete="family-name"
                  placeholder="שם משפחה"
                  className="mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-slate-950/60 px-4 text-base text-white outline-none transition focus:border-gold-400 disabled:opacity-60"
                />
              </label>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                  <span>{error}</span>
                </div>
              )}

              <FxButton type="submit" variant="gold" disabled={saving || firstName.trim().length < 2 || lastName.trim().length < 2} className="h-12 w-full">
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserRound className="h-5 w-5" />}
                {saving ? "שומר את השם..." : "עדכן שם והמשך"}
              </FxButton>
              <FxButton type="button" variant="ghost" onClick={onSkip} disabled={saving} className="h-11 w-full">
                המשך בלי לעדכן שם
              </FxButton>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
