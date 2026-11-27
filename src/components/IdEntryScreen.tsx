"use client";

import { useState } from "react";
import { AlertCircle, UserRound } from "lucide-react";
import type { KioskConfig } from "@/lib/types";
import { playSound } from "@/lib/client/sound";
import { TorahLogo } from "./TorahLogo";

export const ID_INPUT_CLASS = "kiosk-id-hidden-input";

export function IdEntryScreen({
  config,
  onSearch,
  isLoading,
  errorMessage,
  onClearError,
}: {
  config: KioskConfig;
  onSearch: (name: string) => Promise<boolean>;
  isLoading: boolean;
  errorMessage: string | null;
  onClearError: () => void;
  keyboardEnabled: boolean;
  onOpenRegistration?: (currentName: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const submit = async () => {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last || isLoading) return;
    if (errorMessage) onClearError();
    const ok = await onSearch(first + " " + last);
    if (!ok) playSound("error");
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-8 px-4 py-4 lg:grid-cols-[1.05fr_minmax(420px,480px)] lg:gap-14">
      <section className="hidden select-none flex-col items-start gap-8 lg:flex">
        <div className="flex items-center gap-6">
          <TorahLogo size="hero" />
          <div>
            <p className="mb-1 text-sm font-bold tracking-[0.2em] text-gold-300/80">ברוכים הבאים</p>
            <h2 className="font-serif text-6xl font-black leading-[1.05] text-gold-gradient">{config.kioskTitle}</h2>
            <p className="mt-2 text-lg font-medium text-slate-300">{config.kioskSubtitle}</p>
          </div>
        </div>
        <div className="panel rounded-2xl p-5 text-slate-300">
          <p className="text-lg font-bold text-white">כניסה באמצעות שם</p>
          <p className="mt-2 text-sm">הזן את השם הפרטי ושם המשפחה כפי שהם מופיעים בגיליון הרישום.</p>
        </div>
      </section>

      <section className="panel beam mx-auto w-full max-w-[480px] p-5 sm:p-6">
        <div className="mb-5 flex flex-col items-center border-b border-white/10 pb-4 text-center">
          <div className="mb-2 lg:hidden"><TorahLogo size="md" /></div>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-gold-400/15 text-gold-300">
            <UserRound className="h-6 w-6" />
          </div>
          <h2 className="font-serif text-3xl font-black tracking-tight text-white">הזן את שמך</h2>
          <p className="mt-1 text-sm font-medium text-slate-400">הכניסה מתבצעת לפי השם המלא הרשום בגיליון</p>
        </div>

        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label className="block text-sm font-semibold text-slate-200">
            שם פרטי
            <input
              autoFocus
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              disabled={isLoading}
              placeholder="הקלד שם פרטי"
              className="mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-slate-950/60 px-4 text-lg text-white outline-none transition focus:border-gold-400"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-200">
            שם משפחה
            <input
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              disabled={isLoading}
              placeholder="הקלד שם משפחה"
              className="mt-1.5 h-12 w-full rounded-xl border border-white/15 bg-slate-950/60 px-4 text-lg text-white outline-none transition focus:border-gold-400"
            />
          </label>

          {errorMessage && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !firstName.trim() || !lastName.trim()}
            className="h-12 w-full rounded-xl bg-gradient-to-r from-gold-300 to-gold-500 px-5 font-bold text-slate-950 shadow-lg shadow-gold-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "מחפש..." : "כניסה לתיקייה"}
          </button>
        </form>
      </section>
    </div>
  );
}
