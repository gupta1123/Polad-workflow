"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

type CompanyOption = { id: string; connectionId: string; companyName: string; financialYear?: string };
type Settings = {
  duplicateRules: { nearbyDays: number; narrationMinLength: number; narrationRule: boolean };
  voucherTypes: { payment: string; receipt: string; contra: string; journal: string };
};

const VOUCHER_FIELDS: Array<{ key: keyof Settings["voucherTypes"]; label: string }> = [
  { key: "payment", label: "Payment" },
  { key: "receipt", label: "Receipt" },
  { key: "contra", label: "Contra" },
  { key: "journal", label: "Journal" },
];

const inputClass = "h-9 w-full rounded-md border border-[#cfdbe2] bg-white px-3 text-xs font-semibold text-[#1a1a1a] outline-none focus:border-[#27485d]";

export function TallySettingsPage() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [defaults, setDefaults] = useState<Settings | null>(null);
  const [voucherTypeNames, setVoucherTypeNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const company = useMemo(() => companies.find((option) => option.id === companyId) ?? null, [companies, companyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const connections = (await (await apiFetch("/api/tally/connections", { cache: "no-store" })).json()) as { connections?: Array<{ id: string }> };
        const found: CompanyOption[] = [];
        for (const connection of connections.connections ?? []) {
          const response = await apiFetch(`/api/tally/companies?connectionId=${encodeURIComponent(connection.id)}`, { cache: "no-store" });
          if (!response.ok) continue;
          const body = (await response.json()) as { companies?: CompanyOption[] };
          for (const option of body.companies ?? []) if (!found.some((item) => item.id === option.id)) found.push(option);
        }
        if (cancelled) return;
        setCompanies(found);
        setCompanyId((current) => current || found[0]?.id || "");
      } catch {
        if (!cancelled) setMessage({ tone: "error", text: "Could not load your Tally companies." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadCompany = useCallback(async (option: CompanyOption) => {
    setMessage(null);
    setSettings(null);
    try {
      const response = await apiFetch(`/api/tally/company-settings?companyName=${encodeURIComponent(option.companyName)}`, { cache: "no-store" });
      const body = (await response.json()) as { settings: Settings; defaults: Settings };
      setSettings(body.settings);
      setDefaults(body.defaults);
    } catch {
      setMessage({ tone: "error", text: "Could not load the settings for this company." });
    }
    try {
      const response = await apiFetch(`/api/tally/connections/${encodeURIComponent(option.connectionId)}/masters?type=voucher_type&all=true&companyName=${encodeURIComponent(option.companyName)}`, { cache: "no-store" });
      const body = (await response.json()) as { masters?: Array<{ name?: string }> };
      setVoucherTypeNames(Array.from(new Set((body.masters ?? []).map((master) => String(master.name || "").trim()).filter(Boolean))).sort());
    } catch {
      setVoucherTypeNames([]);
    }
  }, []);

  useEffect(() => { if (company) void loadCompany(company); }, [company, loadCompany]);

  async function save() {
    if (!company || !settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await apiFetch("/api/tally/company-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: company.companyName, settings }),
      });
      const body = (await response.json().catch(() => ({}))) as { settings?: Settings; error?: string };
      if (!response.ok || !body.settings) throw new Error(body.error || "Settings could not be saved.");
      setSettings(body.settings);
      setMessage({ tone: "ok", text: "Saved. The next Check Tally and post use these values." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Settings could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  const setRule = (patch: Partial<Settings["duplicateRules"]>) => setSettings(current => current ? { ...current, duplicateRules: { ...current.duplicateRules, ...patch } } : current);
  const setType = (key: keyof Settings["voucherTypes"], value: string) => setSettings(current => current ? { ...current, voucherTypes: { ...current.voucherTypes, [key]: value } } : current);

  return (
    <AppShell>
      <div className="min-h-screen bg-[#faf9f6] text-[#20201c]">
        <div className="mx-auto max-w-[760px] px-4 py-8 sm:px-8">
          <h1 className="text-[15px] font-extrabold text-[#171717]">Tally Settings</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">Set per company. Changes apply to the next check or post, with no connector update.</p>

          {loading ? <div className="mt-8 flex items-center gap-2 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading companies</div> : companies.length === 0 ? (
            <p className="mt-8 text-xs font-semibold text-slate-500">No Tally company is connected yet.</p>
          ) : (
            <>
              <label className="mt-6 block text-[9px] font-extrabold uppercase tracking-[0.12em] text-[#27485d]" htmlFor="tally-settings-company">Company</label>
              <select id="tally-settings-company" className={`${inputClass} mt-1`} value={companyId} onChange={event => setCompanyId(event.target.value)}>
                {companies.map(option => <option key={option.id} value={option.id}>{option.companyName}{option.financialYear ? ` (${option.financialYear})` : ""}</option>)}
              </select>

              {settings ? (
                <>
                  <section className="mt-6 rounded-lg border border-[#e5ddd0] bg-white">
                    <div className="border-b border-[#e8e1d7] bg-[#f8fbfc] px-4 py-2 text-xs font-extrabold text-[#1a1a1a]">Voucher types</div>
                    <p className="px-4 pt-3 text-xs font-semibold text-slate-500">The names this company uses in Tally. Leave as is unless a post fails with &ldquo;Voucher Type does not exist&rdquo;.</p>
                    <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
                      {VOUCHER_FIELDS.map(field => (
                        <label key={field.key} className="block text-xs font-semibold text-slate-500">
                          {field.label}
                          <input className={`${inputClass} mt-1`} list="tally-voucher-types" maxLength={120} value={settings.voucherTypes[field.key]} onChange={event => setType(field.key, event.target.value)} />
                        </label>
                      ))}
                    </div>
                    <datalist id="tally-voucher-types">{voucherTypeNames.map(name => <option key={name} value={name} />)}</datalist>
                  </section>

                  <section className="mt-4 rounded-lg border border-[#e5ddd0] bg-white">
                    <div className="border-b border-[#e8e1d7] bg-[#f8fbfc] px-4 py-2 text-xs font-extrabold text-[#1a1a1a]">Duplicate check</div>
                    <div className="space-y-3 px-4 py-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-[#1a1a1a]">
                        <input type="checkbox" checked={settings.duplicateRules.narrationRule} onChange={event => setRule({ narrationRule: event.target.checked })} />
                        Treat a voucher with the same narration, bank, amount and party as the same entry
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-semibold text-slate-500">
                          Nearby date window (days, 0 to 60)
                          <input className={`${inputClass} mt-1`} type="number" min={0} max={60} step={1} value={settings.duplicateRules.nearbyDays} disabled={!settings.duplicateRules.narrationRule}
                            onChange={event => setRule({ nearbyDays: Number(event.target.value) })} />
                          <span className="mt-1 block text-[10px] font-semibold text-slate-400">Same narration this many days either side is held for review. 0 turns it off. Default {defaults?.duplicateRules.nearbyDays ?? 20}.</span>
                        </label>
                        <label className="block text-xs font-semibold text-slate-500">
                          Minimum narration length (8 to 40)
                          <input className={`${inputClass} mt-1`} type="number" min={8} max={40} step={1} value={settings.duplicateRules.narrationMinLength} disabled={!settings.duplicateRules.narrationRule}
                            onChange={event => setRule({ narrationMinLength: Number(event.target.value) })} />
                          <span className="mt-1 block text-[10px] font-semibold text-slate-400">Shorter text is never used to identify an entry. Default {defaults?.duplicateRules.narrationMinLength ?? 12}.</span>
                        </label>
                      </div>
                    </div>
                  </section>

                  <div className="mt-5 flex items-center gap-3">
                    <Button disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save settings</Button>
                    {defaults ? <Button variant="outline" disabled={saving} onClick={() => setSettings(defaults)}>Reset to defaults</Button> : null}
                    {message ? <span role="status" className={`text-xs font-semibold ${message.tone === "ok" ? "text-emerald-700" : "text-red-700"}`}>{message.text}</span> : null}
                  </div>
                </>
              ) : message ? <p className="mt-6 text-xs font-semibold text-red-700">{message.text}</p> : <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading settings</div>}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
