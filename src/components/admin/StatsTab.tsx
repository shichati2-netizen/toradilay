"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, Bug, Copy, Loader2, Printer, RefreshCw, Search, SearchX, Usb, UserPlus } from "lucide-react";
import type { StatsResponse } from "@/lib/types";
import { fetchStats } from "@/lib/client/api";

type DiagnosticLogEntry = {
  timestamp: string;
  level: "info" | "warn" | "error" | "fatal";
  event: string;
  source?: string;
  pid?: number;
  appVersion?: string;
  details?: unknown;
};

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  print: { label: "הדפסה", color: "text-sky-300 bg-sky-400/10" },
  copy: { label: "העתקה", color: "text-emerald-300 bg-emerald-400/10" },
  search: { label: "חיפוש", color: "text-gold-300 bg-gold-400/10" },
  miss: { label: "לא נמצא", color: "text-red-300 bg-red-400/10" },
  register: { label: "רישום", color: "text-violet-300 bg-violet-400/10" },
  exit: { label: "יציאה", color: "text-slate-300 bg-white/10" },
};

function dayLabel(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("he-IL", { weekday: "short" });
}

export function StatsTab({ pin }: { pin: string }) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticLogEntry[]>([]);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(true);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<"all" | "error" | "warn" | "info">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const s = await fetchStats(pin);
    setStats(s);
    setFailed(!s);
    setLoading(false);
  }, [pin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  const loadDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    setDiagnosticsError(null);
    try {
      const response = await fetch("/api/diagnostics?limit=300", {
        headers: { "x-admin-pin": pin },
        cache: "no-store",
      });
      const data = (await response.json()) as { logs?: DiagnosticLogEntry[]; error?: string };
      if (!response.ok) throw new Error(data.error || "טעינת יומן האבחון נכשלה");
      setDiagnostics(Array.isArray(data.logs) ? data.logs : []);
    } catch (error) {
      setDiagnosticsError(error instanceof Error ? error.message : "טעינת יומן האבחון נכשלה");
    } finally {
      setDiagnosticsLoading(false);
    }
  }, [pin]);

  const refreshAll = useCallback(() => {
    void load();
    void loadDiagnostics();
  }, [load, loadDiagnostics]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDiagnostics();
  }, [loadDiagnostics]);

  const visibleDiagnostics = diagnostics.filter((entry) => {
    if (logFilter === "all") return true;
    if (logFilter === "error") return entry.level === "error" || entry.level === "fatal";
    return entry.level === logFilter;
  });
  const errorCount = diagnostics.filter((entry) => entry.level === "error" || entry.level === "fatal").length;
  const warningCount = diagnostics.filter((entry) => entry.level === "warn").length;


  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-slate-300">
        <Loader2 className="keep-anim h-6 w-6 animate-spin text-gold-400" />
        טוען נתונים...
      </div>
    );
  }
  if (failed || !stats) {
    return <p className="py-20 text-center text-sm text-red-300">טעינת הסטטיסטיקה נכשלה</p>;
  }

  const cards = [
    { label: "הדפסות", value: stats.totals.prints, icon: Printer, tone: "from-sky-400/20 text-sky-300" },
    { label: "העתקות", value: stats.totals.copies, icon: Usb, tone: "from-emerald-400/20 text-emerald-300" },
    { label: "חיפושים מוצלחים", value: stats.totals.searches, icon: Search, tone: "from-gold-400/20 text-gold-300" },
    { label: "לא נמצאו", value: stats.totals.misses, icon: SearchX, tone: "from-red-400/20 text-red-300" },
    { label: "רישומים לגיליון", value: stats.totals.registrations, icon: UserPlus, tone: "from-violet-400/20 text-violet-300" },
  ];
  const maxDay = Math.max(1, ...stats.daily.map((d) => d.prints + d.copies));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {stats.since
            ? `מאז ${new Date(stats.since).toLocaleDateString("he-IL")}`
            : "עדיין אין פעילות רשומה"}
        </p>
        <button
          type="button"
          onClick={refreshAll}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading || diagnosticsLoading ? "keep-anim animate-spin" : ""}`} />
          רענן הכול
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl border border-white/10 bg-gradient-to-br ${c.tone.split(" ")[0]} to-transparent p-4`}>
            <c.icon className={`mb-2 h-5 w-5 ${c.tone.split(" ")[1]}`} />
            <div className="font-mono text-3xl font-black text-white">{c.value.toLocaleString("he-IL")}</div>
            <div className="text-xs font-medium text-slate-400">{c.label}</div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <h4 className="mb-4 text-sm font-bold text-white">7 הימים האחרונים</h4>
        <div className="flex items-end gap-2">
          {stats.daily.map((d) => {
            const total = d.prints + d.copies;
            const BAR_H = 112;
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="h-4 font-mono text-[11px] text-slate-400">{total || ""}</span>
                <div
                  className="flex w-full flex-col justify-end overflow-hidden rounded-lg bg-white/[0.04]"
                  style={{ height: BAR_H }}
                >
                  <div
                    className="w-full bg-emerald-400/80 transition-all duration-500"
                    style={{ height: Math.round((d.copies / maxDay) * BAR_H) }}
                  />
                  <div
                    className="w-full bg-sky-400/80 transition-all duration-500"
                    style={{ height: Math.round((d.prints / maxDay) * BAR_H) }}
                  />
                </div>
                <span className="text-[11px] text-slate-400">{dayLabel(d.date)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-sky-400/80" />הדפסות</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-400/80" />העתקות</span>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h4 className="flex items-center gap-2 text-sm font-bold text-white">
            <Bug className="h-4 w-4 text-gold-400" />
            יומן אבחון ושגיאות
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {([
              ["all", "הכול"],
              ["error", "שגיאות"],
              ["warn", "אזהרות"],
              ["info", "מידע"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setLogFilter(value)}
                aria-pressed={logFilter === value}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${logFilter === value ? "border-gold-300/50 bg-gold-400/15 text-gold-200" : "border-white/10 text-slate-400 hover:bg-white/10"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-slate-400">
          <span>{diagnostics.length} אירועים אחרונים</span>
          <span className="text-red-300">{errorCount} שגיאות</span>
          <span className="text-amber-300">{warningCount} אזהרות</span>
        </div>
        {diagnosticsLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען יומן אבחון...
          </div>
        ) : diagnosticsError ? (
          <div className="py-6 text-center text-xs text-red-300">{diagnosticsError}</div>
        ) : visibleDiagnostics.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">אין אירועים בקטגוריה שנבחרה</div>
        ) : (
          <div className="max-h-[27rem] space-y-2 overflow-y-auto pe-1">
            {visibleDiagnostics.map((entry, index) => {
              const critical = entry.level === "fatal" || entry.level === "error";
              const warning = entry.level === "warn";
              const levelLabel = entry.level === "fatal" ? "קריטי" : critical ? "שגיאה" : warning ? "אזהרה" : "מידע";
              const Icon = critical ? AlertCircle : warning ? AlertTriangle : Bug;
              return (
                <details key={entry.timestamp + entry.event + index} className="group rounded-xl border border-white/10 bg-navy-950/40">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2.5 p-3 marker:hidden">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${critical ? "bg-red-400/10 text-red-300" : warning ? "bg-amber-400/10 text-amber-300" : "bg-sky-400/10 text-sky-300"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className={`w-14 shrink-0 rounded-md px-1.5 py-1 text-center text-[10px] font-black ${critical ? "bg-red-400/10 text-red-300" : warning ? "bg-amber-400/10 text-amber-300" : "bg-sky-400/10 text-sky-300"}`}>
                      {levelLabel}
                    </span>
                    <span className="min-w-0 flex-1 break-all text-xs font-semibold text-slate-200" dir="auto">{entry.event}</span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-500" dir="ltr">
                      {new Date(entry.timestamp).toLocaleString("he-IL")}
                    </span>
                    <span className="text-[10px] text-slate-500 transition group-open:rotate-180">⌄</span>
                  </summary>
                  <div className="border-t border-white/10 p-3">
                    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
                      <span>מקור: {entry.source || "לא צוין"}</span>
                      {entry.appVersion && <span>גרסה: {entry.appVersion}</span>}
                      {typeof entry.pid === "number" && <span>תהליך: {entry.pid}</span>}
                    </div>
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-slate-300" dir="ltr">
                      {JSON.stringify(entry.details ?? {}, null, 2)}
                    </pre>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
          <Copy className="h-4 w-4 text-gold-400" />
          פעילות אחרונה
        </h4>
        {stats.recent.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">אין פעילות להצגה</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {stats.recent.map((r) => {
              const t = TYPE_LABEL[r.type] ?? { label: r.type, color: "text-slate-300 bg-white/10" };
              return (
                <li key={r.id} className="flex items-center gap-3 py-2 text-xs">
                  <span className={`w-16 shrink-0 rounded-md px-2 py-1 text-center font-bold ${t.color}`}>{t.label}</span>
                  <span className="w-24 shrink-0 font-mono text-slate-400" dir="ltr">{r.studentRef ?? "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-300" title={r.fileName ?? r.detail ?? ""}>
                    {r.fileName ?? r.detail ?? ""}
                  </span>
                  {!r.success && <span className="shrink-0 rounded bg-red-400/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">נכשל</span>}
                  <span className="shrink-0 font-mono text-[11px] text-slate-500" dir="ltr">
                    {new Date(r.createdAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
