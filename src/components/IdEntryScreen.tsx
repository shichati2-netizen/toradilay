"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  FileText,
  Hash,
  Printer,
  ShieldCheck,
  Usb,
  UserPlus,
} from "lucide-react";
import type { KioskConfig } from "@/lib/types";
import { useFx } from "@/lib/client/fx";
import { playSound } from "@/lib/client/sound";
import { FxButton } from "./FxButton";
import { NumericKeypad } from "./NumericKeypad";
import { SegmentedIdInput } from "./SegmentedIdInput";
import { TorahLogo } from "./TorahLogo";

const ID_LENGTH = 9;
export const ID_INPUT_CLASS = "kiosk-id-hidden-input";

const STEPS = [
  { icon: Hash, title: "הקלד תעודת זהות", text: "9 ספרות, והתיקייה נפתחת אוטומטית" },
  { icon: FileText, title: "בחר את המסמך", text: "תצוגה מקדימה של כל קובץ וורד" },
  { icon: Printer, title: "הדפס או העתק", text: "ישירות למדפסת או לדיסק און קי" },
];

/** מחלץ ספרה מאירוע מקלדת: מקשים רגילים, פריסה עברית, ומקלדת נומרית (גם בלי NumLock) */
function digitFromEvent(e: KeyboardEvent): string | null {
  if (/^[0-9]$/.test(e.key)) return e.key;
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code ?? "");
  return m ? m[1] : null;
}

export function IdEntryScreen({
  config,
  onSearch,
  isLoading,
  errorMessage,
  onClearError,
  keyboardEnabled,
  onOpenRegistration,
}: {
  config: KioskConfig;
  onSearch: (id: string) => Promise<boolean>;
  isLoading: boolean;
  errorMessage: string | null;
  onClearError: () => void;
  /** false כשחלון כלשהו פתוח — ההקלדה הגלובלית מושהית */
  keyboardEnabled: boolean;
  onOpenRegistration?: (currentId: string) => void;
}) {
  const { on } = useFx();
  const [value, setValue] = useState("");
  const valueRef = useRef("");
  const searchTimer = useRef<number | undefined>(undefined);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const update = useCallback((next: string) => {
    valueRef.current = next;
    setValue(next);
  }, []);

  const runSearch = useCallback(
    async (id: string) => {
      const ok = await onSearch(id);
      if (!ok) playSound("error");
    },
    [onSearch],
  );

  const addDigit = useCallback(
    (d: string) => {
      if (isLoading) return;
      const cur = valueRef.current;
      if (cur.length >= ID_LENGTH) return;
      if (errorMessage) onClearError();
      const next = cur + d;
      update(next);
      if (next.length === ID_LENGTH) {
        window.clearTimeout(searchTimer.current);
        searchTimer.current = window.setTimeout(() => runSearch(next), 160);
      }
    },
    [errorMessage, isLoading, onClearError, runSearch, update],
  );

  const backspace = useCallback(() => {
    if (isLoading) return;
    window.clearTimeout(searchTimer.current);
    if (errorMessage) onClearError();
    update(valueRef.current.slice(0, -1));
  }, [errorMessage, isLoading, onClearError, update]);

  const clear = useCallback(() => {
    if (isLoading) return;
    window.clearTimeout(searchTimer.current);
    if (errorMessage) onClearError();
    update("");
  }, [errorMessage, isLoading, onClearError, update]);

  const submit = useCallback(() => {
    const cur = valueRef.current.trim();
    if (!cur || isLoading) return;
    window.clearTimeout(searchTimer.current);
    runSearch(cur);
  }, [isLoading, runSearch]);

  /** הדבקה / הקלדה ישירה לשדה הנסתר (למשל קורא כרטיסים שמדמה מקלדת) */
  const handleHiddenInput = useCallback(
    (raw: string) => {
      if (isLoading) return;
      const next = raw.replace(/\D/g, "").slice(0, ID_LENGTH);
      if (next === valueRef.current) return;
      if (errorMessage) onClearError();
      update(next);
      window.clearTimeout(searchTimer.current);
      if (next.length === ID_LENGTH) {
        searchTimer.current = window.setTimeout(() => runSearch(next), 160);
      }
    },
    [errorMessage, isLoading, onClearError, runSearch, update],
  );

  /* ---------- מקלדת פיזית: האזנה גלובלית בשלב ה-capture ---------- */
  useEffect(() => {
    if (!keyboardEnabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) &&
        !t.classList.contains(ID_INPUT_CLASS)
      ) {
        return;
      }

      const digit = digitFromEvent(e);
      if (digit !== null) {
        e.preventDefault();
        playSound("key");
        addDigit(digit);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        playSound("delete");
        backspace();
        return;
      }
      if (e.key === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        submit();
        return;
      }
      if (e.key === "Escape" || e.key === "Delete") {
        e.preventDefault();
        clear();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [keyboardEnabled, addDigit, backspace, clear, submit]);

  /* ---------- שמירה על פוקוס בשדה הת.ז. כל עוד מסך הבית פעיל ---------- */
  useEffect(() => {
    if (!keyboardEnabled) return;

    const focusInput = () => {
      const el = hiddenInputRef.current;
      if (!el || document.activeElement === el) return;
      el.focus({ preventScroll: true });
    };

    const onPointer = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("button, a, textarea, select, [role='dialog']")) return;
      const input = target.closest("input");
      if (input && !input.classList.contains(ID_INPUT_CLASS)) return;
      // אחרי שהאירוע מסתיים, מחזירים את הפוקוס לשדה
      window.setTimeout(focusInput, 0);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") focusInput();
    };

    focusInput();
    const t1 = window.setTimeout(focusInput, 120);
    const t2 = window.setTimeout(focusInput, 600);
    window.addEventListener("focus", focusInput);
    window.addEventListener("kiosk:refocus", focusInput);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("focus", focusInput);
      window.removeEventListener("kiosk:refocus", focusInput);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [keyboardEnabled]);

  useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  /* ---------- סנכרון ספרות כשחיפוש מופעל מבחוץ (למשל אחרי רישום תלמיד) ---------- */
  useEffect(() => {
    const onSetId = (e: Event) => {
      const id = String((e as CustomEvent<string>).detail ?? "").replace(/\D/g, "").slice(0, ID_LENGTH);
      window.clearTimeout(searchTimer.current);
      update(id);
    };
    window.addEventListener("kiosk:set-id", onSetId);
    return () => window.removeEventListener("kiosk:set-id", onSetId);
  }, [update]);

  const showRegistration = config.registrationEnabled && Boolean(onOpenRegistration);

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-8 px-4 py-4 lg:grid-cols-[1.05fr_minmax(420px,480px)] lg:gap-14">
      {/* ברכה והוראות (מסכים רחבים) */}
      <section className="hidden select-none flex-col items-start gap-8 lg:flex">
        <div className="flex items-center gap-6">
          <TorahLogo size="hero" />
          <div>
            <p className="mb-1 text-sm font-bold tracking-[0.2em] text-gold-300/80">
              ברוכים הבאים
            </p>
            <h2 className="font-serif text-6xl font-black leading-[1.05] text-gold-gradient">
              {config.kioskTitle}
            </h2>
            <p className="mt-2 text-lg font-medium text-slate-300">{config.kioskSubtitle}</p>
          </div>
        </div>

        <ol className="grid w-full gap-3">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="panel flex items-center gap-4 !rounded-2xl p-4"
              style={on("stagger") ? { animation: `fade-up .6s ${0.15 + i * 0.12}s both` } : undefined}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 text-navy-900 shadow-lg shadow-gold-500/20">
                <s.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-base font-bold text-white">
                  <span className="font-mono text-gold-400">{i + 1}.</span>
                  {s.title}
                </div>
                <div className="text-sm text-slate-400">{s.text}</div>
              </div>
              {i === 2 && <Usb className="h-5 w-5 text-emerald-400/80" />}
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-2 text-sm text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          המסך מתאפס אוטומטית לאחר {config.autoLogoutSeconds} שניות ללא פעילות
        </div>
      </section>

      {/* כרטיס הקלדה */}
      <section className="panel beam mx-auto w-full max-w-[480px] p-5 sm:p-6">
        <div className="mb-4 flex flex-col items-center border-b border-white/10 pb-4 text-center">
          <div className="mb-2 lg:hidden">
            <TorahLogo size="md" />
          </div>
          <h2 className="font-serif text-3xl font-black tracking-tight text-white">
            הקש תעודת זהות
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-400">
            הזן 9 ספרות לפתיחה אוטומטית של התיקייה
          </p>
        </div>

        <div className="mb-4">
          <div className="relative">
            {/* שדה נסתר: מחזיק את הפוקוס במסמך ומאפשר הדבקה / קוראי כרטיסים */}
            <input
              ref={hiddenInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-label="מספר תעודת זהות"
              value={value}
              maxLength={ID_LENGTH}
              readOnly={isLoading}
              onChange={(e) => handleHiddenInput(e.target.value)}
              className={`${ID_INPUT_CLASS} absolute inset-0 z-10 h-full w-full cursor-default opacity-0`}
              style={{ caretColor: "transparent" }}
            />
            <SegmentedIdInput value={value} isLoading={isLoading} maxLength={ID_LENGTH} />
          </div>

          {errorMessage && (
            <div
              key={errorMessage}
              role="alert"
              className="shake mt-3 flex flex-col gap-2.5 rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
                <span className="font-medium leading-snug">{errorMessage}</span>
              </div>
              {showRegistration && (
                <FxButton
                  variant="ghost"
                  onClick={() => onOpenRegistration?.(valueRef.current)}
                  className="h-10 self-start !border-red-300/40 !bg-white/[0.07] px-3 text-xs text-red-50 hover:!bg-white/[0.14]"
                >
                  <UserPlus className="h-4 w-4 text-red-200" />
                  לא רשום עדיין בישיבה? לחץ כאן לרישום תלמיד
                </FxButton>
              )}
            </div>
          )}
        </div>

        <NumericKeypad
          onDigit={addDigit}
          onBackspace={backspace}
          onClear={clear}
          onSubmit={submit}
          disabled={isLoading}
        />

        {showRegistration && (
          <div className="mt-4 border-t border-white/10 pt-3.5">
            <FxButton
              variant="ghost"
              onClick={() => onOpenRegistration?.(valueRef.current)}
              className="group h-12 w-full text-sm hover:!border-emerald-400/50 hover:!bg-emerald-400/10"
            >
              <UserPlus className="h-[18px] w-[18px] text-emerald-300 transition-transform group-hover:scale-110" />
              רישום תלמיד חדש בגיליון הישיבה
            </FxButton>
          </div>
        )}
      </section>
    </div>
  );
}
