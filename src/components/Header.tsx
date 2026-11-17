"use client";

import { useEffect, useState } from "react";
import { Clock, Fingerprint, FolderCheck, Usb, Globe2, ExternalLink, X } from "lucide-react";
import type { KioskConfig } from "@/lib/types";
import { TorahLogo } from "./TorahLogo";
import { FxButton } from "./FxButton";
import { PathLabel } from "./PathLabel";

export function Header({
  config,
  onOpenRegistration,
  onTogglePortal,
  portalOpen = false,
}: {
  config: KioskConfig;
  onOpenRegistration?: () => void;
  onTogglePortal?: () => void;
  portalOpen?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now
    ? now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";
  const dateStr = now
    ? now.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })
    : "";

  return (
    <header className="relative z-30 shrink-0 select-none">
      <div className="flex items-center justify-between gap-4 bg-navy-950/60 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <TorahLogo size="sm" />
          <div className="leading-tight">
            <h1 className="font-serif text-2xl font-black tracking-tight text-gold-gradient">
              {config.kioskTitle}
            </h1>
            <p className="text-xs font-medium text-gold-200/80">{config.kioskSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2 text-slate-200 md:flex">
            <Clock className="h-4 w-4 text-gold-400" />
            <span className="text-slate-400">{dateStr}</span>
            <span className="font-mono text-sm font-semibold tracking-wide text-white" dir="ltr">
              {timeStr}
            </span>
          </div>

          <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2 text-slate-300 lg:flex">
            {config.autoDetectRemovableDrive ? (
              <>
                <Usb className="h-4 w-4 text-emerald-400" />
                <span>
                  יעד קבצים:{" "}
                  <strong className="font-semibold text-emerald-300">
                    דיסק און קי אוטומטי ({config.targetFolderName})
                  </strong>
                </span>
              </>
            ) : (
              <>
                <FolderCheck className="h-4 w-4 text-emerald-400" />
                <span>
                  יעד קבצים:{" "}
                  <strong className="font-mono text-white">
                    <PathLabel drive={config.targetDriveLetter} folder={config.targetFolderName} />
                  </strong>
                </span>
              </>
            )}
          </div>

          {onTogglePortal && (
            <FxButton
              variant="ghost"
              onClick={onTogglePortal}
              className="h-10 px-4 text-xs"
              title="פתיחת פורטל הקישורים בתוך התוכנה"
              aria-expanded={portalOpen}
            >
              <Globe2 className="h-4 w-4" />
              <span>פורטל קישורים</span>
            </FxButton>
          )}

          {onOpenRegistration && (
            <FxButton
              variant="emerald"
              onClick={onOpenRegistration}
              className="h-10 px-4 text-xs"
              title="חיפוש קוד אישי לפי תעודת זהות ושם"
            >
              <Fingerprint className="h-4 w-4" />
              <span>חיפוש קוד אישי</span>
            </FxButton>
          )}
        </div>
      </div>
      <div className="h-[2px] w-full bg-gradient-to-l from-transparent via-gold-500 to-transparent opacity-80" />
      {portalOpen && (
        <section
          role="dialog"
          aria-label="פורטל קישורים"
          className="absolute left-5 right-5 top-full z-[80] mt-3 rounded-3xl border border-white/15 bg-[#0b1730]/[0.98] p-5 shadow-2xl shadow-black/50 backdrop-blur-2xl"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">פורטל קישורים</h2>
              <p className="mt-1 text-xs text-slate-400">האתרים נפתחים בחלון פנימי של ToraDelia</p>
            </div>
            <button
              type="button"
              onClick={onTogglePortal}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              aria-label="סגירת הפורטל"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[
              { title: "נדרים פלוס – מוסד 7005288", url: "https://www.matara.pro/nedarimplus/online/?mosad=7005288", detail: "כניסה למערכת המקוונת" },
              { title: "נדרים פלוס – מוסד 7005954", url: "https://matara.pro/nedarimplus/online/?mosad=7005954", detail: "כניסה למערכת המקוונת" },
              { title: "טופס 976", url: "https://www.matara.pro/nedarimplus/Forms/976.html?MasofId=&ClientId=&Zeout=&Version=8", detail: "פתיחת טופס" },
              { title: "מוקירים 14", url: "https://www.matara.pro/nedarimplus/v6/Mokirim14.html?Version=1", detail: "פתיחת מערכת מוקירים" },
              { title: "רישומון – שיח התורה", url: "https://rishumon.net/SiachAtorah.html", detail: "מערכת רישום" },
              { title: "מערכת תורה", url: "https://tora.irom.co.il/?Version=17", detail: "פתיחת מערכת תורה" },
              { title: "טופס 4488", url: "https://www.matara.pro/nedarimplus/Forms/4488.html?MasofId=&ClientId=&Zeout=&Version=1", detail: "פתיחת טופס" },
            ].map((item) => (
              <a
                key={item.url}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 transition hover:-translate-y-0.5 hover:border-gold-400/40 hover:bg-white/[0.09]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-100 group-hover:text-gold-200">{item.title}</span>
                  <span className="mt-1 block text-xs text-slate-400">{item.detail}</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-gold-300/80" />
              </a>
            ))}
          </div>
        </section>
      )}
    </header>
  );
}
