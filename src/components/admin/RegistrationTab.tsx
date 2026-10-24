"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import type { KioskConfig, RegistrationStatus } from "@/lib/types";
import { fetchRegistrationStatus } from "@/lib/client/api";
import { SectionCard, ToggleRow } from "./ui";

export function RegistrationTab({
  draft,
  update,
  pin,
}: {
  draft: KioskConfig;
  update: (patch: Partial<KioskConfig>) => void;
  pin: string;
  webhookUrl: string;
  setWebhookUrl: (v: string) => void;
  googleAccountEmail?: string | null;
  onOpenGoogleTab: () => void;
}) {
  const [status, setStatus] = useState<RegistrationStatus | null>(null);

  useEffect(() => {
    let active = true;
    fetchRegistrationStatus(pin)
      .then((value) => { if (active) setStatus(value); })
      .catch(() => { if (active) setStatus(null); });
    return () => { active = false; };
  }, [pin]);

  return (
    <div className="space-y-4">
      <ToggleRow
        title="אפשר רישום תלמידים מהעמדה"
        description="מאפשר להוסיף רשומות חדשות לגיליון. חיפוש קוד אישי לרשומות קיימות נשאר זמין גם כשהוספת רשומות כבויה."
        checked={draft.registrationEnabled}
        onChange={(value) => update({ registrationEnabled: value })}
      />

      <SectionCard
        title="Google Sheets וגיבוי CSV מקומי"
        icon={<FileSpreadsheet className="h-4 w-4 text-emerald-400" />}
        hint="הרישום הראשי מתווסף לשורת Google Sheets באמצעות חשבון השירות. קובץ ה-CSV במחשב נשמר כגיבוי ומשמש לקישור בין תעודת הזהות לשם התלמיד בחיפוש ב-Drive."
        action={
          <span className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-bold ${status?.configured ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-200"}`}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {status?.configured ? "Sheets מוכן" : "נדרשת הגדרה"}
          </span>
        }
      >
        <div className="space-y-3 text-sm text-slate-200">
          <p>כדי להוסיף נרשמים לגיליון, יש להעלות JSON של חשבון שירות ולהגדיר את מזהה Google Sheets בלשונית "חשבון Google ודרייב". לחשבון השירות חייבת להיות הרשאת עריכה בגיליון.</p>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-1 text-xs font-bold text-slate-400">מזהה הגיליון השמור</div>
            <div className="break-all font-mono text-xs text-sky-200" dir="ltr">
              {status?.spreadsheetId || "לא הוגדר"}
            </div>
            {status?.serviceAccountEmail && (
              <div className="mt-2 text-xs text-slate-300">
                חשבון שירות: <span dir="ltr" className="font-mono text-emerald-200">{status.serviceAccountEmail}</span>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-1 text-xs font-bold text-slate-400">מיקום גיבוי ה-CSV המקומי</div>
            <div className="break-all font-mono text-xs text-emerald-200" dir="ltr">
              {status?.localFilePath ?? "Documents\\ToraDelia-Registrations.csv"}
            </div>
            {!status?.localFilePath && (
              <p className="mt-2 text-xs text-slate-400">הנתיב יוצג לאחר שהאפליקציה תתחיל לפעול.</p>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            הקובץ נשמר במחשב שמריץ את הקיוסק. הוא נדרש גם למיפוי תעודת זהות לשם לצורך חיפוש תיקיות ב-Drive; גבה אותו מדי פעם.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
