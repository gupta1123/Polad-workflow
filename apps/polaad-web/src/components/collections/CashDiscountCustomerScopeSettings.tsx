"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, TriangleAlert, X } from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { runCashDiscountLiveRequest } from "@/lib/cash-discount-live";
import { readCustomerScopeMasters } from "@/lib/tally-customer-scope-masters";

type Scope = {
  mode: "automatic" | "custom" | "strict";
  selectedGroupNames: string[];
  includeNestedGroups: boolean;
  detectSalesLinkedExceptions: boolean;
  excludedGroupNames: string[];
  excludedLedgerNames: string[];
};

type Master = { name: string; parent: string | null };

const DEFAULT_SCOPE: Scope = {
  mode: "automatic",
  selectedGroupNames: ["Sundry Debtors"],
  includeNestedGroups: true,
  detectSalesLinkedExceptions: true,
  excludedGroupNames: [],
  excludedLedgerNames: [],
};

function key(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  return payload.error || `Request failed with status ${response.status}`;
}

function withMode(scope: Scope, recommended: boolean): Scope {
  return { ...scope, mode: recommended ? "automatic" : scope.detectSalesLinkedExceptions ? "custom" : "strict" };
}

export function CashDiscountCustomerScopeSettings({
  connectionId,
  companyName,
}: {
  connectionId: string;
  companyName: string;
}) {
  const [groups, setGroups] = useState<Master[]>([]);
  const [ledgers, setLedgers] = useState<Master[]>([]);
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [ledgerPick, setLedgerPick] = useState("");
  const savedJson = useRef("");
  const recommended = scope.mode === "automatic";

  const readSyncedMasters = useCallback(async () => {
    if (!connectionId) return;
    const params = new URLSearchParams({ type: "ledger", all: "true" });
    if (companyName) params.set("companyName", companyName);
    const ledgerResponse = await apiFetch(`/api/tally/connections/${connectionId}/masters?${params}`, { cache: "no-store" });
    if (!ledgerResponse.ok) throw new Error(await readError(ledgerResponse));
    const ledgerPayload = (await ledgerResponse.json()) as { masters?: Array<{ name: string; parent: string | null }> };
    const groupParams = new URLSearchParams({ type: "group", all: "true" });
    if (companyName) groupParams.set("companyName", companyName);
    const groupResponse = await apiFetch(`/api/tally/connections/${connectionId}/masters?${groupParams}`, { cache: "no-store" });
    if (!groupResponse.ok) throw new Error(await readError(groupResponse));
    const groupPayload = (await groupResponse.json()) as { masters?: Array<{ name: string; parent: string | null }> };
    const masters = readCustomerScopeMasters({
      masters: { groups: groupPayload.masters ?? [], ledgers: ledgerPayload.masters ?? [] },
    });
    setGroups(masters.groups);
    setLedgers(masters.ledgers);
  }, [connectionId, companyName]);

  const refreshFromTally = useCallback(async () => {
    if (!connectionId || !companyName) return;
    setRefreshing(true);
    try {
      await runCashDiscountLiveRequest({
        connectionId,
        companyName,
        operation: "ledger_masters",
        payload: { requestedMasterTypes: ["ledger", "group"], persistSnapshot: true },
        onProgress: (message) => setNotice(message),
      });
      await readSyncedMasters();
      setNotice("Masters refreshed from Tally.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not refresh masters from Tally.");
    } finally {
      setRefreshing(false);
    }
  }, [connectionId, companyName, readSyncedMasters]);

  useEffect(() => {
    if (!connectionId || !companyName) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotice("");
    const params = new URLSearchParams({ connectionId, companyName });
    void apiFetch(`/api/settings/cash-discount-customer-scope?${params}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 409) {
          if (!cancelled) setNotice("Database setup is required before this can be saved (migration 202608160001). The Sundry Debtors default applies meanwhile.");
          return DEFAULT_SCOPE;
        }
        if (!response.ok) throw new Error(await readError(response));
        return ((await response.json()) as { settings?: Scope }).settings ?? DEFAULT_SCOPE;
      })
      .then((loaded) => {
        if (cancelled) return;
        savedJson.current = JSON.stringify(loaded);
        setScope(loaded);
      })
      .catch((error) => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Could not load the customer scope.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    void readSyncedMasters().catch((error) => {
      if (!cancelled) setNotice(error instanceof Error ? error.message : "Could not load synced masters.");
    });
    return () => {
      cancelled = true;
    };
  }, [connectionId, companyName, readSyncedMasters]);

  useEffect(() => {
    if (loading || !connectionId || !companyName) return;
    const json = JSON.stringify(scope);
    if (json === savedJson.current || scope.selectedGroupNames.length === 0) return;
    const timer = window.setTimeout(() => {
      setStatus("saving");
      void apiFetch("/api/settings/cash-discount-customer-scope", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, companyName, settings: scope }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(await readError(response));
          savedJson.current = json;
          setStatus("saved");
        })
        .catch((error) => {
          setStatus("");
          setNotice(error instanceof Error ? error.message : "Could not save the customer scope.");
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [scope, loading, connectionId, companyName]);

  function update(patch: Partial<Scope>, nextRecommended = recommended) {
    setNotice("");
    setScope((current) => withMode({ ...current, ...patch }, nextRecommended));
  }

  function toggleGroup(name: string) {
    const exists = scope.selectedGroupNames.some((item) => key(item) === key(name));
    update({
      selectedGroupNames: exists
        ? scope.selectedGroupNames.filter((item) => key(item) !== key(name))
        : [...scope.selectedGroupNames, name],
    });
  }

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const customerLike = (group: Master) => /debtor|receivable|customer|dealer|distributor/i.test(`${group.name} ${group.parent || ""}`);
    const selected = new Set(scope.selectedGroupNames.map(key));
    return groups
      .filter((group) => (needle ? `${group.name} ${group.parent || ""}`.toLowerCase().includes(needle) : customerLike(group) || selected.has(key(group.name))))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 300);
  }, [groups, query, scope.selectedGroupNames]);

  const summary = [
    scope.selectedGroupNames.join(", ") || "No group",
    scope.detectSalesLinkedExceptions ? "verified customers outside these groups" : "these groups only",
    scope.excludedLedgerNames.length ? `${scope.excludedLedgerNames.length} ledgers excluded` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const disabled = loading || !connectionId || !companyName;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e5ddd0] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-[#1a1a1a]">Customers for cash discounts</h3>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              Which Tally ledgers count as customers for cash discounts. Saved per Tally company, automatically.
            </p>
            <p className="mt-2 text-[11px] font-semibold text-slate-500">Scans: {summary}</p>
          </div>
          <span className="inline-flex h-7 items-center rounded-full border border-[#e5ddd0] bg-[#faf8f4] px-3 text-[11px] font-bold text-slate-500">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Auto-save on"}
          </span>
        </div>
        {notice ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}
          </p>
        ) : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            { value: true, title: "Recommended", text: "Sundry Debtors and all its subgroups." },
            { value: false, title: "Choose groups", text: "For companies that keep customers in their own Tally groups." },
          ].map((option) => {
            const active = recommended === option.value;
            return (
              <button
                className={`rounded-xl border px-4 py-3 text-left transition ${active ? "border-[#2d2d2d] bg-[#faf8f4]" : "border-[#e5ddd0] hover:bg-[#faf8f4]"}`}
                disabled={disabled}
                key={option.title}
                onClick={() => (option.value ? update({ selectedGroupNames: ["Sundry Debtors"], includeNestedGroups: true }, true) : update({}, false))}
                type="button"
              >
                <span className="text-xs font-bold text-[#1a1a1a]">{option.title}</span>
                <span className="mt-1 block text-[11px] text-slate-500">{option.text}</span>
              </button>
            );
          })}
        </div>
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-4">
          <span className="text-xs font-semibold text-[#1a1a1a]">
            Include verified customers outside these groups
            <span className="mt-0.5 block text-[11px] font-normal text-slate-500">A ledger elsewhere in Tally counts only when its open bill comes from a real Sales voucher.</span>
          </span>
          <input
            checked={scope.detectSalesLinkedExceptions}
            className="h-4 w-4 accent-[#2d2d2d]"
            disabled={disabled}
            onChange={(event) => update({ detectSalesLinkedExceptions: event.target.checked })}
            type="checkbox"
          />
        </label>
        {!recommended ? (
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-4">
            <span className="text-xs font-semibold text-[#1a1a1a]">Include nested subgroups</span>
            <input
              checked={scope.includeNestedGroups}
              className="h-4 w-4 accent-[#2d2d2d]"
              disabled={disabled}
              onChange={(event) => update({ includeNestedGroups: event.target.checked })}
              type="checkbox"
            />
          </label>
        ) : null}
      </div>

      {!recommended ? (
        <div className="rounded-2xl border border-[#e5ddd0] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-[#1a1a1a]">Customer groups</h3>
            <div className="flex items-center gap-2">
              <input
                className="h-9 w-44 rounded-xl border border-[#e5ddd0] bg-white px-3 text-xs outline-none placeholder:text-slate-400 focus:border-amber-500"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search groups…"
                value={query}
              />
              <button
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#e5ddd0] bg-white px-3 text-xs font-bold text-[#5a5046] hover:bg-[#faf8f4] disabled:opacity-50"
                disabled={disabled || refreshing}
                onClick={() => void refreshFromTally()}
                type="button"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Refresh from Tally
              </button>
            </div>
          </div>
          <div className="mt-3 max-h-[320px] space-y-1 overflow-y-auto">
            {loading ? (
              <p className="py-6 text-center text-xs text-slate-400">Loading groups…</p>
            ) : visibleGroups.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No groups found. Sync masters or refresh from Tally.</p>
            ) : (
              visibleGroups.map((group) => {
                const selected = scope.selectedGroupNames.some((name) => key(name) === key(group.name));
                return (
                  <label className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 ${selected ? "border-[#2d2d2d] bg-[#faf8f4]" : "border-[#f0ece4] hover:bg-[#faf8f4]"}`} key={group.name}>
                    <input
                      checked={selected}
                      className="h-4 w-4 accent-[#2d2d2d]"
                      disabled={disabled}
                      onChange={() => toggleGroup(group.name)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-[#1a1a1a]">{group.name}</span>
                      <span className="block truncate text-[11px] text-slate-400">Under {group.parent || "Primary"}</span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#e5ddd0] bg-white p-5 shadow-sm">
        <h3 className="text-sm font-extrabold text-[#1a1a1a]">Excluded ledgers</h3>
        <p className="mt-1 text-xs text-slate-500">Never treated as customers, even inside the groups above.</p>
        <div className="mt-3 flex max-w-md items-center gap-2">
          <select
            className="h-9 min-w-0 flex-1 rounded-xl border border-[#e5ddd0] bg-white px-3 text-xs font-semibold outline-none focus:border-amber-500"
            disabled={disabled}
            onChange={(event) => setLedgerPick(event.target.value)}
            value={ledgerPick}
          >
            <option value="">Add a ledger to exclude…</option>
            {ledgers
              .filter((ledger) => !scope.excludedLedgerNames.some((item) => key(item) === key(ledger.name)))
              .sort((left, right) => left.name.localeCompare(right.name))
              .slice(0, 2000)
              .map((ledger) => (
                <option key={ledger.name} value={ledger.name}>
                  {ledger.name} — {ledger.parent || "Primary"}
                </option>
              ))}
          </select>
          <button
            className="inline-flex h-9 items-center rounded-xl bg-[#2d2d2d] px-4 text-xs font-bold text-white disabled:opacity-50"
            disabled={disabled || !ledgerPick}
            onClick={() => {
              if (ledgerPick) {
                update({ excludedLedgerNames: [...scope.excludedLedgerNames, ledgerPick] });
                setLedgerPick("");
              }
            }}
            type="button"
          >
            Add
          </button>
        </div>
        {scope.excludedLedgerNames.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {scope.excludedLedgerNames.map((name) => (
              <span className="inline-flex items-center gap-1 rounded-lg border border-[#e5ddd0] bg-[#faf8f4] py-1 pl-2.5 pr-1 text-xs font-semibold text-[#1a1a1a]" key={name}>
                {name}
                <button
                  aria-label={`Stop excluding ${name}`}
                  className="rounded p-0.5 text-slate-400 hover:bg-[#ede6d9] hover:text-red-700"
                  onClick={() => update({ excludedLedgerNames: scope.excludedLedgerNames.filter((item) => item !== name) })}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-slate-400">No ledgers excluded.</p>
        )}
      </div>
      {refreshing ? <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading masters from Tally…</p> : null}
    </div>
  );
}
