"use client";

import type { CSSProperties } from "react";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import type { KioskConfig, KioskFile, KioskFolder, TranscriptionDriveFile } from "@/lib/types";
import { FxProvider, effectClasses, fireConfetti } from "@/lib/client/fx";
import { playSound } from "@/lib/client/sound";
import { applyLiquidGlassRefraction } from "@/lib/client/liquid-glass";
import { printHtmlDocument } from "@/lib/client/print";
import {
  copyFile,
  fetchPreview,
  logClientActivity,
  searchStudent,
  fetchTranscriptionStatus,
  fetchHandwritingFolderApi,
} from "@/lib/client/api";
import { Background } from "./Background";
import { ExitModal } from "./ExitModal";
import { FxButton } from "./FxButton";
import { Header } from "./Header";
import { IdEntryScreen } from "./IdEntryScreen";
import { PathLabel } from "./PathLabel";
import { RegistrationModal } from "./RegistrationModal";
import { StudentFilesScreen } from "./StudentFilesScreen";
import { TranscriptionDialog } from "./TranscriptionDialog";
import { HandwritingAssociationDialog } from "./HandwritingAssociationDialog";
import { TorahLogo } from "./TorahLogo";
import { Toasts, type ToastItem } from "./Toasts";
import { AdminPanel } from "./admin/AdminPanel";

function ScreenFrame({
  animated,
  children,
  id,
}: {
  animated: boolean;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <motion.div
      key={id}
      className="flex min-h-0 flex-1 flex-col"
      initial={animated ? { opacity: 0, y: 26, scale: 0.985 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={animated ? { opacity: 0, y: -18, scale: 0.99 } : { opacity: 0, transition: { duration: 0 } }}
      transition={{ duration: 0.38, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function KioskApp({ initialConfig }: { initialConfig: KioskConfig }) {
  const [config, setConfig] = useState<KioskConfig>(initialConfig);
  const [preview, setPreview] = useState<KioskConfig | null>(null);
  const active = preview ?? config;
  const effects = active.effects;
  const animated = effects.master && effects.pageTransitions;

  // Pause decorative work after a short period without user input.
  const [isIdle, setIsIdle] = useState(true);
  useEffect(() => {
    let idleTimer: number | null = null;

    const markActive = () => {
      setIsIdle(false);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setIsIdle(true), 8000);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (idleTimer !== null) window.clearTimeout(idleTimer);
        idleTimer = null;
        setIsIdle(true);
      } else {
        markActive();
      }
    };

    const activityEvents = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, markActive, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, markActive);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Send uncaught browser errors to the local diagnostic log (without credentials or student IDs).
  useEffect(() => {
    const report = (event: string, details: Record<string, unknown>) => {
      try {
        void fetch("/api/diagnostics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, details, page: window.location.pathname }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // Error reporting must never interfere with kiosk operation.
      }
    };

    const onError = (event: ErrorEvent) => {
      report("window.error", {
        message: event.message,
        filename: event.filename ? event.filename.split("?")[0] : undefined,
        line: event.lineno,
        column: event.colno,
        error: event.error instanceof Error
          ? { name: event.error.name, message: event.error.message, stack: event.error.stack }
          : undefined,
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report("window.unhandledrejection", {
        reason: reason instanceof Error
          ? { name: reason.name, message: reason.message, stack: reason.stack }
          : String(reason).slice(0, 4000),
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  // True optical refraction belongs on controls/navigation, not every content card.
  useEffect(() => {
    if (!effects.master || !effects.glass || effects.glassIntensity <= 0) return;
    const root = document.querySelector<HTMLElement>(".kiosk-root");
    if (!root) return;
    return applyLiquidGlassRefraction(root, effects.glassIntensity, effects.glassPrecision);
  }, [effects.master, effects.glass, effects.glassIntensity, effects.glassPrecision]);

  // מצב מסכים
  const [view, setView] = useState<"id-entry" | "student-files">("id-entry");
  const [folder, setFolder] = useState<KioskFolder | null>(null);
  const [files, setFiles] = useState<KioskFile[]>([]);
  const [source, setSource] = useState<"drive" | "local" | undefined>();
  const [studentId, setStudentId] = useState("");
  const [pendingTranscriptions, setPendingTranscriptions] = useState(0);
  const [transcriptionKind, setTranscriptionKind] = useState<"audio" | null>(null);
  const [handwritingAssociationOpen, setHandwritingAssociationOpen] = useState(false);
  const [handwritingFiles, setHandwritingFiles] = useState<TranscriptionDriveFile[]>([]);
  const [handwritingLoading, setHandwritingLoading] = useState(false);
  const [handwritingError, setHandwritingError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // חלונות
  const [adminOpen, setAdminOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isShutDown, setIsShutDown] = useState(false);

  // רישום תלמיד (Google Sheets)
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerInitialId, setRegisterInitialId] = useState("");

  // פעולות
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());
  const [printedIds, setPrintedIds] = useState<Set<string>>(new Set());
  const [isCopyingAll, setIsCopyingAll] = useState(false);

  const celebrate = useCallback(() => {
    if (effects.master && effects.confetti) fireConfetti();
  }, [effects.master, effects.confetti]);

  const addToast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* ------------------------------ חיפוש ------------------------------ */

  const handleSearch = useCallback(
    async (id: string): Promise<boolean> => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await searchStudent(id);
        if (!res.found || !res.folder) {
          setErrorMessage(
            res.message ||
              `לא נמצאה תיקייה עבור תעודת זהות "${id}". אנא בדוק את המספר שהוקלד.`,
          );
          return false;
        }
        const requests = await fetchTranscriptionStatus(id);
        setPendingTranscriptions(requests.filter((item) => item.status === "pending").length);
        setHandwritingFiles([]);
        setHandwritingError(null);
        setTranscriptionKind(null);
        setStudentId(id);
        setFolder(res.folder);
        setFiles(res.files ?? []);
        setSource(res.source);
        setCopiedIds(new Set());
        setPrintedIds(new Set());
        setView("student-files");
        playSound("found");
        return true;
      } catch {
        setErrorMessage("שגיאה במהלך החיפוש בדרייב. אנא נסה שוב.");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Poll Gmail/Apps Script while this student has outstanding transcription requests.
  useEffect(() => {
    if (
      view !== "student-files" ||
      !studentId ||
      pendingTranscriptions <= 0
    ) return;

    let cancelled = false;
    let checking = false;
    const poll = async () => {
      if (cancelled || checking) return;
      checking = true;
      try {
        const requests = await fetchTranscriptionStatus(studentId);
        if (!cancelled) {
          setPendingTranscriptions(requests.filter((item) => item.status === "pending").length);
        }
      } catch {
        // Keep the current pending badge during temporary network failures.
      } finally {
        checking = false;
      }
    };

    const timer = window.setInterval(() => { void poll(); }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [view, studentId, pendingTranscriptions]);


  const handleTranscription = useCallback(() => {
    setTranscriptionKind("audio");
  }, []);

  const handleOpenHandwriting = useCallback(async () => {
    setHandwritingLoading(true);
    setHandwritingError(null);
    try {
      const result = await fetchHandwritingFolderApi(studentId);
      if (result.needsAssociation) {
        setHandwritingAssociationOpen(true);
        return;
      }
      if (result.error) {
        setHandwritingError(result.error);
        return;
      }
      if (result.folderMissing) {
        setHandwritingFiles([]);
        setHandwritingError(result.message || "תיקיית כתב היד של התלמיד עדיין לא נמצאה.");
        return;
      }
      setHandwritingFiles(result.files ?? []);
    } catch {
      setHandwritingError("לא ניתן לטעון את תיקיית כתב היד.");
    } finally {
      setHandwritingLoading(false);
    }
  }, [studentId]);

  const handleHandwritingAssociationSaved = useCallback((result: {
    files?: TranscriptionDriveFile[];
    folderMissing?: boolean;
    message?: string;
  }) => {
    setHandwritingFiles(result.files ?? []);
    setHandwritingError(result.folderMissing ? (result.message || "תיקיית כתב היד עדיין לא נמצאה.") : null);
  }, []);

  const handleBack = useCallback(() => {
    setView("id-entry");
    setFolder(null);
    setFiles([]);
    setPendingTranscriptions(0);
    setTranscriptionKind(null);
    setHandwritingAssociationOpen(false);
    setHandwritingFiles([]);
    setHandwritingError(null);
    setHandwritingLoading(false);
    setErrorMessage(null);
  }, []);

  /* ------------------------------ הדפסה ------------------------------ */

  const handlePrint = useCallback(
    async (file: KioskFile) => {
      setPrintingId(file.id);
      try {
        const { html } = await fetchPreview(file.id, "full");
        await printHtmlDocument(file.name, html);
        setPrintedIds((prev) => new Set(prev).add(file.id));
        logClientActivity({ type: "print", studentId, fileName: file.name });
        playSound("success");
        celebrate();
        addToast({
          type: "success",
          title: "ההדפסה נשלחה למדפסת",
          message: `המסמך "${file.name}" נשלח להדפסה`,
          actionType: "print",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "לא ניתן היה להדפיס את הקובץ";
        logClientActivity({ type: "print", studentId, fileName: file.name, success: false, detail: message });
        playSound("error");
        addToast({ type: "error", title: "שגיאה בהדפסה", message, actionType: "print" });
      } finally {
        setPrintingId(null);
      }
    },
    [addToast, celebrate, studentId],
  );

  /* ------------------------------ העתקה ------------------------------ */

  const handleCopy = useCallback(
    async (file: KioskFile) => {
      setCopyingId(file.id);
      try {
        const res = await copyFile(file, studentId);
        if (res.success) {
          setCopiedIds((prev) => new Set(prev).add(file.id));
          playSound("success");
          celebrate();
          addToast({ type: "success", title: "הקובץ הועתק בהצלחה", message: res.message, actionType: "copy" });
        } else {
          playSound("error");
          addToast({ type: "error", title: "שגיאה בהעתקה", message: res.message, actionType: "copy" });
        }
      } finally {
        setCopyingId(null);
      }
    },
    [addToast, celebrate, studentId],
  );

  const handleCopyAll = useCallback(async () => {
    const documentFiles = files.filter((f) => f.isWordDoc || f.mimeType === "application/pdf" || /\.pdf$/i.test(f.name));
    if (documentFiles.length === 0) return;
    setIsCopyingAll(true);
    let ok = 0;
    let lastMessage = "";
    for (const file of documentFiles) {
      const res = await copyFile(file, studentId);
      lastMessage = res.message;
      if (res.success) {
        ok++;
        setCopiedIds((prev) => new Set(prev).add(file.id));
        if (res.mode === "download") await new Promise((r) => setTimeout(r, 450));
      }
    }
    setIsCopyingAll(false);
    if (ok > 0) {
      playSound("success");
      celebrate();
    } else {
      playSound("error");
    }
    addToast({
      type: ok > 0 ? "success" : "error",
      title: "העתקה מרוכזת",
      message: ok > 0 ? `${ok} מתוך ${documentFiles.length} קבצים הועתקו בהצלחה` : lastMessage,
      actionType: "copy",
    });
  }, [addToast, celebrate, files, studentId]);

  /* ------------------------------ רישום ------------------------------ */

  const openRegistration = useCallback((prefillId = "") => {
    setRegisterInitialId(prefillId);
    setRegisterOpen(true);
  }, []);

  const closeRegistration = useCallback(() => {
    setRegisterOpen(false);
    setRegisterInitialId("");
    window.dispatchEvent(new Event("kiosk:refocus"));
  }, []);

  /* ------------------------------ יציאה ------------------------------ */

  const handleConfirmExit = useCallback(() => {
    setIsShuttingDown(true);
    logClientActivity({ type: "exit" });
    window.setTimeout(() => {
      setExitOpen(false);
      setIsShuttingDown(false);
      setAdminOpen(false);
      setIsShutDown(true);
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 900);
  }, []);

  const restart = () => {
    window.location.reload();
  };

  /* ------------------------------ ניהול ------------------------------ */

  const handleSaved = useCallback((c: KioskConfig) => {
    setConfig(c);
    setPreview(null);
  }, []);

  // קיצורי מקלדת לפתיחת הניהול: F8 או Ctrl+Alt+A.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        setAdminOpen(true);
        return;
      }
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setAdminOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // נעילת מסך מלא
  const lock = active.kioskLockFullscreen;
  useEffect(() => {
    if (!lock) return;
    const noMenu = (e: Event) => e.preventDefault();
    const goFull = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    document.addEventListener("contextmenu", noMenu);
    document.addEventListener("pointerdown", goFull, { once: true });
    return () => {
      document.removeEventListener("contextmenu", noMenu);
      document.removeEventListener("pointerdown", goFull);
    };
  }, [lock]);

  /* ------------------------------ תצוגה ------------------------------ */

  const targetPath = `${active.targetDriveLetter}:\\${active.targetFolderName}`;
  const glassRadius = 5 + (effects.glassShape / 100) * 19;
  const gel = effects.glassGel / 100;
  const busy =
    printingId !== null || copyingId !== null || isCopyingAll || adminOpen || transcriptionKind !== null || handwritingAssociationOpen || handwritingLoading;

  return (
    <FxProvider effects={effects}>
      <div
        className={`kiosk-root ${isIdle ? "is-idle" : ""} ${effectClasses(effects)} ${effects.glass && effects.glassIntensity > 0 ? "liquid-glass-motion" : ""} relative flex h-dvh flex-col overflow-hidden text-slate-100`}
        style={{
          "--kiosk-background-color": active.backgroundColor,
          "--liquid-glass-intensity": effects.glassIntensity / 100,
          "--liquid-glass-opacity": 1 - effects.glassTransparency / 100,
          "--liquid-glass-radius": `${glassRadius}px`,
          "--liquid-glass-radius-a": `${glassRadius * (1 + 0.15 * gel)}px ${glassRadius * (1 - 0.1 * gel)}px ${glassRadius * (1 + 0.05 * gel)}px ${glassRadius * (1 - 0.05 * gel)}px`,
          "--liquid-glass-radius-b": `${glassRadius * (1 - 0.1 * gel)}px ${glassRadius * (1 + 0.12 * gel)}px ${glassRadius * (1 - 0.08 * gel)}px ${glassRadius * (1 + 0.1 * gel)}px`,
          "--liquid-glass-radius-c": `${glassRadius * (1 + 0.05 * gel)}px ${glassRadius * (1 - 0.03 * gel)}px ${glassRadius * (1 + 0.08 * gel)}px ${glassRadius * (1 - 0.06 * gel)}px`,
          "--liquid-glass-radius-d": `${glassRadius * (1 - 0.01 * gel)}px ${glassRadius * (1 + 0.02 * gel)}px ${glassRadius}px ${glassRadius * (1 - 0.02 * gel)}px`,
          "--liquid-gel-duration": `${350 + effects.glassGel * 2.1}ms`,
          "--liquid-gel-x1": (1 + 0.045 * gel).toFixed(3),
          "--liquid-gel-y1": (1 - 0.06 * gel).toFixed(3),
          "--liquid-gel-rx1": `${-4 * gel}deg`,
          "--liquid-gel-ry1": `${3 * gel}deg`,
          "--liquid-gel-x2": (1 - 0.035 * gel).toFixed(3),
          "--liquid-gel-y2": (1 + 0.045 * gel).toFixed(3),
          "--liquid-gel-rx2": `${3 * gel}deg`,
          "--liquid-gel-ry2": `${-2.5 * gel}deg`,
          "--liquid-gel-x3": (1 + 0.02 * gel).toFixed(3),
          "--liquid-gel-y3": (1 - 0.015 * gel).toFixed(3),
          "--liquid-gel-rx3": `${-1.5 * gel}deg`,
          "--liquid-gel-ry3": `${1.2 * gel}deg`,
          "--liquid-gel-x4": (1 - 0.005 * gel).toFixed(3),
          "--liquid-gel-y4": (1 + 0.008 * gel).toFixed(3),
          "--liquid-gel-rx4": `${0.4 * gel}deg`,
          "--liquid-gel-ry4": `${-0.3 * gel}deg`,
          "--liquid-gel-sat1": (1 + 0.22 * gel).toFixed(2),
          "--liquid-gel-sat2": (1 + 0.12 * gel).toFixed(2),
          "--liquid-gel-sat3": (1 + 0.06 * gel).toFixed(2),
          "--liquid-gel-sat4": (1 + 0.02 * gel).toFixed(2),
          "--liquid-gel-glint-start": (0.12 + 0.68 * gel).toFixed(2),
          "--liquid-gel-glint-mid": (0.04 + 0.32 * gel).toFixed(2),
        } as CSSProperties}
      >
        <Background idle={isIdle} />

        {/* אזור לחיצה סודי זעיר לפתיחת הניהול; אפשר גם לפתוח עם F8 */}
        <button
          type="button"
          onClick={() => setAdminOpen(true)}
          aria-label="ניהול"
          title=""
          className="fixed left-0 top-0 z-[55] h-[3px] w-[3px] cursor-default opacity-0"
        />

        <Header config={active} onOpenRegistration={() => openRegistration("")} />

        <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {view === "id-entry" ? (
              <ScreenFrame key="entry" id="entry" animated={animated}>
                <IdEntryScreen
                  config={active}
                  onSearch={handleSearch}
                  isLoading={isLoading}
                  errorMessage={errorMessage}
                  onClearError={() => setErrorMessage(null)}
                  keyboardEnabled={!adminOpen && !exitOpen && !registerOpen && !isShutDown}
                  onOpenRegistration={openRegistration}
                />
              </ScreenFrame>
            ) : (
              folder && (
                <ScreenFrame key="files" id="files" animated={animated}>
                  <StudentFilesScreen
                    key={studentId}
                    folder={folder}
                    studentId={studentId}
                    files={files}
                    source={source}
                    handwritingFiles={handwritingFiles}
                    handwritingLoading={handwritingLoading}
                    handwritingError={handwritingError}
                    pendingTranscriptions={pendingTranscriptions}
                    onTranscription={handleTranscription}
                    onOpenHandwriting={handleOpenHandwriting}
                    autoLogoutSeconds={active.autoLogoutSeconds}
                    targetPath={targetPath}
                    targetDriveLetter={active.targetDriveLetter}
                    busy={busy}
                    printingFileId={printingId}
                    copyingFileId={copyingId}
                    copiedFileIds={copiedIds}
                    printedFileIds={printedIds}
                    isCopyingAll={isCopyingAll}
                    onBack={handleBack}
                    onPrint={handlePrint}
                    onCopy={handleCopy}
                    onCopyAll={handleCopyAll}
                  />
                </ScreenFrame>
              )
            )}
          </AnimatePresence>
        </main>

        <footer className="relative z-20 flex shrink-0 items-center justify-between border-t border-white/10 bg-navy-950/60 px-6 py-2 text-xs text-slate-400 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="font-semibold text-slate-200">{active.kioskTitle}</span>
            </span>
          </div>
          <PathLabel
            drive={active.targetDriveLetter}
            folder={active.targetFolderName}
            className="font-mono text-slate-300"
          />
        </footer>


        <AdminPanel
          open={adminOpen}
          config={config}
          onClose={() => setAdminOpen(false)}
          onPreview={setPreview}
          onSaved={handleSaved}
          onShutdown={() => {
            setPreview(null);
            setAdminOpen(false);
            setExitOpen(true);
          }}
        />

        <RegistrationModal
          open={registerOpen}
          initialId={registerInitialId}
          onClose={closeRegistration}
        />

        {folder && transcriptionKind === "audio" && (
          <TranscriptionDialog
            open={true}
            kind={transcriptionKind}
            studentId={studentId}
            folder={folder}
            source={source}
            onClose={() => setTranscriptionKind(null)}
            onSubmitted={() => {
              void fetchTranscriptionStatus(studentId).then((items) => {
                setPendingTranscriptions(items.filter((item) => item.status === "pending").length);
              });
            }}
          />
        )}


        <HandwritingAssociationDialog
          open={handwritingAssociationOpen}
          studentId={studentId}
          onClose={() => setHandwritingAssociationOpen(false)}
          onSaved={handleHandwritingAssociationSaved}
        />

        <Toasts toasts={toasts} onDismiss={removeToast} />

        <ExitModal
          open={exitOpen}
          isShuttingDown={isShuttingDown}
          onCancel={() => setExitOpen(false)}
          onConfirm={handleConfirmExit}
        />

        {isShutDown && (
          <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-navy-950 text-center">
            <TorahLogo size="lg" />
            <div>
              <h2 className="font-serif text-4xl font-black text-gold-gradient">העמדה כובתה</h2>
              <p className="mt-2 text-slate-400">ניתן לסגור את החלון. להפעלה מחדש לחץ על הכפתור.</p>
            </div>
            <FxButton variant="gold" onClick={restart} className="h-14 px-8 text-lg">
              <RotateCcw className="h-5 w-5" />
              הפעלה מחדש
            </FxButton>
          </div>
        )}
      </div>
    </FxProvider>
  );
}
