import { jsonWithCors, optionsWithCors } from '@/lib/api/cors';
import { requireRequestUser } from '@/lib/api/request-auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const OPTIONS = optionsWithCors;

async function record(request: Request) {
  try {
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    if (!/^[a-f0-9-]{36}$/i.test(String(body.requestId)) || !['completed', 'failed', 'cancelled'].includes(body.status)) {
      return jsonWithCors(request, { error: 'Invalid scan summary' }, { status: 400 });
    }
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from('tally_connections').select('id').eq('id', body.connectionId).eq('owner_user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) return jsonWithCors(request, { error: 'Connection not found' }, { status: 404 });
    const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(value, 1e12)) : null;
    const { error: insertError } = await db.from('tally_connection_events').insert({
      connection_id: body.connectionId, owner_user_id: user.id,
      event_type: 'cash_discount_scan_finished', message: `Cash Discount scan ${body.status}`,
      payload: {
        requestId: String(body.requestId), status: body.status, companyName: String(body.companyName || '').slice(0, 240),
        financialYear: String(body.financialYear || '').slice(0, 20), elapsedMs: finite(body.elapsedMs),
        completed: finite(body.completed), total: finite(body.total), complete: body.complete === true,
        callCount: finite(body.callCount), responseBytes: finite(body.responseBytes), peakRssBytes: finite(body.peakRssBytes), minimumSystemFreeBytes: finite(body.minimumSystemFreeBytes),
        failureClass: ['timeout', 'disconnected', 'cancelled', 'other'].includes(body.failureClass) ? body.failureClass : null,
      },
    });
    if (insertError) throw insertError;
    return jsonWithCors(request, { recorded: true });
  } catch (error) {
    console.error('Error in POST /api/collections/live/scan-event:', error);
    return jsonWithCors(request, { error: 'Could not record scan summary' }, { status: 500 });
  }
}

export const POST = record;
