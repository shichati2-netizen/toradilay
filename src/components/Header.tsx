"use client";

import { useEffect, useState } from "react";
import { Clock, Fingerprint, FolderCheck, Usb } from "lucide-react";
import type { KioskConfig } from "@/lib/types";
import { TorahLogo } from "./TorahLogo";
import { FxButton } from "./FxButton";
import { PathLabel } from "./PathLabel";

export function Header({
  config,
  onOpenRegistration,
}: {
  config: KioskConfig;
  onOpenRegistration?: () => void;
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
    </header>
  );
}
