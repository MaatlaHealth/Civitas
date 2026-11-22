import { getActor } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { exportIncidentsCsv } from "@/lib/services/analytics";

export const runtime = "nodejs";

/** Coordinator-only CSV export of operational incident data. */
export async function GET() {
  try {
    const csv = await exportIncidentsCsv(await getActor());
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="civitas-incidents-${date}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse("GET /api/export/incidents", error);
  }
}
