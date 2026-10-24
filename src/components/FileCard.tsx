"use client";

import { CheckCircle2, FileText, Loader2, Printer, Usb } from "lucide-react";
import { motion } from "motion/react";
import type { KioskFile } from "@/lib/types";
import { useFx } from "@/lib/client/fx";
import { DocPreview } from "./DocPreview";
import { FxButton } from "./FxButton";
import { Tilt } from "./Tilt";

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(s?: string) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function FileCard({
  file,
  index,
  driveLabel,
  isPrinting,
  isCopying,
  isCopied,
  isPrinted,
  onPrint,
  onCopy,
}: {
  file: KioskFile;
  index: number;
  driveLabel: string;
  isPrinting: boolean;
  isCopying: boolean;
  isCopied: boolean;
  isPrinted: boolean;
  onPrint: (f: KioskFile) => void;
  onCopy: (f: KioskFile) => void;
}) {
  const { on } = useFx();
  const stagger = on("stagger");
  const ext = file.name.toLowerCase().endsWith(".doc") ? "DOC" : "DOCX";
  const title = file.name.replace(/\.(docx?|DOCX?)$/, "");

  return (
    <Tilt className="h-full rounded-3xl">
      <motion.article
        className="panel flex h-full select-none flex-col p-4"
        initial={stagger ? { opacity: 0, y: 28, scale: 0.95 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={
          stagger
            ? { delay: Math.min(index, 10) * 0.08, type: "spring", stiffness: 220, damping: 22 }
            : { duration: 0 }
        }
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-300/20 bg-sky-400/10 text-sky-300">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-white" title={file.name}>
              {title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-400">
              <span className="rounded bg-white/10 px-1.5 py-px font-mono text-[10px] text-slate-300">{ext}</span>
              {file.size ? <span>{formatSize(file.size)}</span> : null}
              {file.modifiedTime ? <span>· עודכן {formatDate(file.modifiedTime)}</span> : null}
            </div>
          </div>
        </div>

        <div
          className="relative mb-3.5 h-64 w-full overflow-hidden rounded-xl ring-1 ring-white/10"
          aria-label={`תצוגה מקדימה של ${title}`}
        >
          <DocPreview fileId={file.id} />
          <div className="absolute left-2 top-2 z-10 flex flex-col gap-1.5">
            {isCopied && (
              <span className="flex items-center gap-1 rounded-lg border border-emerald-300/50 bg-emerald-500/90 px-2 py-0.5 text-[11px] font-bold text-white shadow-lg">
                <CheckCircle2 className="h-3.5 w-3.5" />
                הועתק
              </span>
            )}
            {isPrinted && (
              <span className="flex items-center gap-1 rounded-lg border border-sky-300/50 bg-sky-500/90 px-2 py-0.5 text-[11px] font-bold text-white shadow-lg">
                <CheckCircle2 className="h-3.5 w-3.5" />
                הודפס
              </span>
            )}
          </div>
        </div>

        <div className="mt-auto grid grid-cols-[1fr_1.45fr] gap-2.5">
          <FxButton
            variant={isPrinted ? "doneBlue" : "navy"}
            disabled={isPrinting}
            onClick={() => onPrint(file)}
            className="h-12 px-2 text-[13px] leading-tight"
          >
            {isPrinting ? (
              <Loader2 className="keep-anim h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 shrink-0" />
            )}
            <span>{isPrinting ? "שולח..." : isPrinted ? "הדפס שוב" : "הדפסה"}</span>
          </FxButton>

          <FxButton
            variant={isCopied ? "done" : "emerald"}
            disabled={isCopying}
            onClick={() => onCopy(file)}
            className="h-12 px-2 text-[13px] leading-tight"
            title={`העתק לדיסק און קי (כונן ${driveLabel}:)`}
          >
            {isCopying ? (
              <Loader2 className="keep-anim h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Usb className="h-4 w-4 shrink-0" />
            )}
            <span>
              {isCopying ? "מעתיק..." : isCopied ? "הועתק" : "העתק לדיסק און קי"}
            </span>
          </FxButton>
        </div>
      </motion.article>
    </Tilt>
  );
}
