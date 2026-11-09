// Everything a Cash Discount analysis needs from the database:
// the analyse route (connector sends its scan here) and the analysis-context
// route (the gateway hands this to a connector that analyses the scan itself).
import { readCompleteHistory } from "@/lib/collections-history";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export function normalizeCompanyName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export type LiveAnalysisContext =
  | { ok: true; proposalRows: unknown[]; connectionStatus: string | null; lastHeartbeatAt: string | null; databaseMs: number }
  | { ok: false; status: number; error: string };

export async function loadLiveAnalysisContext(request: Request, userId: string, params: {
  connectionId: string;
  companyName: string;
  financialYear: string | null;
  companyGuid?: unknown;
}): Promise<LiveAnalysisContext> {
  const { connectionId, companyName } = params;
  const supabase = createSupabaseAdminClient();
  const proposals = supabase.from('debit_note_proposals').select('*').eq('company_name', companyName).eq('status', 'created_in_tally')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).eq('owner_user_id', userId);
  const databaseStartedAt = performance.now();
  const [{ data: connection, error: connectionError }, { data: proposalRows, error: proposalError }] = await Promise.all([
    supabase
      .from("tally_connections")
      .select("id, owner_user_id, status, last_company_name, last_heartbeat_at, last_tally_reachable, last_company_loaded")
      .eq("id", connectionId)
      .eq("owner_user_id", userId)
      .is("revoked_at", null)
      .maybeSingle(),
    readCompleteHistory((from, to) => proposals.range(from, to)).then(data => ({ data, error: null })),
  ]);
  const databaseMs = performance.now() - databaseStartedAt;
  if (connectionError) throw connectionError;
  if (proposalError) throw proposalError;
  if (!connection) return { ok: false, status: 404, error: "Tally connection not found." };
  if (
    connection.last_tally_reachable !== true ||
    connection.last_company_loaded !== true ||
    normalizeCompanyName(connection.last_company_name) !== normalizeCompanyName(companyName)
  ) {
    return {
      ok: false,
      status: 409,
      error: `Tally is currently open to ${connection.last_company_name || "another company"}. Refresh the connection before calculating Cash Discounts.`,
    };
  }
  return { ok: true, proposalRows: proposalRows ?? [], connectionStatus: connection.status ?? null, lastHeartbeatAt: connection.last_heartbeat_at ?? null, databaseMs };
}
