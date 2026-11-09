import { createHash } from "node:crypto";

// CD-only scan cache ("customer dues lite").
//
// Scope: cash_discount_scan snapshots only. Bank operations
// (bank_ledgers, ledger_masters, verify/match_bank_statement,
// fetch_customer_open_bills) never read or write this cache, so the bank
// statement flow is unaffected by construction.
//
// Keyed by connector installation + company identity + financial year +
// normalized customer scope. Entries expire after TTL and the map is
// bounded. Only complete scans are stored; partial scans are never served
// from cache (a `resume` request reuses the cached per-ledger buckets for
// ledgers already completed and live-reads the rest).

export const CASH_DISCOUNT_SCAN_CACHE_TTL_MS = 5 * 60_000;
export const CASH_DISCOUNT_SCAN_CACHE_MAX_ENTRIES = 4;

function normalizedText(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizedNames(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((item) => String(item ?? "").trim().slice(0, 240))
    .filter((name) => name.length > 0)
    .map((name) => normalizedText(name))
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort()
    .slice(0, 200);
}

export function normalizeCashDiscountScanScope(scope) {
  const record = scope && typeof scope === "object" ? scope : {};
  return {
    mode: record.mode === "custom" || record.mode === "strict" ? record.mode : "automatic",
    selectedGroupNames: normalizedNames(record.selectedGroupNames).length > 0
      ? normalizedNames(record.selectedGroupNames)
      : ["sundry debtors"],
    includeNestedGroups: record.includeNestedGroups !== false,
    detectSalesLinkedExceptions:
      record.mode !== "strict" && record.detectSalesLinkedExceptions !== false,
    excludedGroupNames: normalizedNames(record.excludedGroupNames),
    excludedLedgerNames: normalizedNames(record.excludedLedgerNames),
  };
}

export function buildCashDiscountScanKey({ installationId, companyGuid, companyName, financialYear, scope }) {
  const fingerprint = JSON.stringify({
    v: 1,
    installationId: String(installationId || ""),
    companyGuid: String(companyGuid || ""),
    companyName: normalizedText(companyName),
    financialYear: String(financialYear || "").trim() || null,
    scope: normalizeCashDiscountScanScope(scope),
  });
  return `cd-scan:${createHash("sha256").update(fingerprint).digest("hex")}`;
}

export function createCashDiscountScanCache({ ttlMs = CASH_DISCOUNT_SCAN_CACHE_TTL_MS, maxEntries = CASH_DISCOUNT_SCAN_CACHE_MAX_ENTRIES, now = Date.now } = {}) {
  const entries = new Map();
  const isFresh = (entry) => entry && now() - entry.storedAt <= ttlMs;
  const evictOldest = () => {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  };
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry || !isFresh(entry)) {
        if (entry) entries.delete(key);
        return null;
      }
      return structuredClone(entry.snapshot);
    },
    set(key, snapshot, meta = {}) {
      if (!key || !snapshot || typeof snapshot !== "object") return false;
      if (snapshot?.scanSummary?.complete !== true) return false;
      if (entries.has(key)) entries.delete(key);
      while (entries.size >= maxEntries) evictOldest();
      entries.set(key, {
        snapshot: structuredClone(snapshot),
        storedAt: now(),
        meta: {
          installationId: String(meta.installationId || ""),
          companyGuid: String(meta.companyGuid || ""),
          companyName: normalizedText(meta.companyName),
        },
      });
      return true;
    },
    // Drop every cached scan for one company (called after a debit-note
    // write). Empty segments act as wildcards so callers can pass whatever
    // identity they have.
    invalidateCompany({ installationId, companyGuid, companyName } = {}) {
      const wantInstallation = String(installationId || "");
      const wantGuid = String(companyGuid || "");
      const wantName = normalizedText(companyName);
      let removed = 0;
      for (const [key, entry] of [...entries]) {
        const meta = entry?.meta || {};
        const installationMatch = !wantInstallation || meta.installationId === wantInstallation || !meta.installationId;
        const guidMatch = !wantGuid || meta.companyGuid === wantGuid || !meta.companyGuid;
        const nameMatch = !wantName || meta.companyName === wantName || !meta.companyName;
        if (installationMatch && (wantGuid ? guidMatch : nameMatch)) {
          entries.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
    clear() {
      entries.clear();
    },
    size() {
      for (const [key, entry] of [...entries]) {
        if (!isFresh(entry)) entries.delete(key);
      }
      return entries.size;
    },
  };
}
