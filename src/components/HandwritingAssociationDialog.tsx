"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, PenLine, X } from "lucide-react";
import { saveHandwritingAssociationApi } from "@/lib/client/api";

export function HandwritingAssociationDialog({
  open,
  studentId,
  onClose,
}: {
  open: boolean;
  studentId: string;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [folderUrl, setFolderUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setFullName("");
    setSaving(false);
    setError(null);
    setSavedMessage(null);
    setFolderUrl("");
  }, [open, studentId]);

  const submit = async () => {
    const name = fullName.replace(/\\s+/g, " ").trim();
    if (name.split(/\s+/).filter((part) => part.length >= 2).length < 2) {
      setError("יש להזין שם פרטי ושם משפחה.");
      return;
    }

    // פתיחת חלון ריק בתוך פעולת הלחיצה מונעת חסימה של חלונות קופצים
    // בזמן ההמתנה לתשובת השרת.
    const popup = window.open("about:blank", "_blank");
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    const result = await saveHandwritingAssociationApi(studentId, name);
    setSaving(false);

    if (!result.ok) {
      popup?.close();
      setError(result.error || "שמירת השיוך נכשלה.");
      return;
    }

    if (result.folderUrl) {
      if (popup) {
        popup.location.href = result.folderUrl;
        setSavedMessage("השיוך נשמר והתיקייה נפתחה.");
      } else {
        setFolderUrl(result.folderUrl);
        setSavedMessage("השיוך נשמר. לחץ על הקישור כדי לפתוח את תיקיית התמלול.");
      }
      return;
    }

    popup?.close();
    setSavedMessage(result.message || "השיוך נשמר. תיקיית כתב היד עדיין לא נמצאה.");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm">
      <div className="panel-solid w-full max-w-lg overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/15 text-rose-300">
              <PenLine className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">שיוך לתיקיית תמלול כתב יד</h3>
              <p className="text-xs text-slate-400">נדרש לבצע שיוך חד־פעמי לחשבון</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10" aria-label="סגירה">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-slate-300">
            כדי לגשת לתיקיית תמלול כתב היד, יש לקשר את מספר תעודת הזהות לשם המלא כפי שהוא מופיע בשם תיקיית Google Drive.
          </p>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">מספר תעודת זהות</label>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-lg text-slate-200" dir="ltr">
              {studentId}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="handwriting-full-name" className="block text-xs font-bold text-slate-300">שם מלא – שם פרטי ושם משפחה</label>
            <input
              id="handwriting-full-name"
              value={fullName}
              onChange={(event) => { setFullName(event.target.value); setError(null); setSavedMessage(null); setFolderUrl(""); }}
              onKeyDown={(event) => { if (event.key === "Enter" && !saving) void submit(); }}
              maxLength={120}
              autoComplete="name"
              placeholder="לדוגמה: ישראל ישראלי"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-gold-400/50"
              autoFocus
            />
          </div>

          {error && <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}
          {savedMessage && <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200"><Check className="me-1 inline h-4 w-4" />{savedMessage}</p>}
          {folderUrl && (
            <a href={folderUrl} target="_blank" rel="noreferrer" className="block rounded-xl bg-gold-400 px-4 py-3 text-center text-sm font-black text-navy-950">
              פתיחת תיקיית תמלול כתב יד
            </a>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">
              סגירה
            </button>
            <button type="button" onClick={() => void submit()} disabled={saving || fullName.trim().length < 3} className="flex min-w-32 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-5 py-2.5 text-sm font-black text-navy-950 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              שמירת השיוך
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
