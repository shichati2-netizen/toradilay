"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, FolderOpen, Loader2, LogOut, Timer, Usb, Database } from "lucide-react";
import type { KioskFile, KioskFolder } from "@/lib/types";
import { useFx } from "@/lib/client/fx";
import { FileCard } from "./FileCard";
import { FxButton } from "./FxButton";

function CountdownRing({ timeLeft, total }: { timeLeft: number; total: number }) {
  const { on } = useFx();
  const R = 18;
  const C = 2 * Math.PI * R;
  const ratio = Math.max(0, Math.min(1, timeLeft / total));
  const urgent = timeLeft <= 10;

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] py-1.5 pe-4 ps-2">
      {on("countdownRing") ? (
        <div className="relative h-11 w-11">
          <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
            <circle cx="22" cy="22" r={R} fill="none" strokeWidth="3.5" className="ring-track" />
            <circle
              cx="22"
              cy="22"
              r={R}
              fill="none"
              strokeWidth="3.5"
              className="ring-bar"
              style={{
                strokeDasharray: C,
                strokeDashoffset: C * (1 - ratio),
                stroke: urgent ? "#f87171" : undefined,
              }}
            />
          </svg>
          <span
            className={`absolute inset-0 flex items-center justify-center font-mono text-sm font-bold ${
              urgent ? "text-red-300" : "text-white"
            }`}
          >
            {timeLeft}
          </span>
        </div>
      ) : (
        <Timer className="ms-2 h-4 w-4 text-gold-400" />
      )}
      <div className="text-xs leading-tight text-slate-300">
        <div className="font-bold text-white">איפוס אוטומטי</div>
        <div>
          בעוד <span className="font-mono font-bold">{timeLeft}</span> שניות
        </div>
      </div>
    </div>
  );
}

export function StudentFilesScreen({
  folder,
  files,
  source,
  autoLogoutSeconds,
  targetPath,
  targetDriveLetter,
  busy,
  printingFileId,
  copyingFileId,
  copiedFileIds,
  printedFileIds,
  isCopyingAll,
  onBack,
  onPrint,
  onCopy,
  onCopyAll,
}: {
  folder: KioskFolder;
  files: KioskFile[];
  source?: "drive" | "local";
  autoLogoutSeconds: number;
  targetPath: string;
  targetDriveLetter: string;
  /** כשיש פעולה פעילה (הדפסה, העתקה, תצוגה) — לא מבצעים איפוס אוטומטי */
  busy: boolean;
  printingFileId: string | null;
  copyingFileId: string | null;
  copiedFileIds: Set<string>;
  printedFileIds: Set<string>;
  isCopyingAll: boolean;
  onBack: () => void;
  onPrint: (f: KioskFile) => void;
  onCopy: (f: KioskFile) => void;
  onCopyAll: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(autoLogoutSeconds);
  const deadline = useRef(0);
  const busyRef = useRef(busy);
  const backRef = useRef(onBack);

  useEffect(() => {
    busyRef.current = busy;
    backRef.current = onBack;
  });

  useEffect(() => {
    const bump = () => {
      deadline.current = Date.now() + autoLogoutSeconds * 1000;
    };
    bump();

    const tick = window.setInterval(() => {
      if (busyRef.current) bump();
      const left = Math.ceil((deadline.current - Date.now()) / 1000);
      if (left <= 0) {
        window.clearInterval(tick);
        backRef.current();
        return;
      }
      setTimeLeft(left);
    }, 250);

    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    window.addEventListener("scroll", bump, { passive: true, capture: true });

    return () => {
      window.clearInterval(tick);
      events.forEach((ev) => window.removeEventListener(ev, bump));
      window.removeEventListener("scroll", bump, true);
    };
  }, [autoLogoutSeconds]);

  const wordFiles = files.filter((f) => f.isWordDoc);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 select-none flex-col gap-5 p-5">
      {/* פס עליון */}
      <div className="panel flex flex-wrap items-center justify-between gap-4 !rounded-2xl p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-300 to-gold-600 text-navy-900 shadow-lg shadow-gold-500/25">
            <FolderOpen className="h-7 w-7" />
          </div>
          <div>
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-2xl font-black text-white">
              <span className="text-lg font-bold text-slate-300">תעודת זהות:</span>
              <span className="font-mono tracking-wider text-gold-gradient">{folder.name}</span>
            </h2>
            <p className="mt-0.5 flex items-center gap-2 text-sm font-medium text-slate-400">
              נמצאו {wordFiles.length} קבצי מסמכים
              {source === "local" && (
                <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                  <Database className="h-3 w-3" />
                  מכונן מקומי
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {wordFiles.length > 1 && (
            <FxButton
              variant="emerald"
              onClick={onCopyAll}
              disabled={isCopyingAll}
              className="h-12 px-4 text-sm"
              title={`העתקת כל המסמכים אל ${targetPath}`}
            >
              {isCopyingAll ? (
                <Loader2 className="keep-anim h-4 w-4 animate-spin" />
              ) : (
                <Usb className="h-4 w-4" />
              )}
              <span>העתק הכל לדיסק און קי</span>
              <span className="hidden font-mono text-[11px] opacity-80 xl:inline" dir="ltr">
                ({targetDriveLetter}:)
              </span>
            </FxButton>
          )}

          <CountdownRing timeLeft={timeLeft} total={autoLogoutSeconds} />

          <FxButton variant="ghost" onClick={onBack} className="h-12 px-5 text-sm">
            <LogOut className="h-4 w-4" />
            <span>סיום ויציאה</span>
          </FxButton>
        </div>
      </div>

      {wordFiles.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {wordFiles.map((file, i) => (
            <FileCard
              key={file.id}
              file={file}
              index={i}
              driveLabel={targetDriveLetter}
              isPrinting={printingFileId === file.id}
              isCopying={copyingFileId === file.id}
              isCopied={copiedFileIds.has(file.id)}
              isPrinted={printedFileIds.has(file.id)}
              onPrint={onPrint}
              onCopy={onCopy}
            />
          ))}
        </div>
      ) : (
        <div className="panel mx-auto my-auto w-full max-w-md p-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-slate-300">
            <FileText className="h-8 w-8" />
          </div>
          <h3 className="mb-1 font-serif text-xl font-bold text-white">לא נמצאו קבצים בתיקייה</h3>
          <p className="mb-6 text-sm text-slate-400">
            התיקייה קיימת אך אינה מכילה קבצי Word (‎.docx / .doc) עבור תעודת זהות זו.
          </p>
          <FxButton variant="gold" onClick={onBack} className="h-12 px-6 text-sm">
            חזרה להקלדת תעודת זהות
          </FxButton>
        </div>
      )}
    </div>
  );
}
