import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { loadLiveAnalysisContext } from "@/lib/cash-discount-live-context";
import { toText } from "@/lib/collections";

export function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

// What a connector needs to analyse its own scan: the debit notes already
// created and the connection status.
export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const connectionId = toText(body.connectionId, 80);
    const companyName = toText(body.companyName, 240);
    if (!connectionId || !companyName) return jsonWithCors(request, { error: "A Tally connection and company are required." }, { status: 400 });
    const context = await loadLiveAnalysisContext(request, user.id, {
      connectionId, companyName, financialYear: toText(body.financialYear, 20) || null, companyGuid: body.companyGuid,
    });
    if (!context.ok) return jsonWithCors(request, { error: context.error }, { status: context.status });
    return jsonWithCors(request, {
      proposalRows: context.proposalRows,
      connectionStatus: context.connectionStatus,
      lastHeartbeatAt: context.lastHeartbeatAt,
    });
  } catch (error) {
    console.error("Error in POST /api/collections/live/analysis-context:", error);
    return jsonWithCors(request, { error: error instanceof Error ? error.message : "Could not load the analysis context." }, { status: 500 });
  }
}
