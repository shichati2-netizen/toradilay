export const dynamic = "force-dynamic";

/** אין רשימת מורשים: כל תלמיד שנמצא במסך הכניסה מקבל את שתי תיקיות התמלול. */
export async function POST(req: Request) {
  try {
    const body = await req.json() as { studentId?: string };
    const studentId = String(body.studentId || "").replace(/\D/g, "").slice(0, 12);
    const valid = /^\d{9}$/.test(studentId);
    return Response.json({ enabled: valid, allowed: valid });
  } catch {
    return Response.json({ enabled: false, allowed: false }, { status: 400 });
  }
}
