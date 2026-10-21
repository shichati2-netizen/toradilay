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
        description="מציג כפתור רישום במסך. כל רישום נשמר בקובץ CSV מקומי במחשב, ללא חיבור ל-Google."
        checked={draft.registrationEnabled}
        onChange={(value) => update({ registrationEnabled: value })}
      />

      <SectionCard
        title="קובץ רישום מקומי"
        icon={<FileSpreadsheet className="h-4 w-4 text-emerald-400" />}
        hint="כל רישום מוסיף שורה עם שם פרטי, שם משפחה, תעודת זהות, ועד ותאריך ושעה. אפשר לפתוח את קובץ ה-CSV ב-Excel."
        action={
          <span className="flex items-center gap-1 rounded-md bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            פעיל
          </span>
        }
      >
        <div className="space-y-3 text-sm text-slate-200">
          <p>אין צורך להתחבר לחשבון Google, להגדיר גיליון או להפעיל שירות חיצוני.</p>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-1 text-xs font-bold text-slate-400">מיקום קובץ הרישום</div>
            <div className="break-all font-mono text-xs text-emerald-200" dir="ltr">
              {status?.localFilePath ?? "Documents\\ToraDelia-Registrations.csv"}
            </div>
            {!status?.localFilePath && (
              <p className="mt-2 text-xs text-slate-400">הנתיב יוצג לאחר שהאפליקציה תתחיל לפעול.</p>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            הקובץ נשמר במחשב שמריץ את הקיוסק. גבה אותו מדי פעם; החלפת גרסת התוכנה לא אמורה למחוק אותו.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
