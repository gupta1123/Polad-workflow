import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCashDiscountScanKey,
  createCashDiscountScanCache,
  normalizeCashDiscountScanScope,
} from "./cash-discount-scan-cache.mjs";

const completeSnapshot = (extra = {}) => ({
  companyName: "Nyx",
  ledgers: [{ name: "Party A" }],
  openBillsResult: { success: true, result: { ledgerNames: ["Party A"], byLedger: {} } },
  scanSummary: { complete: true, completed: 1, total: 1 },
  ...extra,
});

describe("cash-discount scan cache (CD-only)", () => {
  it("builds stable keys regardless of group order or casing", () => {
    const a = buildCashDiscountScanKey({
      installationId: "inst-1", companyGuid: "g-1", companyName: "Nyx",
      financialYear: "2026-27",
      scope: { selectedGroupNames: ["Sundry Debtors", "Sundry Creditors"] },
    });
    const b = buildCashDiscountScanKey({
      installationId: "inst-1", companyGuid: "g-1", companyName: "  nyx ",
      financialYear: "2026-27",
      scope: { selectedGroupNames: ["sundry creditors", "SUNDRY debtors"] },
    });
    assert.equal(a, b);
  });

  it("defaults an empty scope to Sundry Debtors", () => {
    assert.deepEqual(normalizeCashDiscountScanScope({}).selectedGroupNames, ["sundry debtors"]);
    assert.deepEqual(normalizeCashDiscountScanScope(null).selectedGroupNames, ["sundry debtors"]);
  });

  it("stores complete scans and refuses partial ones", () => {
    const cache = createCashDiscountScanCache({ ttlMs: 60_000 });
    assert.equal(cache.set("k1", completeSnapshot()), true);
    assert.equal(cache.set("k2", completeSnapshot({ scanSummary: { complete: false } })), false);
    assert.ok(cache.get("k1"));
    assert.equal(cache.get("k2"), null);
  });

  it("expires entries after TTL", () => {
    let t = 1_000;
    const cache = createCashDiscountScanCache({ ttlMs: 5_000, now: () => t });
    cache.set("k", completeSnapshot());
    assert.ok(cache.get("k"));
    t += 5_001;
    assert.equal(cache.get("k"), null);
  });

  it("bounds entries and evicts oldest first", () => {
    const cache = createCashDiscountScanCache({ ttlMs: 60_000, maxEntries: 2 });
    cache.set("k1", completeSnapshot());
    cache.set("k2", completeSnapshot());
    cache.set("k3", completeSnapshot());
    assert.equal(cache.size(), 2);
    assert.equal(cache.get("k1"), null);
    assert.ok(cache.get("k3"));
  });

  it("invalidates by company after a debit-note write", () => {
    const cache = createCashDiscountScanCache({ ttlMs: 60_000 });
    const keyA = buildCashDiscountScanKey({ installationId: "i", companyGuid: "g-a", companyName: "Nyx", financialYear: "2026-27", scope: {} });
    const keyB = buildCashDiscountScanKey({ installationId: "i", companyGuid: "g-b", companyName: "Other", financialYear: "2026-27", scope: {} });
    cache.set(keyA, completeSnapshot({ companyName: "Nyx" }), { installationId: "i", companyGuid: "g-a", companyName: "Nyx" });
    cache.set(keyB, completeSnapshot({ companyName: "Other" }), { installationId: "i", companyGuid: "g-b", companyName: "Other" });
    assert.equal(cache.invalidateCompany({ installationId: "i", companyGuid: "g-a", companyName: "Nyx" }), 1);
    assert.equal(cache.get(keyA), null);
    assert.ok(cache.get(keyB));
  });
});
