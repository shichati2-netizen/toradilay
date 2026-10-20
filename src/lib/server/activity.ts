import {
  appendLocalActivity,
  readLocalActivities,
} from "./local-store";
import type { StatsResponse } from "@/lib/types";

export type ActivityType = "search" | "miss" | "print" | "copy" | "exit" | "register";

/** מסתיר את רוב ספרות תעודת הזהות ביומן (••••••123) */
export function maskId(id?: string | null): string | null {
  if (!id) return null;
  const digits = String(id).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 3) return digits;
  return "•".repeat(digits.length - 3) + digits.slice(-3);
}

export async function logActivity(entry: {
  type: ActivityType;
  studentId?: string | null;
  fileName?: string | null;
  detail?: string | null;
  success?: boolean;
}): Promise<void> {
  try {
    appendLocalActivity({
      type: entry.type,
      studentRef: maskId(entry.studentId),
      fileName: entry.fileName?.slice(0, 300) ?? null,
      detail: entry.detail?.slice(0, 500) ?? null,
      success: entry.success ?? true,
    });
  } catch (err) {
    console.error("[activity] failed to log locally:", err);
  }
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getStats(): Promise<StatsResponse> {
  const rows = readLocalActivities().sort((a, b) => a.id - b.id);
  const totals = {
    prints: rows.filter((r) => r.type === "print" && r.success).length,
    copies: rows.filter((r) => r.type === "copy" && r.success).length,
    searches: rows.filter((r) => r.type === "search").length,
    misses: rows.filter((r) => r.type === "miss").length,
    registrations: rows.filter((r) => r.type === "register" && r.success).length,
  };

  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dateKeys: string[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - offset);
    dateKeys.push(utcDateKey(day));
  }
  const dailyCounts = new Map(dateKeys.map((date) => [date, { prints: 0, copies: 0 }]));
  for (const row of rows) {
    const day = dailyCounts.get(row.createdAt.slice(0, 10));
    if (!day || !row.success) continue;
    if (row.type === "print") day.prints++;
    if (row.type === "copy") day.copies++;
  }

  const sinceRow = rows.reduce<(typeof rows)[number] | null>(
    (earliest, row) =>
      !earliest || row.createdAt < earliest.createdAt ? row : earliest,
    null,
  );
  const recentRows = [...rows].sort((a, b) => b.id - a.id).slice(0, 25);

  return {
    totals,
    since: sinceRow ? new Date(sinceRow.createdAt).toISOString() : null,
    daily: dateKeys.map((date) => ({ date, ...dailyCounts.get(date)! })),
    recent: recentRows.map((r) => ({
      id: r.id,
      type: r.type,
      studentRef: r.studentRef,
      fileName: r.fileName,
      detail: r.detail,
      success: r.success,
      createdAt: new Date(r.createdAt).toISOString(),
    })),
  };
}
