export const dynamic = "force-dynamic";

/**
 * בדיקת תקינות ליישום המקומי.
 * ההגדרות ויומן הפעילות נשמרים בקבצים מקומיים; אין תלות ב-PostgreSQL.
 */
export async function GET() {
  return Response.json({ ok: true, storage: "local" });
}
