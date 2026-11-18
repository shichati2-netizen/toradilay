"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, FileAudio, FileText, Folder, HardDrive, Loader2, Mail, Mic, PenLine, Send, X } from "lucide-react";
import type { KioskFolder, TranscriptionKind, TranscriptionModel } from "@/lib/types";
import { browseTranscriptionFiles, sendTranscriptionFiles, type TranscriptionBrowseResult } from "@/lib/client/api";

interface SelectedFile {
  token: string;
  name: string;
  size: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function TranscriptionDialog({
  open,
  kind,
  studentId,
  folder,
  source,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  kind: TranscriptionKind;
  studentId: string;
  folder: KioskFolder;
  source?: "drive" | "local";
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [drive, setDrive] = useState("");
  const [relativePath, setRelativePath] = useState("");
  const [browse, setBrowse] = useState<TranscriptionBrowseResult | null>(null);
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chooseModel, setChooseModel] = useState(false);
  const [model, setModel] = useState<TranscriptionModel>("model1");

  const load = useCallback(async (nextDrive = drive, nextPath = relativePath) => {
    setLoading(true);
    setError(null);
    try {
      const result = await browseTranscriptionFiles(studentId, kind, nextDrive || undefined, nextPath);
      setBrowse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לטעון את הסייר.");
    } finally {
      setLoading(false);
    }
  }, [drive, relativePath, studentId, kind]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDrive("");
    setRelativePath("");
    setBrowse(null);
    setSelected([]);
    setError(null);
    setChooseModel(false);
    setLoading(true);
    void browseTranscriptionFiles(studentId, kind).then((result) => {
      if (!cancelled) setBrowse(result);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "לא ניתן לטעון את הסייר.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, kind, studentId]);

  const openDrive = (letter: string) => {
    setDrive(letter);
    setRelativePath("");
    void load(letter, "");
  };

  const openFolder = (nextPath: string) => {
    setRelativePath(nextPath);
    void load(drive, nextPath);
  };

  const goUp = () => {
    if (!relativePath) {
      setDrive("");
      void load("", "");
      return;
    }
    const parts = relativePath.split(/[\\/]+/).filter(Boolean);
    parts.pop();
    const parent = parts.join("\\");
    setRelativePath(parent);
    void load(drive, parent);
  };

  const toggleFile = (file: SelectedFile) => {
    setSelected((current) => current.some((item) => item.token === file.token)
      ? current.filter((item) => item.token !== file.token)
      : current.length >= 20 ? current : [...current, file]);
  };

  const submit = async () => {
    if (!selected.length || sending) return;
    setSending(true);
    setError(null);
    const result = await sendTranscriptionFiles({
      studentId,
      folderId: folder.id,
      folderName: folder.name,
      source,
      kind,
      model,
      fileTokens: selected.map((item) => item.token),
    });
    setSending(false);
    if (!result.ok) {
      setError(result.error || "שליחת הקבצים נכשלה.");
      setChooseModel(false);
      return;
    }
    onSubmitted();
    onClose();
  };

  if (!open) return null;
  const title = kind === "audio" ? "תמלול קולי" : "תמלול כתבי יד";
  const fileLabel = kind === "audio" ? "קובצי שמע" : "קובצי PDF";
  const fileIcon = kind === "audio" ? <FileAudio className="h-4 w-4 text-sky-300" /> : <FileText className="h-4 w-4 text-rose-300" />;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-navy-950/85 p-3 backdrop-blur-sm sm:p-5">
      <div className="panel-solid flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-400/15 text-gold-300">
              {kind === "audio" ? <Mic className="h-5 w-5" /> : <PenLine className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-lg font-black text-white">{title}</h3>
              <p className="text-xs text-slate-400">חשבון: <span className="font-mono text-slate-200" dir="ltr">{studentId}</span> · מוצגים רק {fileLabel} מכוננים נשלפים</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10" aria-label="סגירה"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-400">
              {drive ? <span dir="ltr">{drive + ":\\" + (relativePath ? relativePath : "")}</span> : "בחר דיסק און קי כדי לעיין בקבצים"}
            </div>
            {drive && (
              <button type="button" onClick={goUp} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">
                <ArrowLeft className="h-3.5 w-3.5" /> חזרה
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-300"><Loader2 className="h-5 w-5 animate-spin" /> סורק את הכונן...</div>
          ) : !drive ? (
            browse?.drives.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {browse.drives.map((item) => (
                  <button key={item.letter} type="button" onClick={() => openDrive(item.letter)} className="flex min-h-20 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-right transition hover:border-gold-400/40 hover:bg-white/[0.08]">
                    <HardDrive className="h-6 w-6 text-gold-300" />
                    <span className="min-w-0"><span className="block font-bold text-white">{item.name}</span><span className="font-mono text-xs text-slate-400" dir="ltr">{item.letter}:</span></span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 text-center">
                <HardDrive className="h-8 w-8 text-slate-500" />
                <p className="font-bold text-white">לא נמצא דיסק און קי מחובר</p>
                <p className="text-xs text-slate-400">חבר כונן נשלף ולחץ על רענון.</p>
                <button type="button" onClick={() => void load("", "")} className="mt-2 rounded-lg bg-white/10 px-4 py-2 text-xs text-white hover:bg-white/15">רענון</button>
              </div>
            )
          ) : (
            <div className="space-y-2">
              {browse?.folders.map((item) => (
                <button key={item.relativePath} type="button" onClick={() => openFolder(item.relativePath)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-right hover:bg-white/[0.08]">
                  <Folder className="h-4 w-4 text-amber-300" />
                  <span className="flex-1 truncate text-sm font-semibold text-slate-100">{item.name}</span>
                  <span className="text-xs text-slate-500">תיקייה</span>
                </button>
              ))}
              {browse?.files.map((item) => {
                const isSelected = selected.some((entry) => entry.token === item.token);
                return (
                  <button key={item.token} type="button" onClick={() => toggleFile({ token: item.token, name: item.name, size: item.size })} className={"flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-right transition " + (isSelected ? "border-emerald-400/40 bg-emerald-400/[0.08]" : "border-white/10 bg-white/[0.035] hover:bg-white/[0.08]")}>
                    {fileIcon}
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-100">{item.name}</span><span className="text-[11px] text-slate-500">{formatSize(item.size)}</span></span>
                    {isSelected ? <Check className="h-4 w-4 text-emerald-300" /> : <span className="text-xs text-slate-500">בחר</span>}
                  </button>
                );
              })}
              {!browse?.folders.length && !browse?.files.length && (
                <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-400">לא נמצאו {fileLabel} בתיקייה זו.</div>
              )}
            </div>
          )}

          {selected.length > 0 && (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
              <div className="mb-2 text-xs font-bold text-emerald-200">{selected.length} קבצים נבחרו לשליחה</div>
              <div className="space-y-1">
                {selected.map((item) => <div key={item.token} className="flex items-center justify-between gap-2 text-xs text-slate-300"><span className="truncate">{item.name}</span><button type="button" onClick={() => toggleFile(item)} className="shrink-0 text-rose-300 hover:text-rose-200">הסר</button></div>)}
              </div>
            </div>
          )}

          {error && <div className="mt-3 rounded-xl border border-red-400/30 bg-red-400/[0.08] p-3 text-xs text-red-200">{error}</div>}
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">לפני השליחה שם כל קובץ ישונה למספר תעודת הזהות של החשבון (ובתוספת סיומת במקרה של כמה קבצים מאותו סוג). מגבלת השליחה הכוללת היא 20MB.</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
          <div className="text-xs text-slate-400">{selected.length} / 20 קבצים נבחרו</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm text-slate-300 hover:bg-white/10">ביטול</button>
            <button type="button" onClick={() => setChooseModel(true)} disabled={!selected.length || sending} className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-5 text-sm font-black text-navy-950 disabled:opacity-40">
              <Send className="h-4 w-4" /> שלח לתמלול
            </button>
          </div>
        </div>
      </div>

      {chooseModel && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/65 p-4">
          <div className="panel-solid w-full max-w-sm p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-base font-black text-white">בחירת מודל תמלול</h4>
              <button type="button" onClick={() => setChooseModel(false)} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-xs text-slate-400">בחר לאיזה מנוע לשלוח את הקבצים שנבחרו.</p>
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <input type="radio" checked={model === "model1"} onChange={() => setModel("model1")} />
                <span><span className="block text-sm font-bold text-white">מודל 1</span><span className="text-xs text-slate-400">כתובת היעד הראשונה שהוגדרה</span></span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <input type="radio" checked={model === "model2"} onChange={() => setModel("model2")} />
                <span><span className="block text-sm font-bold text-white">מודל 2</span><span className="text-xs text-slate-400">כתובת היעד השנייה שהוגדרה</span></span>
              </label>
            </div>
            {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setChooseModel(false)} className="rounded-xl px-4 py-2 text-sm text-slate-300 hover:bg-white/10">חזרה</button>
              <button type="button" onClick={() => void submit()} disabled={sending} className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-4 py-2 text-sm font-black text-navy-950 disabled:opacity-50">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {sending ? "שולח..." : "אישור ושליחה"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
