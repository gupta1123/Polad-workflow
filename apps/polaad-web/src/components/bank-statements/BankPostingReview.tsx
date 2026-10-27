"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { comparePostingVoucher, type ReviewStatement } from "@/lib/bank-posting-review";
import type { PostingMatch } from "@/lib/statement-bank-book";

type Props = {
  statement: ReviewStatement; title: string; label: string; reason: string;
  matches: Array<Partial<PostingMatch>>; confirmed: boolean; held: boolean;
  checkedAt?: string | null; checkFailed?: boolean; canRecheck: boolean; busy: boolean;
  notice?: string | null;
  ledgers: string[]; onRecheck: (ledgerName?: string) => void; onClose: () => void; onNext: () => void; hasNext: boolean;
};

const longDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : value;

export function BankPostingReview(props: Props) {
  const [editingLedger, setEditingLedger] = useState(false);
  const [ledgerName, setLedgerName] = useState(props.statement.ledger);
  const [search, setSearch] = useState("");
  const filteredLedgers = props.ledgers.filter(name => name !== props.statement.bank && name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button aria-label="Close Tally entry details" className="absolute inset-0 cursor-default" onClick={props.onClose} type="button" />
      <aside role="dialog" aria-modal="true" aria-label="Tally entry details" className="relative z-10 flex h-full w-full max-w-[720px] flex-col border-l border-[#aebfca] bg-white shadow-2xl">
        <header className="border-b border-[#b8cad5]">
          <div className="flex min-h-8 items-center justify-between gap-2 bg-[#d8eaf4] px-4 py-1 text-[#27485d]">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.12em]">Tally Entry Check</span>
            <button aria-label="Close" autoFocus className="inline-flex h-6 w-6 items-center justify-center transition hover:bg-white/60" onClick={props.onClose} title="Close" type="button"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="bg-white px-4 py-2.5">
            <h2 className="text-[15px] font-extrabold leading-5 text-[#171717]">{props.title}</h2>
            <p className="mt-1 text-[9px] font-bold leading-4 text-[#61788a]">{longDate(props.statement.date)} · {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(props.statement.amount)}</p>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <section className={`flex items-start gap-2.5 border-b px-4 py-3 ${props.confirmed ? "border-sky-100 bg-sky-50" : "border-amber-100 bg-amber-50"}`}>
            {props.confirmed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}
            <div className="min-w-0">
              <p className={`text-[10px] font-extrabold uppercase tracking-wide ${props.confirmed ? "text-sky-900" : "text-amber-900"}`}>{props.label}</p>
              <p className="mt-0.5 text-xs font-semibold leading-5 text-[#3d352c]">{props.reason}</p>
              {props.notice ? <p role="status" aria-live="polite" className="mt-2 rounded-md border border-[#ddd3c5] bg-white p-2 text-xs leading-5">{props.notice}</p> : null}
            </div>
          </section>
          <section className="px-4 py-3">
            {props.checkFailed ? <p className="mb-2 text-xs font-semibold text-amber-800">The latest check failed. Showing the last saved voucher details.</p> : null}
            {props.matches.length ? props.matches.map((match, index) => {
              const comparison = comparePostingVoucher(props.statement, match);
              const narration = comparison.find(field => field.label === "Narration");
              const rest = comparison.filter(field => field.label !== "Narration");
              return <div key={`${match.masterId || match.voucherNumber || index}`} className={`overflow-hidden rounded-lg border border-[#e5ddd0] bg-white ${index ? "mt-3" : ""}`}>
                <div className="flex items-center justify-between gap-2 border-b border-[#e8e1d7] bg-[#f8fbfc] px-3 py-2">
                  <h3 className="text-xs font-extrabold text-[#1a1a1a]">{match.voucherNumber ? `Voucher ${match.voucherNumber}` : `Possible voucher ${index + 1}`}{match.voucherType ? ` · ${match.voucherType}` : ""}</h3>
                </div>
                <div className="grid grid-cols-[104px_1fr_1fr] gap-x-3 border-b border-[#e8e1d7] px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-wide text-slate-400"><span>Field</span><span>Statement</span><span>Tally</span></div>
                <dl className="text-xs">
                  {rest.map(field => <div key={field.label} className={`grid grid-cols-[104px_1fr_1fr] gap-x-3 border-b border-[#f1ece3] px-3 py-2 ${field.state === "different" ? "bg-amber-50" : ""}`}>
                    <dt className="font-semibold text-slate-500">{field.label}</dt>
                    <dd className="break-words font-extrabold text-[#1a1a1a]">{field.statement}</dd>
                    <dd className={`flex items-start gap-1.5 break-words font-extrabold ${field.state === "different" ? "text-amber-900" : !field.tally || field.state === "unavailable" ? "font-semibold text-slate-400" : "text-[#1a1a1a]"}`}>
                      {field.state === "match" ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" aria-label="Matches" /> : field.state === "different" ? <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1 text-[8px] font-extrabold uppercase text-amber-800">Differs</span> : null}
                      <span>{field.tally || "-"}</span>
                    </dd>
                  </div>)}
                  {narration ? <div className={`px-3 py-2 ${narration.state === "different" ? "bg-amber-50" : ""}`}>
                    <dt className="font-semibold text-slate-500">Narration</dt>
                    <dd className="mt-1 break-words font-extrabold text-[#1a1a1a]">{narration.statement}</dd>
                    <dd className={`mt-1 flex items-start gap-1.5 break-words font-extrabold ${narration.tally ? "text-[#1a1a1a]" : "font-semibold text-slate-400"}`}>
                      {narration.state === "match" ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" aria-label="Matches" /> : narration.state === "different" ? <span className="mt-0.5 shrink-0 rounded bg-amber-100 px-1 text-[8px] font-extrabold uppercase text-amber-800">Differs</span> : null}
                      <span>{narration.tally || "-"}</span>
                    </dd>
                  </div> : null}
                </dl>
              </div>;
            }) : <div className="rounded-lg border border-[#e5ddd0] bg-white px-3 py-2.5 text-xs">
              <dl className="grid gap-2.5 sm:grid-cols-2">
                {[["Selected ledger", props.statement.ledger || "Not selected"], ["Bank ledger", props.statement.bank], ["Bank reference / UTR", props.statement.reference || "-"], ["Payment / receipt", props.statement.direction === "incoming" ? "Receipt" : "Payment"]].map(([label, value]) => <div key={label}><dt className="font-semibold text-slate-500">{label}</dt><dd className="break-words font-extrabold">{value}</dd></div>)}
              </dl>
            </div>}
          </section>
          {!props.confirmed && props.canRecheck ? <section className="border-t border-[#e5ddd0] bg-white px-4 py-3">
            <h3 className="text-xs font-extrabold text-[#1a1a1a]">Next step</h3>
            
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" disabled={props.busy} onClick={() => props.onRecheck()}>{props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Recheck this entry</Button>
              {props.held ? <Button variant="outline" disabled={props.busy} onClick={() => setEditingLedger(!editingLedger)}>Correct selected ledger</Button> : null}
            </div>
            {editingLedger ? <div className="mt-4 space-y-3 rounded-lg bg-[#faf8f4] p-3">
              <label className="block text-sm font-semibold" htmlFor="review-ledger-search">Find a ledger in this company</label>
              <input id="review-ledger-search" type="search" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-lg border border-[#ddd3c5] bg-white px-3 py-2 text-sm" placeholder="Search ledgers" disabled={props.busy} />
              <label className="sr-only" htmlFor="review-ledger-selection">Corrected selected ledger</label>
              <select id="review-ledger-selection" value={ledgerName} onChange={event => setLedgerName(event.target.value)} className="w-full rounded-lg border border-[#ddd3c5] bg-white px-3 py-2 text-sm" disabled={props.busy}>
                <option value={props.statement.ledger}>{props.statement.ledger || "Choose a ledger"}</option>
                {filteredLedgers.filter(name => name !== props.statement.ledger).map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <p className="text-xs leading-5 text-slate-600">This changes the selected ledger for this held entry and checks Tally again. It does not edit or create a Tally voucher.</p>
              <Button disabled={props.busy || !ledgerName || ledgerName === props.statement.ledger || !props.ledgers.includes(ledgerName)} onClick={() => props.onRecheck(ledgerName)}>{props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Save ledger &amp; recheck</Button>
            </div> : null}
            
          </section> : null}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-[#e5ddd0] px-5 py-3">
          <span />
          <Button onClick={props.hasNext ? props.onNext : props.onClose}>{props.hasNext ? "Next entry" : "Close"}</Button>
        </footer>
      </aside>
    </div>
  );
}
