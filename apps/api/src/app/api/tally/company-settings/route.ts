import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsWithCors } from "@/lib/api/cors";
import { requireRequestUser } from "@/lib/api/request-auth";
import { isLocalDbMode } from "@/lib/local/mode";
import {
  companySettingsKey,
  DEFAULT_COMPANY_SETTINGS,
  loadCompanySettings,
  normalizeCompanySettings,
} from "@/lib/tally/company-settings";

export async function OPTIONS(request: Request) {
  return optionsWithCors(request);
}

export async function GET(request: Request) {
  try {
    const user = isLocalDbMode() ? { id: "local-dev-user" } : await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const companyName = new URL(request.url).searchParams.get("companyName") ?? "";
    if (isLocalDbMode() || !companySettingsKey(companyName)) {
      return jsonWithCors(request, { settings: DEFAULT_COMPANY_SETTINGS, defaults: DEFAULT_COMPANY_SETTINGS });
    }
    const settings = await loadCompanySettings(createSupabaseAdminClient(), user.id, companyName);
    return jsonWithCors(request, { settings, defaults: DEFAULT_COMPANY_SETTINGS });
  } catch {
    // Settings are optional: a failure here must never block the statement flow.
    return jsonWithCors(request, { settings: DEFAULT_COMPANY_SETTINGS, defaults: DEFAULT_COMPANY_SETTINGS });
  }
}

export async function PUT(request: Request) {
  try {
    if (isLocalDbMode()) return jsonWithCors(request, { error: "Settings are not available in local mode." }, { status: 400 });
    const user = await requireRequestUser(request);
    if (!user) return jsonWithCors(request, { error: "Unauthorized" }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { companyName?: unknown; settings?: unknown } | null;
    const companyName = typeof body?.companyName === "string" ? body.companyName.trim().slice(0, 240) : "";
    const key = companySettingsKey(companyName);
    if (!key) return jsonWithCors(request, { error: "Company name is required." }, { status: 400 });
    const settings = normalizeCompanySettings(body?.settings);
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("tally_company_settings").upsert(
      {
        owner_user_id: user.id,
        company_key: key,
        company_name: companyName,
        settings,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_user_id,company_key" }
    );
    if (error) return jsonWithCors(request, { error: "Settings could not be saved." }, { status: 503 });
    return jsonWithCors(request, { settings });
  } catch {
    return jsonWithCors(request, { error: "Settings could not be saved." }, { status: 500 });
  }
}
