"use client";

import type { CSSProperties } from "react";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import type { KioskConfig, KioskFile, KioskFolder } from "@/lib/types";
import { FxProvider, effectClasses, fireConfetti } from "@/lib/client/fx";
import { playSound } from "@/lib/client/sound";
import { printHtmlDocument } from "@/lib/client/print";
import {
  copyFile,
  fetchPreview,
  logClientActivity,
  searchStudent,
} from "@/lib/client/api";
import { Background } from "./Background";
import { ExitModal } from "./ExitModal";
import { FxButton } from "./FxButton";
import { Header } from "./Header";
import { IdEntryScreen } from "./IdEntryScreen";
import { PathLabel } from "./PathLabel";
import { PreviewModal } from "./PreviewModal";
import { RegistrationModal } from "./RegistrationModal";
import { StudentFilesScreen } from "./StudentFilesScreen";
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

  // מצב מסכים
  const [view, setView] = useState<"id-entry" | "student-files">("id-entry");
  const [folder, setFolder] = useState<KioskFolder | null>(null);
  const [files, setFiles] = useState<KioskFile[]>([]);
  const [source, setSource] = useState<"drive" | "local" | undefined>();
  const [studentId, setStudentId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // חלונות
  const [adminOpen, setAdminOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isShutDown, setIsShutDown] = useState(false);
  const [previewFile, setPreviewFile] = useState<KioskFile | null>(null);

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

  const handleBack = useCallback(() => {
    setView("id-entry");
    setFolder(null);
    setFiles([]);
    setPreviewFile(null);
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
    const wordFiles = files.filter((f) => f.isWordDoc);
    if (wordFiles.length === 0) return;
    setIsCopyingAll(true);
    let ok = 0;
    let lastMessage = "";
    for (const file of wordFiles) {
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
      message: ok > 0 ? `${ok} מתוך ${wordFiles.length} קבצים הועתקו בהצלחה` : lastMessage,
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

  const handleRegistered = useCallback(
    (id: string, name: string) => {
      addToast({
        type: "success",
        title: "הרישום בוצע בהצלחה",
        message: `התלמיד "${name}" (ת.ז. ${id}) נרשם בגיליון Google Sheets בהצלחה`,
      });
      // איתור אוטומטי של תיקיית התלמיד שנרשם (ומסך ההקלדה מציג את הספרות שלו)
      window.dispatchEvent(new CustomEvent("kiosk:set-id", { detail: id }));
      void handleSearch(id);
    },
    [addToast, handleSearch],
  );

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

  // קיצור מקלדת לפתיחת הניהול
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
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
  const busy =
    printingId !== null || copyingId !== null || isCopyingAll || previewFile !== null || adminOpen;

  return (
    <FxProvider effects={effects}>
      <div
        className={`kiosk-root ${effectClasses(effects)} ${effects.glass && effects.glassIntensity > 0 ? "liquid-glass-motion" : ""} relative flex h-dvh flex-col overflow-hidden text-slate-100`}
        style={{
          "--liquid-glass-intensity": effects.glassIntensity / 100,
          "--liquid-glass-duration": `${11 - effects.glassSpeed}s`,
        } as CSSProperties}
      >
        <Background />

        {/* פיקסל סודי בפינה השמאלית העליונה לפתיחת הניהול */}
        <button
          type="button"
          onClick={() => setAdminOpen(true)}
          aria-label="ניהול"
          className="fixed left-0 top-0 z-[55] h-14 w-14 cursor-default opacity-0"
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
                    folder={folder}
                    files={files}
                    source={source}
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
                    onOpen={setPreviewFile}
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

        <PreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onPrint={handlePrint}
          onCopy={handleCopy}
          isPrinting={previewFile !== null && printingId === previewFile.id}
          isCopying={previewFile !== null && copyingId === previewFile.id}
        />

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
          onRegistered={handleRegistered}
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
