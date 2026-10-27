import test from "node:test";
import assert from "node:assert/strict";
import {
  companySettingsKey,
  configuredVoucherType,
  DEFAULT_COMPANY_SETTINGS,
  loadCompanySettings,
  normalizeCompanySettings,
} from "./company-settings.ts";

const fakeSupabase = (result) => ({
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => result() }) }) }) }),
});

test("a company with no settings gets the defaults, including a 20 day nearby window", () => {
  for (const raw of [undefined, null, {}, "x", [], 5]) {
    assert.deepEqual(normalizeCompanySettings(raw), DEFAULT_COMPANY_SETTINGS);
  }
  assert.equal(DEFAULT_COMPANY_SETTINGS.duplicateRules.nearbyDays, 20);
});

test("stored values are kept when valid and replaced by defaults when malformed or out of range", () => {
  const settings = normalizeCompanySettings({
    duplicateRules: { nearbyDays: "7", narrationMinLength: 9999, narrationRule: false },
    voucherTypes: { payment: "  Bank   Payment ", receipt: "", contra: 42 },
  });
  assert.equal(settings.duplicateRules.nearbyDays, 7);
  assert.equal(settings.duplicateRules.narrationMinLength, 12);
  assert.equal(settings.duplicateRules.narrationRule, false);
  assert.equal(settings.voucherTypes.payment, "Bank Payment");
  assert.equal(settings.voucherTypes.receipt, "Receipt");
  assert.equal(settings.voucherTypes.contra, "Contra");
  assert.equal(normalizeCompanySettings({ duplicateRules: { nearbyDays: 0 } }).duplicateRules.nearbyDays, 0);
  assert.equal(normalizeCompanySettings({ duplicateRules: { nearbyDays: 61 } }).duplicateRules.nearbyDays, 20);
});

test("loading settings never fails: no row, a missing table or a thrown error all give the defaults", async () => {
  assert.deepEqual(await loadCompanySettings(fakeSupabase(() => ({ data: null, error: null })), "u", "Acme Ltd"), DEFAULT_COMPANY_SETTINGS);
  assert.deepEqual(await loadCompanySettings(fakeSupabase(() => ({ data: null, error: { code: "42P01" } })), "u", "Acme Ltd"), DEFAULT_COMPANY_SETTINGS);
  assert.deepEqual(await loadCompanySettings(fakeSupabase(() => { throw new Error("boom"); }), "u", "Acme Ltd"), DEFAULT_COMPANY_SETTINGS);
  assert.deepEqual(await loadCompanySettings(fakeSupabase(() => ({ data: null, error: null })), "u", ""), DEFAULT_COMPANY_SETTINGS);
  const stored = await loadCompanySettings(fakeSupabase(() => ({ data: { settings: { voucherTypes: { payment: "Bank Payment" } } }, error: null })), "u", "Acme Ltd");
  assert.equal(stored.voucherTypes.payment, "Bank Payment");
  assert.equal(stored.duplicateRules.nearbyDays, 20);
});

test("company names are keyed case- and spacing-insensitively and voucher types map to the configured name", () => {
  assert.equal(companySettingsKey("  Bhagyalaxmi   Rolling Mill Pvt. Ltd. (2026-2027) "), "bhagyalaxmi rolling mill pvt. ltd. (2026-2027)");
  const settings = normalizeCompanySettings({ voucherTypes: { payment: "Bank Payment" } });
  assert.equal(configuredVoucherType(settings, "Payment"), "Bank Payment");
  assert.equal(configuredVoucherType(settings, "receipt"), "Receipt");
  assert.equal(configuredVoucherType(settings, "Sales"), "Sales");
});
