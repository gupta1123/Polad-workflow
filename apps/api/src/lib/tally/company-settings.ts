export type CompanySettings = {
  duplicateRules: { nearbyDays: number; narrationMinLength: number; narrationRule: boolean };
  voucherTypes: { payment: string; receipt: string; contra: string; journal: string };
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  duplicateRules: { nearbyDays: 20, narrationMinLength: 12, narrationRule: true },
  voucherTypes: { payment: "Payment", receipt: "Receipt", contra: "Contra", journal: "Journal" },
};

export function companySettingsKey(companyName: string | null | undefined) {
  return String(companyName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function whole(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

function voucherTypeName(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return text.length > 0 && text.length <= 120 ? text : fallback;
}

/** Any stored shape (missing, partial, malformed) becomes a complete, in-range settings object. */
export function normalizeCompanySettings(raw: unknown): CompanySettings {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rules = source.duplicateRules && typeof source.duplicateRules === "object" ? (source.duplicateRules as Record<string, unknown>) : {};
  const types = source.voucherTypes && typeof source.voucherTypes === "object" ? (source.voucherTypes as Record<string, unknown>) : {};
  const defaults = DEFAULT_COMPANY_SETTINGS;
  return {
    duplicateRules: {
      nearbyDays: whole(rules.nearbyDays, 0, 60, defaults.duplicateRules.nearbyDays),
      narrationMinLength: whole(rules.narrationMinLength, 8, 40, defaults.duplicateRules.narrationMinLength),
      narrationRule: rules.narrationRule === false ? false : true,
    },
    voucherTypes: {
      payment: voucherTypeName(types.payment, defaults.voucherTypes.payment),
      receipt: voucherTypeName(types.receipt, defaults.voucherTypes.receipt),
      contra: voucherTypeName(types.contra, defaults.voucherTypes.contra),
      journal: voucherTypeName(types.journal, defaults.voucherTypes.journal),
    },
  };
}

/**
 * Never throws and never blocks a check or a post: a company with no row, an
 * unapplied migration, or a database error all yield the built-in defaults.
 */
export async function loadCompanySettings(
  // Structural type so any Supabase client (admin or test double) is accepted.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
  ownerUserId: string,
  companyName: string | null | undefined
): Promise<CompanySettings> {
  const key = companySettingsKey(companyName);
  if (!key) return DEFAULT_COMPANY_SETTINGS;
  try {
    const { data, error } = await supabase
      .from("tally_company_settings")
      .select("settings")
      .eq("owner_user_id", ownerUserId)
      .eq("company_key", key)
      .maybeSingle();
    if (error || !data) return DEFAULT_COMPANY_SETTINGS;
    return normalizeCompanySettings((data as { settings?: unknown }).settings);
  } catch {
    return DEFAULT_COMPANY_SETTINGS;
  }
}

/** The configured name for a voucher type the app would otherwise hard-code. */
export function configuredVoucherType(settings: CompanySettings, voucherType: string) {
  const key = voucherType.trim().toLowerCase();
  if (key === "payment") return settings.voucherTypes.payment;
  if (key === "receipt") return settings.voucherTypes.receipt;
  if (key === "contra") return settings.voucherTypes.contra;
  if (key === "journal") return settings.voucherTypes.journal;
  return voucherType;
}
