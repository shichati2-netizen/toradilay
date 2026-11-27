"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, CheckCircle2, Clock, Download, FileText, Folder, FolderOpen, Loader2,
  LogOut, Mic, PenLine, Timer, Usb, Database, Printer
} from "lucide-react";
import type { KioskFile, KioskFolder, TranscriptionDriveFile } from "@/lib/types";
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
            <circle cx="22" cy="22" r={R} fill="none" strokeWidth="3.5" className="ring-bar"
              style={{ strokeDasharray: C, strokeDashoffset: C * (1 - ratio), stroke: urgent ? "#f87171" : undefined }} />
          </svg>
          <span className={"absolute inset-0 flex items-center justify-center font-mono text-sm font-bold " + (urgent ? "text-red-300" : "text-white")}>{timeLeft}</span>
        </div>
      ) : <Timer className="ms-2 h-4 w-4 text-gold-400" />}
      <div className="text-xs leading-tight text-slate-300">
        <div className="font-bold text-white">איפוס אוטומטי</div>
        <div>בעוד <span className="font-mono font-bold">{timeLeft}</span> שניות</div>
      </div>
    </div>
  );
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function StudentFilesScreen({
  folder,
  studentId,
  studentName,
  files,
  source,
  handwritingFiles,
  handwritingAccessAllowed,
  handwritingLoading,
  handwritingError,
  pendingTranscriptions,
  onTranscription,
  onOpenHandwriting,
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
  onPrintHandwriting,
  onCopyHandwriting,
  handwritingPrintingId,
  handwritingCopyingId,
  handwritingCopiedIds,
}: {
  folder: KioskFolder;
  studentId: string;
  studentName: string;
  files: KioskFile[];
  source?: "drive" | "local";
  handwritingFiles: TranscriptionDriveFile[];
  handwritingAccessAllowed: boolean;
  handwritingLoading: boolean;
  handwritingError: string | null;
  pendingTranscriptions: number;
  onTranscription: () => void;
  onOpenHandwriting: () => void;
  autoLogoutSeconds: number;
  targetPath: string;
  targetDriveLetter: string;
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
  onPrintHandwriting: (file: TranscriptionDriveFile) => void;
  onCopyHandwriting: (file: TranscriptionDriveFile) => void;
  handwritingPrintingId: string | null;
  handwritingCopyingId: string | null;
  handwritingCopiedIds: Set<string>;
}) {
  const [timeLeft, setTimeLeft] = useState(autoLogoutSeconds);
  const [activeFolder, setActiveFolder] = useState<"folders" | "audio" | "handwriting">(handwritingAccessAllowed ? "folders" : "audio");
  useEffect(() => {
    setActiveFolder(handwritingAccessAllowed ? "folders" : "audio");
  }, [studentId, handwritingAccessAllowed]);
  const deadline = useRef(0);
  const busyRef = useRef(busy);
  const backRef = useRef(onBack);

  useEffect(() => {
    busyRef.current = busy;
    backRef.current = onBack;
  });

  useEffect(() => {
    const bump = () => { deadline.current = Date.now() + autoLogoutSeconds * 1000; };
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

  const documentFiles = files.filter((file) =>
    file.isWordDoc || file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name),
  );
  const isPdfFile = (file: KioskFile) =>
    file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name);
  const audioPdfUrl = (fileId: string, inline = false) =>
    "/api/drive/download?fileId=" + encodeURIComponent(fileId) + (inline ? "&inline=1" : "");
  const handwritingUrl = (fileId: string, download = false) =>
    "/api/transcription/handwriting-file?studentId=" + encodeURIComponent(studentId) +
    "&fileId=" + encodeURIComponent(fileId) + (download ? "&download=1" : "");

  const openHandwriting = () => {
    setActiveFolder("handwriting");
    onOpenHandwriting();
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 select-none flex-col gap-5 p-5">
      <div className="panel flex flex-wrap items-center justify-between gap-4 !rounded-2xl p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-300 to-gold-600 text-navy-900 shadow-lg shadow-gold-500/25">
            {activeFolder === "handwriting" ? <PenLine className="h-7 w-7" /> : activeFolder === "audio" ? <Mic className="h-7 w-7" /> : <FolderOpen className="h-7 w-7" />}
          </div>
          <div>
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-2xl font-black text-white">
              <span className="text-lg font-bold text-slate-300">שלום,</span>
              <span className="text-gold-gradient">{studentName || folder.name}</span>
            </h2>
            <p className="mt-0.5 flex items-center gap-2 text-sm font-medium text-slate-400">
              {activeFolder === "folders"
                ? "בחר תיקיית תמלול כדי להציג את הקבצים שבתוכה"
                : activeFolder === "audio"
                  ? "קובצי התמלול הקולי של החשבון · " + documentFiles.length + " מסמכים"
                  : "מסמכי Word וקובצי PDF של כתב היד · " + handwritingFiles.length + " קבצים"}
              {source === "local" && <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-200"><Database className="h-3 w-3" /> מכונן מקומי</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {handwritingAccessAllowed && activeFolder !== "folders" && (
            <FxButton variant="ghost" onClick={() => setActiveFolder("folders")} className="h-11 px-4 text-sm">
              <ArrowLeft className="h-4 w-4" /><span>חזרה לתיקיות</span>
            </FxButton>
          )}
          {activeFolder === "audio" && pendingTranscriptions > 0 && (
            <div className="flex h-10 items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-3 text-xs font-bold text-amber-100"><Clock className="h-4 w-4" /> {pendingTranscriptions} בתהליך תמלול</div>
          )}
          {activeFolder === "audio" && documentFiles.length > 1 && (
            <FxButton variant="emerald" onClick={onCopyAll} disabled={isCopyingAll} className="h-12 px-4 text-sm" title={"העתקת כל המסמכים אל " + targetPath}>
              {isCopyingAll ? <Loader2 className="keep-anim h-4 w-4 animate-spin" /> : <Usb className="h-4 w-4" />}
              <span>העתק הכל לדיסק און קי</span>
              <span className="hidden font-mono text-[11px] opacity-80 xl:inline" dir="ltr">({targetDriveLetter}:)</span>
            </FxButton>
          )}
          <CountdownRing timeLeft={timeLeft} total={autoLogoutSeconds} />
          <FxButton variant="ghost" onClick={onBack} className="h-12 px-5 text-sm"><LogOut className="h-4 w-4" /><span>סיום ויציאה</span></FxButton>
        </div>
      </div>

      {activeFolder === "folders" ? (
        <div className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2">
          <button type="button" onClick={() => setActiveFolder("audio")} className="panel group flex min-h-48 items-center gap-5 rounded-3xl p-6 text-right transition hover:-translate-y-1 hover:border-sky-300/40 hover:bg-sky-300/[0.06]">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-sky-300/20 bg-sky-400/10 text-sky-300"><Folder className="h-10 w-10 transition group-hover:scale-110" /></div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-black text-white">תמלול קולי</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">המסמכים שהתקבלו עבור החשבון מתהליך התמלול הקולי</p>
              <p className="mt-3 text-xs font-bold text-sky-200">{documentFiles.length} קבצים</p>
            </div>
            <ArrowLeft className="h-5 w-5 shrink-0 text-slate-500 transition group-hover:-translate-x-1 group-hover:text-sky-200" />
          </button>

          {handwritingAccessAllowed && <button type="button" onClick={openHandwriting} className="panel group flex min-h-48 items-center gap-5 rounded-3xl p-6 text-right transition hover:-translate-y-1 hover:border-rose-300/40 hover:bg-rose-300/[0.06]">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-400/10 text-rose-300"><Folder className="h-10 w-10 transition group-hover:scale-110" /></div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-black text-white">תמלול כתבי יד</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">מסמכי Word וקובצי PDF של התלמיד</p>
              <p className="mt-3 text-xs font-bold text-rose-200">{handwritingLoading ? "טוען..." : handwritingFiles.length + " קבצים"}</p>
            </div>
            {handwritingLoading ? <Loader2 className="h-5 w-5 animate-spin text-rose-200" /> : <ArrowLeft className="h-5 w-5 shrink-0 text-slate-500 transition group-hover:-translate-x-1 group-hover:text-rose-200" />}
          </button>}
        </div>
      ) : activeFolder === "audio" ? (
        documentFiles.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {documentFiles.map((file, index) => isPdfFile(file) ? (
              <article key={file.id} className="panel flex flex-col gap-3 rounded-3xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-400/10 text-rose-300"><FileText className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-bold text-white">{file.name}</h3>
                    <p className="mt-1 text-[11px] text-slate-400">PDF{file.size ? " · " + formatSize(file.size) : ""}</p>
                  </div>
                </div>
                <iframe title={"תצוגה מקדימה: " + file.name} src={audioPdfUrl(file.id, true)} className="h-72 w-full rounded-xl border border-white/10 bg-white" />
                <div className="flex gap-2">
                  <a href={audioPdfUrl(file.id, true)} target="_blank" rel="noreferrer" className="flex h-10 flex-1 items-center justify-center rounded-xl bg-white/10 px-3 text-sm font-bold text-white hover:bg-white/15">פתיחת PDF</a>
                  <a href={audioPdfUrl(file.id, false) + "&name=" + encodeURIComponent(file.name)} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-400/15 px-3 text-sm font-bold text-sky-100 hover:bg-sky-400/25"><Download className="h-4 w-4" /> הורדה</a>
                </div>
                <div className="grid grid-cols-[1fr_1.45fr] gap-2.5">
                  <FxButton
                    variant={printedFileIds.has(file.id) ? "doneBlue" : "navy"}
                    disabled={printingFileId === file.id}
                    onClick={() => onPrint(file)}
                    className="h-12 px-2 text-[13px] leading-tight"
                  >
                    {printingFileId === file.id ? <Loader2 className="keep-anim h-4 w-4 shrink-0 animate-spin" /> : <Printer className="h-4 w-4 shrink-0" />}
                    <span>{printingFileId === file.id ? "שולח..." : printedFileIds.has(file.id) ? "הדפס שוב" : "הדפסה"}</span>
                  </FxButton>
                  <FxButton
                    variant={copiedFileIds.has(file.id) ? "done" : "emerald"}
                    disabled={copyingFileId === file.id}
                    onClick={() => onCopy(file)}
                    className="h-12 px-2 text-[13px] leading-tight"
                    title={`העתק לדיסק און קי (כונן ${targetDriveLetter}:)`}
                  >
                    {copyingFileId === file.id ? <Loader2 className="keep-anim h-4 w-4 shrink-0 animate-spin" /> : <Usb className="h-4 w-4 shrink-0" />}
                    <span>{copyingFileId === file.id ? "מעתיק..." : copiedFileIds.has(file.id) ? "הועתק" : "העתק ל-USB"}</span>
                  </FxButton>
                </div>
              </article>
            ) : (
              <FileCard key={file.id} file={file} index={index} driveLabel={targetDriveLetter}
                isPrinting={printingFileId === file.id} isCopying={copyingFileId === file.id}
                isCopied={copiedFileIds.has(file.id)} isPrinted={printedFileIds.has(file.id)}
                onPrint={onPrint} onCopy={onCopy} />
            ))}
          </div>
        ) : (
          <div className="panel mx-auto my-auto w-full max-w-md p-10 text-center">
            <FileText className="mx-auto mb-4 h-10 w-10 text-slate-400" />
            <h3 className="mb-1 font-serif text-xl font-bold text-white">תיקיית התמלול הקולי ריקה</h3>
            <p className="text-sm text-slate-400">כאשר יתקבל תמלול קולי, המסמך יופיע כאן.</p>
          </div>
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
          {handwritingLoading ? (
            <div className="panel flex min-h-48 items-center justify-center gap-3 text-sm text-slate-300"><Loader2 className="h-5 w-5 animate-spin" /> טוען את קובצי כתב היד...</div>
          ) : handwritingError ? (
            <div className="panel mx-auto my-auto w-full max-w-xl p-8 text-center"><PenLine className="mx-auto mb-3 h-9 w-9 text-rose-300" /><p className="text-sm leading-relaxed text-rose-100">{handwritingError}</p></div>
          ) : handwritingFiles.length ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {handwritingFiles.map((file) => {
                const isPdf = file.mimeType === "application/pdf" || /\.pdf$/i.test(file.name);
                const ext = (file.name.match(/\.([^.]+)$/)?.[1] || (isPdf ? "pdf" : "docx")).toUpperCase();
                const title = file.name.replace(/\.[^.]+$/, "");
                // PDF מוצג ישירות בדפדפן מהקובץ המקורי. כך נמנעת המרת PDF בשרת
                // שעלולה להיכשל בזמן יצירת תמונה/תצוגת טקסט; Word נשאר בתצוגת הטקסט.
                const previewUrl = isPdf
                  ? handwritingUrl(file.id)
                  : "/api/transcription/handwriting-preview?studentId=" + encodeURIComponent(studentId) + "&fileId=" + encodeURIComponent(file.id);
                return (
                  <article key={file.id} className="panel flex h-full select-none flex-col rounded-3xl p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border " + (isPdf ? "border-rose-300/20 bg-rose-400/10 text-rose-300" : "border-sky-300/20 bg-sky-400/10 text-sky-300")}>
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-white" title={file.name}>{title}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-400">
                          <span className={"rounded px-1.5 py-px font-mono text-[10px] " + (isPdf ? "bg-rose-400/15 text-rose-200" : "bg-sky-400/15 text-sky-200")}>{ext}</span>
                          {file.size ? <span>{formatSize(file.size)}</span> : null}
                          {file.modifiedTime ? <span>· עודכן {new Date(file.modifiedTime).toLocaleDateString("he-IL")}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="relative mb-3.5 h-64 w-full overflow-hidden rounded-xl bg-white ring-1 ring-white/10" aria-label={"תצוגה מקדימה של " + title}>
                      <iframe title={"תצוגה מקדימה: " + file.name} src={previewUrl} scrolling="no" className="h-full w-full border-0 bg-white" />
                      <div className="absolute left-2 top-2 z-10 flex flex-col gap-1.5">
                        {handwritingCopiedIds.has(file.id) && <span className="flex items-center gap-1 rounded-lg border border-emerald-300/50 bg-emerald-500/90 px-2 py-0.5 text-[11px] font-bold text-white shadow-lg"><CheckCircle2 className="h-3.5 w-3.5" /> הועתק</span>}
                      </div>
                    </div>
                    <div className="mt-auto grid grid-cols-[1fr_1.45fr] gap-2.5">
                      <FxButton variant="navy" disabled={handwritingPrintingId === file.id} onClick={() => onPrintHandwriting(file)} className="h-12 px-2 text-[13px] leading-tight">
                        {handwritingPrintingId === file.id ? <Loader2 className="keep-anim h-4 w-4 shrink-0 animate-spin" /> : <Printer className="h-4 w-4 shrink-0" />}
                        <span>{handwritingPrintingId === file.id ? "שולח..." : "הדפסה"}</span>
                      </FxButton>
                      <FxButton variant={handwritingCopiedIds.has(file.id) ? "done" : "emerald"} disabled={handwritingCopyingId === file.id} onClick={() => onCopyHandwriting(file)} className="h-12 px-2 text-[13px] leading-tight" title={"העתק לדיסק און קי (כונן " + targetDriveLetter + ":)"}>
                        {handwritingCopyingId === file.id ? <Loader2 className="keep-anim h-4 w-4 shrink-0 animate-spin" /> : <Usb className="h-4 w-4 shrink-0" />}
                        <span>{handwritingCopyingId === file.id ? "מעתיק..." : handwritingCopiedIds.has(file.id) ? "הועתק" : "העתק לדיסק און קי"}</span>
                      </FxButton>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="panel mx-auto my-auto w-full max-w-md p-10 text-center">
              <FileText className="mx-auto mb-4 h-10 w-10 text-slate-400" />
              <h3 className="mb-1 font-serif text-xl font-bold text-white">לא נמצאו מסמכי Word או PDF בכתב היד</h3>
              <p className="text-sm text-slate-400">כאשר יועלו מסמכי Word או PDF לתיקיית התלמיד ב-Google Drive, הם יופיעו כאן.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
