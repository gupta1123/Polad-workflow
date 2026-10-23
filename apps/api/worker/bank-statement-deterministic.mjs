export function parseAllTables(md) {
  const lines = md.split("\n");
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] || "";
    const isHeader = line.includes("|") && line.split("|").filter(Boolean).length >= 2;
    const isSep = /\|\s*:?-{2,}:?\s*\|/.test(next) || /^\s*\|?(\s*:?-+:?\s*\|)+\s*$/.test(next);
    if (isHeader && isSep) {
      const rawHeaders = line.split("|").slice(1, -1).map((c) => c.trim());
      const rawRows = [];
      const startLine = i;
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        const row = lines[i].split("|").slice(1, -1).map((c) => c.trim());
        if (row.every((c) => /^:?-+:?$/.test(c))) { i++; continue; }
        rawRows.push(row);
        i++;
      }
      if (rawHeaders.length >= 2 && rawRows.length > 0) {
        const keepIdx = rawHeaders.map((h, idx) => ({ h, idx })).filter((x) => x.h !== "").map((x) => x.idx);
        let headers = keepIdx.map((idx) => rawHeaders[idx]);
        let rows = rawRows.map((r) => keepIdx.map((idx) => r[idx] ?? ""));
        // PNB fused header fix
        const hasFused = headers.some((h) => h.toLowerCase().includes("cheque") && h.toLowerCase().includes("dr amount"));
        if (hasFused) {
          const idx = headers.findIndex((h) => h.toLowerCase().includes("cheque") && h.toLowerCase().includes("dr amount"));
          if (idx !== -1) {
            headers = [...headers.slice(0, idx), "Cheque No.", "Dr Amount", ...headers.slice(idx + 1)];
            rows = rows.map((r) => {
              const cell = r[idx] || "";
              const isAmount = /[\d,]+\.\d{2}/.test(cell) && cell !== "-";
              return [...r.slice(0, idx), "", isAmount ? cell : "", ...r.slice(idx + 1)];
            });
          }
        }
        tables.push({ headers, rows, rawHeaders, rawRows, startLine });
      }
    } else {
      i++;
    }
  }
  return tables;
}

export function isTransactionTable(t) {
  const h = t.headers.map((x) => x.toLowerCase());
  const hasDate = h.some((x) => x.includes("date"));
  const hasDesc = h.some((x) => x.includes("description") || x.includes("narration") || x.includes("particular") || x.includes("details") || x.includes("remarks"));
  const hasAmount = h.some((x) => x.includes("debit") || x.includes("credit") || x.includes("withdrawal") || x.includes("deposit") || x.includes("amount") || x.includes("balance") || x === "dr" || x === "cr");
  return hasDate && hasDesc && hasAmount;
}

export function extractBrokenTransactions(md) {
  const afterPage1 = md.split(/Page No\s*1/i)[1] || "";
  if (!afterPage1) return [];
  const re = /(?:NRTGS|NEFT|RTGS|IMPS)[\s\S]*?\d{1,2}[-/]\d{1,2}[-/]\d{2,4}[\s\S]*?Dr\./g;
  const matches = [...afterPage1.matchAll(re)];
  return matches.map((m) => {
    const txt = m[0].replace(/\s+/g, " ").trim();
    const date = (txt.match(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/) || [""])[0];
    const amounts = [...txt.matchAll(/\d{1,3}(?:,\d{2,3})+\.\d{2}/g)].map((x) => x[0]);
    const txn = (txt.match(/\b[US]\d{5,}\b/) || [""])[0];
    const bal = amounts.length >= 2 ? amounts[amounts.length - 1] : "";
    const amt = amounts.length >= 1 ? amounts[0] : "";
    const desc = txt.slice(0, 140);
    return [txn, date, desc, "-", "", amt, "", bal, ""];
  });
}

function parseDateValue(v, fallbackYear = null) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (dt.getUTCFullYear() === Number(y) && dt.getUTCMonth() === Number(m) - 1 && dt.getUTCDate() === Number(d)) return `${y.padStart(4,"0")}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  const indian = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (indian) {
    const [, d, m, yRaw] = indian;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (dt.getUTCFullYear() === Number(y) && dt.getUTCMonth() === Number(m) - 1 && dt.getUTCDate() === Number(d)) return `${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  // PDF converters sometimes append a repeated bank heading/footer to the date
  // cell (for example "02-Sep-2026 19:47:45 HDFC BANK LIMITED"). The leading
  // date is still authoritative, so accept trailing time or converter noise.
  const shortMonth = raw.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})(?:[\s-]+(\d{2,4}))?\b/);
  if (shortMonth) {
    const year = shortMonth[3]
      ? (shortMonth[3].length === 2 ? `20${shortMonth[3]}` : shortMonth[3])
      : fallbackYear;
    if (year) {
      const parsed = new Date(`${shortMonth[1]} ${shortMonth[2]} ${year} UTC`);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    }
  }
  const p = new Date(raw);
  if (!isNaN(p.getTime())) return p.toISOString().slice(0,10);
  return null;
}

function parseAmountValue(v) {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const raw = String(v).trim();
  if (!raw) return null;
  const isDR = /\bDR\.?\s*$/i.test(raw);
  const neg = /^\(.*\)$/.test(raw) || /^-/.test(raw) || isDR;
  const cleaned = raw.replace(/\b(?:DR|CR)\.?\s*$/i,"").replace(/[(),₹$€£\s]/g,"").replace(/^-/,"");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return isFinite(n) ? (neg ? -n : n) : null;
}

const HEADER_PATTERNS = [
  ["bank reference number", "reference"], ["bank reference no.", "reference"], ["bank reference no", "reference"], ["bank reference", "reference"],
  ["transaction reference number", "reference"], ["transaction reference no.", "reference"], ["transaction reference", "reference"],
  ["transaction id", "reference"], ["utr number", "reference"], ["utr no.", "reference"], ["utr no", "reference"], ["utr", "reference"],
  ["transaction date", "date"], ["tran date", "date"], ["txn date", "date"], ["post date", "date"], ["posting date", "date"], ["value date", "value_date"], ["date", "date"],
  ["transaction description", "description"], ["description / particulars", "description"], ["transaction details", "description"], ["transaction particulars", "description"], ["narration / description", "description"], ["narration", "description"], ["description", "description"], ["particulars", "description"],
  ["reference / utr", "reference"], ["reference no.", "reference"], ["reference no", "reference"], ["reference", "reference"], ["cheque number", "reference"], ["cheque no.", "reference"], ["cheque no", "reference"],
  ["txn no.", "txn_no"], ["txn no", "txn_no"], ["transaction no.", "txn_no"], ["transaction no", "txn_no"],
  ["debit amount", "debit"], ["dr amount", "debit"], ["debit (inr)", "debit"], ["withdrawal", "debit"], ["paid out", "debit"], ["debit", "debit"],
  ["credit amount", "credit"], ["cr amount", "credit"], ["credit (inr)", "credit"], ["deposit", "credit"], ["paid in", "credit"], ["credit", "credit"],
  ["to/by", "toby"], ["to / by", "toby"], ["vch type", "vchtype"], ["voucher type", "vchtype"],
  ["vch no.", "txn_no"], ["vch no", "txn_no"], ["voucher no.", "txn_no"], ["voucher no", "txn_no"],
  ["amount (inr)", "amount"], ["amount", "amount"],
  ["debit/credit", "drcr"], ["debit / credit", "drcr"], ["dr/cr", "drcr"], ["cr/dr", "drcr"], ["dr / cr", "drcr"],
  ["available balance", "balance"], ["closing balance", "balance"], ["balance (inr)", "balance"], ["balance", "balance"],
];

function headerPart(value) {
  const raw = String(value ?? "").replace(/(\S)\(/g, "$1 (").replace(/\s+/g, " ").trim();
  const lower = raw.toLowerCase();
  // Some PDF converters collapse adjacent withdrawal/deposit columns into one
  // generic amount column. Preserve that ambiguity here and infer direction
  // from the narration instead of incorrectly treating every row as a debit.
  if (lower.includes("withdrawal") && lower.includes("deposit")) return { kind: "amount", label: raw, remainder: "" };
  // AnyDoc occasionally fuses the empty cheque-number heading with the debit
  // heading. The cells below it contain the debit, so the useful semantic is
  // the amount column rather than the empty reference column.
  if (/cheque\s+no\.?\s+dr\s+amount/.test(lower)) return { kind: "debit", label: raw, remainder: "" };
  for (const [label, kind] of HEADER_PATTERNS) {
    if (lower === label) return { kind, label: raw, remainder: "" };
    if (lower.startsWith(`${label} `)) return { kind, label: raw.slice(0, label.length), remainder: raw.slice(label.length).trim() };
  }
  return { kind: null, label: raw, remainder: "" };
}

function headerScore(row) {
  const kinds = new Set(row.map((cell) => headerPart(cell).kind).filter(Boolean));
  return Number(kinds.has("date") || kinds.has("value_date")) + Number(kinds.has("description")) +
    Number(kinds.has("debit") || kinds.has("credit")) + Number(kinds.has("balance"));
}

function inferStatementYear(markdown) {
  const explicit = String(markdown).match(/(?:statement\s+(?:date|period)|page\s+period)[^\n|]*?\b(20\d{2})\b/i);
  if (explicit) return explicit[1];
  const dated = String(markdown).match(/\b\d{1,2}[\s/-]+(?:[A-Za-z]{3,9}|\d{1,2})[\s/-]+(20\d{2})\b/);
  return dated?.[1] || null;
}

function signedAmountText(value) {
  // Some banks print a negative balance as "-,20,19,31,323.90"; the sign and
  // the first digit group are separated by a stray comma.
  return String(value ?? "").replace(/(^|[\s(])-,(?=\d)/g, "$1-");
}

function strictAmount(value) {
  const raw = signedAmountText(value).replace(/\.\s+(?=\d)/g, ".").replace(/(?<=\d)\s+(?=\d)/g, "").trim();
  if (!raw || raw === "-") return null;
  const matches = raw.match(/(?:\(?-?[₹$€£]?\s*\d[\d,]*(?:\.\d+)?\)?\s*(?:DR|CR)?\.?)/gi) || [];
  if (matches.length !== 1) return null;
  return parseAmountValue(matches[0]);
}

function cellAmounts(value) {
  const raw = signedAmountText(value).replace(/\.\s+(?=\d)/g, ".").replace(/(?<=\d)\s+(?=\d)/g, "").trim();
  if (!raw || raw === "-") return [];
  return (raw.match(/\(?-?[₹$€£]?\s*\d[\d,]*(?:\.\d+)?\)?\s*(?:DR|CR)?\.?/gi) || [])
    .map(parseAmountValue)
    .filter((amount) => amount !== null);
}

function transactionAmount(value) {
  return cellAmounts(value).find((amount) => Math.abs(amount) > 0) ?? null;
}

function directionFromDescription(description) {
  const text = String(description || "").toUpperCase();
  if (/\b(?:CR|CREDIT|DEPOSIT|REFUND)\b/.test(text) || /\bFROM\b/.test(text) || /(?:NEFT|RTGS|IMPS)_IN\b/.test(text)) return "credit";
  if (/\b(?:DR|DEBIT|WITHDRAWAL|CHARGES?|COMMISSION)\b/.test(text) || /\bTO\b/.test(text) || /(?:NEFT|RTGS|IMPS)_OUT\b/.test(text)) return "debit";
  return null;
}

function normalizedTableSource(table) {
  const rawHeaders = Array.isArray(table.rawHeaders) ? [...table.rawHeaders] : [...table.headers];
  const rawRows = Array.isArray(table.rawRows) ? table.rawRows.map((row) => [...row]) : table.rows.map((row) => [...row]);
  const embeddedHeaderIndex = rawRows.findIndex((row) => headerScore(row) >= 3);
  if (headerScore(rawHeaders) < 3 && embeddedHeaderIndex >= 0) {
    return { headers: rawRows[embeddedHeaderIndex], rows: rawRows.slice(embeddedHeaderIndex + 1), recoveredHeaderRow: null };
  }
  const parts = rawHeaders.map(headerPart);
  const recoveredHeaderRow = parts.some((part) => part.remainder)
    ? parts.map((part) => part.remainder)
    : null;
  return { headers: parts.map((part) => part.kind || part.label), rows: rawRows, recoveredHeaderRow };
}

function semanticIndexes(headers) {
  const kinds = headers.map((header) => {
    const text = String(header || "").toLowerCase().trim();
    return ["date", "value_date", "description", "reference", "txn_no", "debit", "credit", "amount", "drcr", "toby", "vchtype", "balance"].includes(text)
      ? text
      : headerPart(header).kind;
  });
  const first = (kind) => kinds.indexOf(kind);
  return { kinds, date: first("date") >= 0 ? first("date") : first("value_date"), valueDate: first("value_date"), description: first("description"), reference: first("reference"), txnNo: first("txn_no"), debit: first("debit"), credit: first("credit"), amount: first("amount"), drcr: first("drcr"), toBy: first("toby"), vchType: first("vchtype"), balance: first("balance") };
}

function nearestAmount(row, index, excluded) {
  if (index < 0) return null;
  for (const distance of [0, 1, -1, 2, -2]) {
    const candidate = index + distance;
    if (candidate < 0 || candidate >= row.length || excluded.has(candidate)) continue;
    const amount = strictAmount(row[candidate]);
    if (amount !== null) return { amount: Math.abs(amount), index: candidate };
  }
  return null;
}

// A converter can fuse the "TRANSACTION TOTAL DR/CR" line into the last
// transaction row. Keep the transaction's own text and first amount only.
// The converter sometimes fuses the last transaction with the statement's totals
// block ("... Total Opening Balance Closing Balance Grand Total" with every
// total's amount in the amount cell). Keep only the transaction part.
const TOTALS_MARKER = /\s*(?:transaction total|grand total|opening balance|closing balance|\btotal\b)/i;

function hasFusedTotals(cell) {
  const text = String(cell ?? "");
  if (/transaction total/i.test(text)) return true;
  const markers = text.match(/\b(?:grand total|opening balance|closing balance|total)\b/gi) || [];
  return markers.length >= 2 && /(?:opening|closing) balance|grand total/i.test(text);
}

function stripFusedTotals(row) {
  if (!row.some(hasFusedTotals)) return row;
  return row.map((cell) => {
    const text = String(cell ?? "");
    const marker = hasFusedTotals(text) ? text.search(TOTALS_MARKER) : -1;
    if (marker > 0) return text.slice(0, marker).trim();
    const amounts = text.match(/\d[\d,]*\.\d{2}/g) || [];
    return amounts.length > 1 ? amounts[0] : text;
  });
}

function bookDirection(row, indexes) {
  const voucherType = indexes.vchType >= 0 ? String(row[indexes.vchType] ?? "") : "";
  const toBy = indexes.toBy >= 0 ? String(row[indexes.toBy] ?? "").trim() : "";
  if (/\b(?:receipt|rcpt)\b/i.test(voucherType) || /^to$/i.test(toBy)) return "credit";
  if (/\b(?:payment|pymt)\b/i.test(voucherType) || /^by$/i.test(toBy)) return "debit";
  return null;
}

function normalizeTableTransactions(table, fallbackYear, startIndex, carriedBalance = null) {
  const source = normalizedTableSource(table);
  const indexes = semanticIndexes(source.headers);
  if (indexes.date < 0 || indexes.description < 0) return [];
  const rows = source.recoveredHeaderRow ? [source.recoveredHeaderRow, ...source.rows] : source.rows;
  const output = [];
  // Layouts with a single unlabeled amount column (amount + "Available Balance
  // 123.00 CR") carry no debit/credit marker; the balance movement decides.
  const flaggedAmountColumn = indexes.debit < 0 && indexes.credit < 0 && indexes.amount >= 0 && indexes.drcr >= 0;
  const singleAmountColumn = indexes.debit < 0 && indexes.credit < 0 && indexes.balance >= 0 && !flaggedAmountColumn;
  const singleMeta = [];
  for (const rawRow of rows) {
    const row = stripFusedTotals(rawRow);
    const transactionDate = parseDateValue(row[indexes.date], fallbackYear);
    const description = String(row[indexes.description] || "").replace(/\s+/g, " ").trim();
    if (!transactionDate || !description || headerScore(row) >= 3) continue;
    const txnNo = indexes.txnNo >= 0 ? String(row[indexes.txnNo] || "").trim() : "";
    const referenceCell = indexes.reference >= 0 ? String(row[indexes.reference] || "").trim() : txnNo;
    const reference = /^(?:[-\u2013\u2014]+|n\/?a|nil|none)$/i.test(referenceCell) ? "" : referenceCell;
    const balanceCandidates = [];
    if (indexes.balance >= 0) {
      const exactBalance = cellAmounts(row[indexes.balance]).at(-1);
      if (exactBalance !== undefined) balanceCandidates.push({ amount: exactBalance, index: indexes.balance, distance: -1 });
      for (const distance of [0, 1, -1, 2, -2]) {
        const candidate = indexes.balance + distance;
        if (candidate >= 0 && candidate < row.length) {
          const amount = strictAmount(row[candidate]);
          if (amount !== null) balanceCandidates.push({ amount, index: candidate, distance: Math.abs(distance) });
        }
      }
    }
    const balanceMatch = indexes.balance >= 0
      ? balanceCandidates.sort((a, b) => a.distance - b.distance || b.index - a.index)[0] ||
        [...row].map((cell, index) => ({ amount: cellAmounts(cell).at(-1) ?? null, index })).filter((item) => item.amount !== null).at(-1) || null
      : null;
    const excluded = new Set([indexes.date, indexes.valueDate, indexes.description, indexes.reference, indexes.txnNo, balanceMatch?.index].filter((value) => value >= 0));
    const exactDebit = indexes.debit >= 0 ? transactionAmount(row[indexes.debit]) : null;
    const exactCredit = indexes.credit >= 0 ? transactionAmount(row[indexes.credit]) : null;
    let debitMatch = exactDebit !== null ? { amount: Math.abs(exactDebit), index: indexes.debit } : null;
    let creditMatch = exactCredit !== null ? { amount: Math.abs(exactCredit), index: indexes.credit } : null;
    // One "Amount" column plus a Dr/Cr flag column: the flag gives the direction.
    if (flaggedAmountColumn && !debitMatch && !creditMatch) {
      const amount = transactionAmount(row[indexes.amount]);
      const flag = String(row[indexes.drcr] ?? "").trim();
      if (amount !== null && /^(?:dr|debit|d)\b\.?$/i.test(flag)) debitMatch = { amount: Math.abs(amount), index: indexes.amount };
      else if (amount !== null && /^(?:cr|credit|c)\b\.?$/i.test(flag)) creditMatch = { amount: Math.abs(amount), index: indexes.amount };
    }
    let available = row.map((cell, index) => ({ amount: transactionAmount(cell), index }))
      .filter((item) => item.amount !== null && !excluded.has(item.index));
    // Tally-style bank books list Receipt/Payment (To/By) and put a voucher
    // number next to the amount. The voucher type decides the direction and a
    // decimal amount beats a bare integer.
    const book = bookDirection(row, indexes);
    if (book) {
      const money = available.filter((item) => /\d\.\d{1,2}\b/.test(String(row[item.index])));
      if (money.length > 0) available = money;
      if (available.length > 0) {
        const candidate = { amount: Math.abs(available[0].amount), index: available[0].index };
        debitMatch = book === "debit" ? candidate : null;
        creditMatch = book === "credit" ? candidate : null;
      }
    }
    const direction = directionFromDescription(description);
    if (!debitMatch && !creditMatch && available.length > 0) {
      if (direction) {
        const candidate = available[0];
        if (direction === "debit") debitMatch = { ...candidate, amount: Math.abs(candidate.amount) };
        else creditMatch = { ...candidate, amount: Math.abs(candidate.amount) };
      } else if (available.length === 1) {
        const candidate = available[0];
        const debitDistance = indexes.debit >= 0 ? Math.abs(candidate.index - indexes.debit) : Number.POSITIVE_INFINITY;
        const creditDistance = indexes.credit >= 0 ? Math.abs(candidate.index - indexes.credit) : Number.POSITIVE_INFINITY;
        if (creditDistance < debitDistance) creditMatch = { ...candidate, amount: Math.abs(candidate.amount) };
        else debitMatch = { ...candidate, amount: Math.abs(candidate.amount) };
      } else {
        debitMatch = nearestAmount(row, indexes.debit, excluded);
        creditMatch = nearestAmount(row, indexes.credit, new Set([...excluded, debitMatch?.index].filter((value) => value !== undefined)));
      }
    }
    const debitAmount = debitMatch?.amount > 0 ? debitMatch.amount : null;
    const creditAmount = creditMatch?.amount > 0 ? creditMatch.amount : null;
    const amountIssue = Boolean(debitAmount) === Boolean(creditAmount)
      ? (debitAmount ? "both_debit_and_credit" : "missing_debit_and_credit")
      : null;
    if (singleAmountColumn) {
      singleMeta.push({ amount: available.length === 1 ? Math.abs(available[0].amount) : null, direction });
    }
    output.push({
      row_index: startIndex + output.length + 1,
      transaction_date: transactionDate,
      value_date: indexes.valueDate >= 0 ? parseDateValue(row[indexes.valueDate], fallbackYear) || transactionDate : transactionDate,
      description,
      reference_number: reference || txnNo || null,
      debit_amount: debitAmount,
      credit_amount: creditAmount,
      balance_amount: balanceMatch?.amount ?? null,
      transaction_type: "unknown",
      category: amountIssue ? "unknown" : (creditAmount ? "receipt" : "payment"),
      counterparty_name: null,
      suggested_ledger_name: null,
      suggestion_confidence: null,
      suggestion_reason: null,
      confirmed_ledger_name: null,
      additional_charges: [],
      confidence: amountIssue ? 0.6 : 0.9,
      raw_payload: { rowNumber: startIndex + output.length + 1, source: "deterministic_anydoc_normalized", ...(amountIssue ? { amountValidationIssue: amountIssue } : {}) },
    });
  }
  if (singleAmountColumn) resolveSingleAmountDirections(output, singleMeta, carriedBalance);
  return output;
}

function applySingleAmount(row, direction, amount) {
  row.debit_amount = direction === "debit" ? amount : null;
  row.credit_amount = direction === "credit" ? amount : null;
  row.category = direction === "credit" ? "receipt" : "payment";
  row.confidence = 0.9;
  if (row.raw_payload?.amountValidationIssue) delete row.raw_payload.amountValidationIssue;
}

function resolveSingleAmountDirections(output, metas, carriedBalance = null) {
  const unresolved = [];
  output.forEach((row, index) => {
    const meta = metas[index];
    const previous = index > 0 ? output[index - 1].balance_amount : carriedBalance;
    const balance = row.balance_amount;
    if (previous !== null && balance !== null && previous !== undefined) {
      const delta = Math.round((balance - previous) * 100) / 100;
      const moved = Math.abs(delta);
      if (moved > 0 && (meta.amount === null || Math.abs(meta.amount - moved) <= 0.01)) {
        applySingleAmount(row, delta > 0 ? "credit" : "debit", moved);
        row.raw_payload.directionSource = "balance_movement";
        return;
      }
      if (moved > 0) return; // amount disagrees with the balance: leave for validation
    }
    unresolved.push(index);
  });
  if (!unresolved.length) return;
  const credits = output.filter((row) => row.raw_payload?.directionSource === "balance_movement" && row.credit_amount).length;
  const debits = output.filter((row) => row.raw_payload?.directionSource === "balance_movement" && row.debit_amount).length;
  for (const index of unresolved) {
    const meta = metas[index];
    if (meta.amount === null) continue;
    const direction = meta.direction || (credits >= debits ? "credit" : "debit");
    applySingleAmount(output[index], direction, meta.amount);
    output[index].raw_payload.directionSource = meta.direction ? "description" : "majority_of_statement";
    if (!meta.direction) output[index].confidence = 0.7;
  }
}

export function deterministicTransactionsFromAnydoc(markdown) {
  const all = parseAllTables(markdown);
  const rawTx = all.filter((table) => isTransactionTable(table) || table.rawRows?.some((row) => headerScore(row) >= 3));
  const broken = extractBrokenTransactions(markdown);
  // A prose-like continuation after a page break has lost its column
  // boundaries. Do not publish a partial deterministic result: the caller can
  // recover those pages with the existing page-recovery path.
  if (broken.length) return null;
  // A converter can fuse a whole page of rows into one table row, leaving one
  // cell with many dates. A transaction has at most a booking and a value date,
  // so more than two in a cell means the rows were not separated; publishing
  // that as one transaction would silently drop the rest of the statement.
  const fusedRows = rawTx.some((table) => (table.rawRows || table.rows || []).some((row) =>
    row.some((cell) => (String(cell).match(/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/g) || []).length > 2)));
  if (fusedRows) return null;
  const year = inferStatementYear(markdown);
  const transactions = [];
  for (const table of rawTx) transactions.push(...normalizeTableTransactions(table, year, transactions.length, transactions.at(-1)?.balance_amount ?? null));

  if (transactions.length === 0) return null;
  // A row with neither a debit nor a credit means the amount columns were not
  // understood; let the caller fall back instead of publishing empty rows.
  if (transactions.some((row) => row.raw_payload?.amountValidationIssue === "missing_debit_and_credit")) return null;
  return { headers: rawTx.flatMap((table) => table.headers), transactions };
}
