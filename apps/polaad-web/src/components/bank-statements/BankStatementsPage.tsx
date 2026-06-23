"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Filter,
  Landmark,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  UploadCloud,
  X,
} from "lucide-react";

import { AppShell } from "@/components/dashboard/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

type BankAccount = {
  id: string;
  bankName: string | null;
  accountNumber: string | null;
  accountNumberMasked: string;
  accountHolderName: string | null;
  ifscCode: string | null;
  tallyLedgerName: string | null;
  lastImportedTransactionAt: string | null;
  lastTallyPostedTransactionAt: string | null;
};

type BankStatementImport = {
  id: string;
  status: string;
  originalFileName: string;
  importedTransactionCount: number;
  duplicateTransactionCount: number;
  createdAt: string;
};

type TallyConnection = {
  id: string;
  displayName: string;
  status: string;
  lastCompanyName: string | null;
  bridgeConnected?: boolean;
  heartbeatStale?: boolean;
  updatedAt?: string;
};

type TallyCommand = {
  id: string;
  commandType?: string;
  command_type?: string;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
};

type DraftAccount = {
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  ifscCode: string;
  tallyLedgerName: string;
};

type PreviewTransaction = {
  id?: string;
  transactionDate?: string | null;
  valueDate?: string | null;
  description?: string | null;
  referenceNumber?: string | null;
  debitAmount?: string | number | null;
  creditAmount?: string | number | null;
  balanceAmount?: string | number | null;
  transactionType?: string | null;
  category?: string | null;
  counterpartyName?: string | null;
  suggestedLedgerName?: string | null;
  suggestionConfidence?: number | null;
  suggestionReason?: string | null;
  confirmedLedgerName?: string | null;
  rawPayload?: {
    aiLedgerRecommendation?: LedgerRecommendation | null;
  } | null;
};

type LedgerRecommendationAction =
  | "use_existing_ledger"
  | "create_new_ledger"
  | "use_standard_ledger"
  | "use_suspense"
  | "needs_review";

type LedgerRecommendation = {
  action: LedgerRecommendationAction;
  ledgerName: string | null;
  ledgerGroup: string | null;
  confidence: number;
  requiresUserConfirmation: boolean;
  reason: string | null;
};

type ReviewTransaction = {
  id: string;
  transactionDate: string;
  valueDate: string;
  description: string;
  referenceNumber: string;
  debitAmount: string;
  creditAmount: string;
  balanceAmount: string;
  transactionType: string;
  category: string;
  counterpartyName: string;
  suggestedLedgerName: string;
  suggestionConfidence: number | null;
  suggestionReason: string;
  selectedLedgerName: string;
  ledgerAction: LedgerRecommendationAction;
  ledgerGroup: string;
  requiresUserConfirmation: boolean;
  ledgerSelectionTouched?: boolean;
};

type PreviewResponse = {
  import: BankStatementImport;
  account: {
    bankName: string | null;
    accountNumber: string | null;
    accountNumberMasked: string;
    accountHolderName: string | null;
    ifscCode: string | null;
    tallyLedgerName?: string | null;
  };
  candidates: BankAccount[];
  transactions: PreviewTransaction[];
  requiresManualExtraction?: boolean;
  extractionError?: string | null;
  extractionDiagnostics?: {
    rawAiTransactionCount?: number;
    normalizedAiTransactionCount?: number;
  } | null;
  ledgerRecommendationError?: string | null;
  processing?: boolean;
  job?: {
    id: string;
    status: string;
    progress: number;
    stage: string | null;
    error: string | null;
  } | null;
};

type TallyMaster = {
  key: string;
  name: string;
  type: string;
  parent?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  ifscCode?: string | null;
  accountHolderName?: string | null;
};

type QueueTransaction = {
  id: string;
  transactionDate: string;
  description: string;
  referenceNumber: string | null;
  debitAmount: string | number | null;
  creditAmount: string | number | null;
  suggestedLedgerName: string | null;
  confirmedLedgerName: string | null;
};

type MessageTone = "success" | "error" | "info";
type ReviewStatusFilter = "all" | "matched" | "needs_review" | "suspense";
type ReviewDirectionFilter = "all" | "debit" | "credit";

type ToastMessage = {
  id: string;
  tone: MessageTone;
  text: string;
};

type LedgerSelection = {
  name: string;
  action: LedgerRecommendationAction;
  ledgerGroup?: string;
};

type LedgerPickerOption = LedgerSelection & {
  key: string;
  label: string;
  helper?: string;
  badge?: string;
};

type LedgerPickerGroup = {
  label: string;
  options: LedgerPickerOption[];
};

const EMPTY_ACCOUNT: DraftAccount = {
  bankName: "",
  accountNumber: "",
  accountHolderName: "",
  ifscCode: "",
  tallyLedgerName: "",
};

function normalizeName(value?: string | null) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function ledgerNameTokens(value?: string | null) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => {
      if (!token) return "";
      if (["pvt", "private", "ltd", "limited", "llp", "inc"].includes(token)) return "";
      if (token === "shri") return "shree";
      if (["ind", "industry", "industries", "industires", "indutries", "indstries"].includes(token)) return "industry";
      if (token === "supply" || token === "supplies" || token === "supplier" || token === "suppliers") return "supply";
      if (token === "enterprise" || token === "enterprises") return "enterprise";
      if (["engr", "engrs", "engg", "engineer", "engineers", "engineering"].includes(token)) return "engineer";
      if (["mech", "mechanical"].includes(token)) return "mech";
      if (token === "co" || token === "company") return "company";
      return token;
    })
    .filter(Boolean);
}

function compactLedgerName(value?: string | null) {
  return ledgerNameTokens(value).join("");
}

const GENERIC_PARTY_SUFFIX_TOKENS = new Set([
  "company",
  "enterprise",
  "firm",
  "group",
  "trader",
  "traders",
  "trading",
]);

function coreLedgerNameTokens(value?: string | null) {
  return ledgerNameTokens(value).filter(
    (token) => token.length > 1 && !GENERIC_PARTY_SUFFIX_TOKENS.has(token)
  );
}

function compactCoreLedgerName(value?: string | null) {
  return coreLedgerNameTokens(value).join("");
}

const LEDGER_PARTY_PREFIXES = new Set([
  "neft",
  "rtgs",
  "imps",
  "upi",
  "ach",
  "ecs",
  "nach",
  "cr",
  "dr",
  "credit",
  "debit",
  "hdfc",
  "icici",
  "sbi",
  "axis",
  "kotak",
  "idfc",
  "indusind",
  "canara",
  "federal",
  "yes",
]);

function cleanLedgerCandidateText(value?: string | null) {
  let cleaned = String(value ?? "")
    .replace(/\b(?:utr|ref|reference|invoice|bill|chq|cheque)\b[\s:#/-]*[a-z0-9-]+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  for (let index = 0; index < 4; index += 1) {
    const match = cleaned.match(/^([a-z0-9]+)(?:\s+|[-:/._]+)(.+)$/i);
    if (!match || !LEDGER_PARTY_PREFIXES.has(match[1].toLowerCase())) break;
    cleaned = match[2].trim();
  }

  return cleaned;
}

function ledgerNameCandidateVariants(...values: Array<string | null | undefined>) {
  const candidates: string[] = [];
  const seen = new Set<string>();

  function addCandidate(value?: string | null) {
    const trimmed = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const key = normalizeName(trimmed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push(trimmed);
  }

  for (const value of values) {
    const raw = String(value ?? "").trim();
    addCandidate(raw);
    addCandidate(cleanLedgerCandidateText(raw));

    for (const part of raw.split(/\s+\/\s+|\s+\|\s+|\s{2,}/)) {
      addCandidate(part);
      addCandidate(cleanLedgerCandidateText(part));
    }
  }

  return candidates;
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? 0;
}

function ledgerNameSimilarity(left: string, right: string) {
  const leftCompact = compactLedgerName(left);
  const rightCompact = compactLedgerName(right);
  if (!leftCompact || !rightCompact) return 0;
  if (leftCompact === rightCompact) return 1;

  const maxLength = Math.max(leftCompact.length, rightCompact.length);
  if (maxLength < 5) return 0;

  const editScore = 1 - levenshteinDistance(leftCompact, rightCompact) / maxLength;
  const substringScore =
    leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact)
      ? 0.82 + (Math.min(leftCompact.length, rightCompact.length) / maxLength) * 0.1
      : 0;
  const leftCoreCompact = compactCoreLedgerName(left);
  const rightCoreCompact = compactCoreLedgerName(right);
  const coreMaxLength = Math.max(leftCoreCompact.length, rightCoreCompact.length);
  const coreScore =
    coreMaxLength >= 5 && leftCoreCompact && rightCoreCompact
      ? leftCoreCompact === rightCoreCompact
        ? 0.96
        : leftCoreCompact.includes(rightCoreCompact) || rightCoreCompact.includes(leftCoreCompact)
          ? 0.88 + (Math.min(leftCoreCompact.length, rightCoreCompact.length) / coreMaxLength) * 0.08
          : 1 - levenshteinDistance(leftCoreCompact, rightCoreCompact) / coreMaxLength
      : 0;
  const leftTokens = new Set(ledgerNameTokens(left));
  const rightTokens = new Set(ledgerNameTokens(right));
  const sharedTokenCount = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const totalTokenCount = new Set([...leftTokens, ...rightTokens]).size;
  const tokenScore = totalTokenCount > 0 ? sharedTokenCount / totalTokenCount : 0;

  return Math.max(editScore, substringScore, coreScore, tokenScore);
}

function findCloseLedgerMatches(
  ledgerMasters: TallyMaster[],
  ledgerName?: string | null,
  threshold = 0.84
) {
  const compactName = compactLedgerName(ledgerName);
  if (compactName.length < 5) return [];

  const matches: Array<{ ledger: TallyMaster; score: number }> = [];
  for (const ledger of ledgerMasters) {
    if (normalizeName(ledger.name) === normalizeName(ledgerName)) continue;
    const score = ledgerNameSimilarity(ledgerName ?? "", ledger.name);
    if (score < threshold) continue;
    matches.push({ ledger, score });
  }

  return matches.sort((left, right) => right.score - left.score || left.ledger.name.localeCompare(right.ledger.name));
}

function findUniqueCloseLedgerMatch(
  ledgerMasters: TallyMaster[],
  ledgerName?: string | null,
  threshold = 0.84
) {
  const matches = findCloseLedgerMatches(ledgerMasters, ledgerName, threshold);
  return matches.length === 1 ? matches[0] : null;
}

function findLedgerByNormalizedName(ledgerMasters: TallyMaster[], ledgerName?: string | null) {
  const normalizedLedgerName = normalizeName(ledgerName);
  if (!normalizedLedgerName) return null;

  return (
    ledgerMasters.find((ledger) => normalizeName(ledger.name) === normalizedLedgerName) ?? null
  );
}

function findLedgerByCandidates(ledgerMasters: TallyMaster[], candidates: string[]) {
  for (const candidate of candidates) {
    const ledger = findLedgerByNormalizedName(ledgerMasters, candidate);
    if (ledger) return ledger;
  }
  return null;
}

function findUniqueCloseLedgerMatchByCandidates(ledgerMasters: TallyMaster[], candidates: string[]) {
  const matchesByLedger = new Map<string, { ledger: TallyMaster; score: number }>();

  for (const candidate of candidates) {
    for (const match of findCloseLedgerMatches(ledgerMasters, candidate)) {
      const key = normalizeName(match.ledger.name);
      const existing = matchesByLedger.get(key);
      if (!existing || match.score > existing.score) {
        matchesByLedger.set(key, match);
      }
    }
  }

  const matches = Array.from(matchesByLedger.values()).sort(
    (left, right) => right.score - left.score || left.ledger.name.localeCompare(right.ledger.name)
  );
  return matches.length === 1 ? matches[0] : null;
}

function getTallyConnectionRank(connection: TallyConnection) {
  if (connection.status === "company_loaded") return 5;
  if (connection.status === "tally_reachable") return 4;
  if (connection.status === "bridge_connected") return 3;
  if (connection.status === "waiting_for_bridge") return 2;
  return 1;
}

function getRelevantTallyConnections(connections: TallyConnection[]) {
  const connectedConnections = connections.filter(
    (connection) =>
      connection.bridgeConnected ||
      connection.status === "company_loaded" ||
      connection.status === "tally_reachable" ||
      connection.status === "bridge_connected"
  );
  const source = connectedConnections.length > 0 ? connectedConnections : connections.slice(0, 1);

  return [...source].sort((left, right) => {
    const rankDiff = getTallyConnectionRank(right) - getTallyConnectionRank(left);
    if (rankDiff !== 0) return rankDiff;
    return new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime();
  });
}

function readRecommendation(transaction: PreviewTransaction): LedgerRecommendation | null {
  return transaction.rawPayload?.aiLedgerRecommendation ?? null;
}

function fallbackReviewLedgerName(transaction: PreviewTransaction) {
  const counterpartyName = String(transaction.counterpartyName ?? "").trim();
  if (counterpartyName) return counterpartyName;

  const text = `${transaction.category ?? ""} ${transaction.transactionType ?? ""} ${transaction.description ?? ""}`.toLowerCase();
  if (/\bbank[_\s-]*charges\b|\bcharge|charges|fee\b/.test(text)) return "Bank Charges";
  if (/\binterest\b/.test(text)) return "Interest Income";
  if (/\batm\b|\bcash\b/.test(text)) return "Cash";

  return "";
}

function normalizeReviewTransaction(transaction: PreviewTransaction, ledgerMasters: TallyMaster[]): ReviewTransaction {
  const recommendation = readRecommendation(transaction);
  const suggestedLedgerName = transaction.suggestedLedgerName || "";
  const action = recommendation?.action ?? "needs_review";
  const recommendedLedgerName = recommendation?.ledgerName || suggestedLedgerName || fallbackReviewLedgerName(transaction);
  const suspenseLedger = findLedgerByNormalizedName(ledgerMasters, "Suspense");
  const suspenseName = suspenseLedger?.name || "Suspense";
  const confirmedLedger = findLedgerByNormalizedName(ledgerMasters, transaction.confirmedLedgerName);
  const confirmedSuspenseLedger = confirmedLedger && isSuspenseLedgerName(confirmedLedger.name) ? confirmedLedger : null;
  const confirmedMappedLedger = confirmedLedger && !isSuspenseLedgerName(confirmedLedger.name) ? confirmedLedger : null;
  const ledgerCandidates = ledgerNameCandidateVariants(
    recommendedLedgerName,
    transaction.counterpartyName,
    transaction.description
  );
  const matchedLedger = findLedgerByCandidates(ledgerMasters, ledgerCandidates);
  const closeLedgerMatch = !matchedLedger
    ? findUniqueCloseLedgerMatchByCandidates(ledgerMasters, ledgerCandidates)
    : null;
  const reviewSuggestedLedgerName = closeLedgerMatch
    ? closeLedgerMatch?.ledger.name || recommendedLedgerName
    : recommendedLedgerName;
  const selectedLedgerName =
    confirmedMappedLedger?.name ||
    matchedLedger?.name ||
    closeLedgerMatch?.ledger.name ||
    confirmedSuspenseLedger?.name ||
    suspenseName;
  const ledgerAction: LedgerRecommendationAction = confirmedMappedLedger
    ? "use_existing_ledger"
    : closeLedgerMatch
    ? "use_existing_ledger"
    : matchedLedger
    ? action === "use_standard_ledger"
      ? "use_standard_ledger"
      : "use_existing_ledger"
    : "use_suspense";

  return {
    id: transaction.id || crypto.randomUUID(),
    transactionDate: transaction.transactionDate || "",
    valueDate: transaction.valueDate || transaction.transactionDate || "",
    description: transaction.description || "",
    referenceNumber: transaction.referenceNumber || "",
    debitAmount:
      transaction.debitAmount === null || transaction.debitAmount === undefined
        ? ""
        : String(transaction.debitAmount),
    creditAmount:
      transaction.creditAmount === null || transaction.creditAmount === undefined
        ? ""
        : String(transaction.creditAmount),
    balanceAmount:
      transaction.balanceAmount === null || transaction.balanceAmount === undefined
        ? ""
        : String(transaction.balanceAmount),
    transactionType: transaction.transactionType || "unknown",
    category: transaction.category || "unknown",
    counterpartyName: transaction.counterpartyName || "",
    suggestedLedgerName: reviewSuggestedLedgerName,
    suggestionConfidence: recommendation?.confidence ?? transaction.suggestionConfidence ?? null,
    suggestionReason: closeLedgerMatch
      ? `Single close Tally ledger match found: ${closeLedgerMatch.ledger.name}.`
      : ledgerAction === "use_suspense" && !matchedLedger
        ? "No matching Tally ledger was found. This row will go to Suspense unless changed."
        : recommendation?.reason || transaction.suggestionReason || "",
    selectedLedgerName,
    ledgerAction,
    ledgerGroup: recommendation?.ledgerGroup || "",
    requiresUserConfirmation: false,
    ledgerSelectionTouched: false,
  };
}

function autoMatchUntouchedLedgerSelection(transaction: ReviewTransaction, ledgerMasters: TallyMaster[]) {
  if (transaction.ledgerSelectionTouched) return transaction;

  const currentLedger = findLedgerByNormalizedName(ledgerMasters, transaction.selectedLedgerName);
  if (
    currentLedger &&
    !isSuspenseLedgerName(currentLedger.name) &&
    (transaction.ledgerAction === "use_existing_ledger" || transaction.ledgerAction === "use_standard_ledger")
  ) {
    return transaction;
  }

  const matchedLedger =
    findLedgerByNormalizedName(ledgerMasters, transaction.suggestedLedgerName) ||
    findLedgerByNormalizedName(ledgerMasters, transaction.counterpartyName) ||
    findLedgerByNormalizedName(ledgerMasters, fallbackReviewLedgerName(transaction)) ||
    findLedgerByCandidates(
      ledgerMasters,
      ledgerNameCandidateVariants(transaction.suggestedLedgerName, transaction.counterpartyName, transaction.description)
    ) ||
    findUniqueCloseLedgerMatchByCandidates(
      ledgerMasters,
      ledgerNameCandidateVariants(transaction.suggestedLedgerName, transaction.counterpartyName, transaction.description)
    )?.ledger;

  if (!matchedLedger || isSuspenseLedgerName(matchedLedger.name)) return transaction;

  return {
    ...transaction,
    selectedLedgerName: matchedLedger.name,
    suggestedLedgerName: matchedLedger.name,
    ledgerAction: "use_existing_ledger" as const,
    ledgerGroup: matchedLedger.parent || transaction.ledgerGroup,
    suggestionReason: transaction.suggestionReason || "Matched by synced Tally ledger name.",
    requiresUserConfirmation: false,
  };
}

function parseNumber(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function transactionHasPostingAmount(transaction: ReviewTransaction) {
  return Math.max(parseNumber(transaction.debitAmount) ?? 0, parseNumber(transaction.creditAmount) ?? 0) > 0;
}

function transactionIsValid(transaction: ReviewTransaction) {
  return Boolean(transaction.transactionDate && transaction.description.trim() && transactionHasPostingAmount(transaction));
}

function formatAmount(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed === 0) return "";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(parsed);
}

function formatDataLabel(value?: string | null) {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getTransactionDirection(transaction: ReviewTransaction) {
  if ((parseNumber(transaction.creditAmount) ?? 0) > 0) return "Credit";
  if ((parseNumber(transaction.debitAmount) ?? 0) > 0) return "Debit";
  return "";
}

function getTransactionMode(transaction: ReviewTransaction) {
  const text = `${transaction.transactionType} ${transaction.category} ${transaction.description}`.toLowerCase();
  if (/\bneft\b/.test(text)) return "NEFT";
  if (/\brtgs\b/.test(text)) return "RTGS";
  if (/\bimps\b/.test(text)) return "IMPS";
  if (/\bupi\b|vpa|bharatpe|gpay|googlepay|phonepe|paytm/.test(text)) return "UPI";
  if (/\batm\b/.test(text)) return "ATM";
  if (/\bpos\b|purchase/.test(text)) return "POS";
  if (/\bcheque|chq\b/.test(text)) return "Cheque";
  if (/\bcharge|charges|fee\b/.test(text)) return "Bank charge";
  if (/\binterest\b/.test(text)) return "Interest";
  if (/\bcash\b/.test(text)) return "Cash";
  return transaction.category && transaction.category !== "unknown"
    ? formatDataLabel(transaction.category)
    : "";
}

function getTransactionReference(transaction: ReviewTransaction) {
  const reference = transaction.referenceNumber.trim();
  if (!reference) return "";
  const normalizedReference = normalizeName(reference);
  if (["debit", "credit", "dr", "cr"].includes(normalizedReference)) return "";
  if (normalizedReference === normalizeName(transaction.transactionType)) return "";
  return reference;
}

function getTransactionPartyTitle(transaction: ReviewTransaction) {
  if (transaction.counterpartyName.trim()) return transaction.counterpartyName.trim();

  const mode = getTransactionMode(transaction);
  if (mode === "ATM") return "ATM cash withdrawal";
  if (mode === "Bank charge") return "Bank charges";
  if (mode === "Interest") return "Interest credit";
  if (transaction.category && transaction.category !== "unknown") {
    return formatDataLabel(transaction.category);
  }

  return transaction.description || "Unknown transaction";
}

function maskAccountNumber(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!normalized) return "";
  if (normalized.length <= 4) return normalized;
  return `${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

function isBankLedgerMaster(ledger: TallyMaster) {
  const text = `${ledger.name} ${ledger.parent ?? ""}`.toLowerCase();
  return (
    /\bbank\b/.test(text) ||
    /\b(hdfc|icici|sbi|axis|kotak|idfc|indusind|canara|yes bank|federal|standard chartered|bank of baroda|bank of india)\b/.test(text)
  );
}

function getLedgerCandidateName(transaction: ReviewTransaction) {
  if (transaction.ledgerAction === "needs_review" && transaction.counterpartyName) {
    return transaction.counterpartyName.trim();
  }

  return (
    transaction.selectedLedgerName ||
    transaction.suggestedLedgerName ||
    transaction.counterpartyName ||
    ""
  ).trim();
}

function getCloseLedgerMatches(transaction: ReviewTransaction, ledgerMasters: TallyMaster[], limit = 5) {
  const searchTerms = [
    transaction.counterpartyName,
    transaction.suggestedLedgerName,
    transaction.category,
  ]
    .map((term) => String(term ?? "").trim())
    .filter((term) => compactLedgerName(term).length >= 4);

  const exactName = normalizeName(getLedgerCandidateName(transaction));
  const matches: Array<{ ledger: TallyMaster; score: number }> = [];

  for (const ledger of ledgerMasters) {
    const normalizedLedger = normalizeName(ledger.name);
    if (!normalizedLedger || normalizedLedger === exactName) continue;

    const score = searchTerms.reduce((current, term) => {
      const normalizedTerm = normalizeName(term);
      const fuzzyScore = ledgerNameSimilarity(term, ledger.name);
      if (normalizedLedger === normalizedTerm) return Math.max(current, 100);
      if (normalizedLedger.includes(normalizedTerm)) return Math.max(current, Math.min(90, normalizedTerm.length * 4));
      if (normalizedTerm.includes(normalizedLedger) && normalizedLedger.length >= 4) {
        return Math.max(current, Math.min(80, normalizedLedger.length * 4));
      }
      if (fuzzyScore >= 0.84) return Math.max(current, Math.round(fuzzyScore * 100));
      return current;
    }, 0);

    if (score > 0) matches.push({ ledger, score });
  }

  return matches
    .sort((left, right) => right.score - left.score || left.ledger.name.localeCompare(right.ledger.name))
    .slice(0, limit)
    .map(({ ledger }) => ledger.name);
}

function getCommonLedgerOptions(ledgerMasters: TallyMaster[]) {
  const commonNames = [
    "Cash",
    "Bank Charges",
    "Bank Charges GST",
    "Interest Income",
    "Interest Received",
    "Duties & Taxes",
    "Office Supplies",
    "Office Expenses",
    "Transport Vendor",
  ];

  const names = new Set<string>();
  for (const commonName of commonNames) {
    const matched = findLedgerByNormalizedName(ledgerMasters, commonName);
    if (matched) names.add(matched.name);
  }

  return Array.from(names).filter(Boolean);
}

function optionKey(option: LedgerSelection) {
  return `${option.action}:${normalizeName(option.name)}:${normalizeName(option.ledgerGroup)}`;
}

function uniqueLedgerOptions(options: LedgerPickerOption[]) {
  const seen = new Set<string>();
  const uniqueOptions: LedgerPickerOption[] = [];

  for (const option of options) {
    const key = optionKey(option);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueOptions.push(option);
  }

  return uniqueOptions;
}

function buildLedgerPickerGroups(transaction: ReviewTransaction, ledgerMasters: TallyMaster[]): LedgerPickerGroup[] {
  const suspenseLedger = ledgerMasters.find((ledger) => normalizeName(ledger.name) === "suspense");
  const suspenseName = suspenseLedger?.name || "Suspense";
  const currentLedger = findLedgerByNormalizedName(ledgerMasters, transaction.selectedLedgerName);
  const suggestedLedger = findLedgerByNormalizedName(ledgerMasters, transaction.suggestedLedgerName);
  const closeMatches = getCloseLedgerMatches(transaction, ledgerMasters);
  const commonLedgers = getCommonLedgerOptions(ledgerMasters);
  const groups: LedgerPickerGroup[] = [];
  const usedKeys = new Set<string>();

  function makeOption(input: Omit<LedgerPickerOption, "key">): LedgerPickerOption {
    return { ...input, key: optionKey(input) };
  }

  function addGroup(label: string, options: Array<Omit<LedgerPickerOption, "key">>) {
    const nextOptions = uniqueLedgerOptions(options.map(makeOption)).filter((option) => {
      if (!option.name.trim()) return false;
      if (usedKeys.has(option.key)) return false;
      usedKeys.add(option.key);
      return true;
    });

    if (nextOptions.length > 0) groups.push({ label, options: nextOptions });
  }

  if (transaction.ledgerAction === "use_existing_ledger" && transaction.selectedLedgerName) {
    addGroup("Current match", [
      {
        name: currentLedger?.name || transaction.selectedLedgerName,
        action: "use_existing_ledger",
        label: currentLedger?.name || transaction.selectedLedgerName,
        helper: "Use the existing Tally ledger.",
        badge: "Matched",
      },
    ]);
  } else if (transaction.ledgerAction === "use_standard_ledger" && transaction.selectedLedgerName) {
    addGroup("Current match", [
      {
        name: currentLedger?.name || transaction.selectedLedgerName,
        action: "use_standard_ledger",
        label: currentLedger?.name || transaction.selectedLedgerName,
        helper: "Standard ledger chosen from transaction type.",
        badge: "Standard",
      },
    ]);
  } else if (transaction.ledgerAction === "use_suspense") {
    addGroup("Current selection", [
      {
        name: suspenseName,
        action: "use_suspense",
        label: "Put in Suspense",
        helper: "Use when the correct ledger is unclear.",
        badge: "Fallback",
      },
    ]);
  }

  if (transaction.ledgerAction === "needs_review" || closeMatches.length > 0) {
    addGroup("Suggested matches", [
      ...(suggestedLedger
        ? [
            {
              name: suggestedLedger.name,
              action: "use_existing_ledger" as const,
              label: suggestedLedger.name,
              helper: transaction.requiresUserConfirmation
                ? "Close Tally ledger match. Review before using."
                : "Matched by extracted counterparty name.",
              badge: transaction.requiresUserConfirmation ? "Close" : "Suggested",
            },
          ]
        : []),
      ...closeMatches.map((name) => ({
        name,
        action: "use_existing_ledger" as const,
        label: name,
        helper: "Possible Tally ledger match.",
        badge: "Close",
      })),
    ]);
  }

  addGroup(
    "Common ledgers",
    commonLedgers.map((name) => ({
      name,
      action: name === currentLedger?.name && transaction.ledgerAction === "use_standard_ledger"
        ? "use_standard_ledger"
        : "use_existing_ledger",
      label: name,
      helper: "Commonly used Tally ledger.",
    }))
  );

  addGroup(
    "Search Tally ledgers",
    ledgerMasters.map((ledger) => ({
      name: ledger.name,
      action: "use_existing_ledger",
      label: ledger.name,
      helper: ledger.parent ? `Group: ${ledger.parent}` : "Existing Tally ledger.",
    }))
  );

  addGroup("Safe fallback", [
    {
      name: suspenseName,
      action: "use_suspense",
      label: "Put in Suspense",
      helper: "Use when the correct ledger is unclear.",
      badge: "Fallback",
    },
  ]);

  return groups;
}

function LedgerSearchSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const uniqueOptions = useMemo(() => Array.from(new Set(options.filter(Boolean))), [options]);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeName(query);
    const matches = normalizedQuery
      ? uniqueOptions.filter((option) => normalizeName(option).includes(normalizedQuery))
      : uniqueOptions;

    return matches.slice(0, 60);
  }, [query, uniqueOptions]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8d7f]" />
        <input
          className="h-10 w-full rounded-md border border-[#d8cbbb] bg-white px-3 pl-9 text-sm font-medium text-[#2b241d] outline-none transition placeholder:text-[#9a8d7f] focus:border-[#7c5f3f] focus:ring-2 focus:ring-[#7c5f3f]/10"
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          value={open ? query : value}
        />
      </div>

      {open ? (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-[#d8cbbb] bg-white p-1 shadow-xl">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-[#fbf4ea] ${
                  option === value ? "bg-[#f6efe6] text-[#4b3828]" : "text-[#2b241d]"
                }`}
                key={option}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option);
                  setQuery("");
                  setOpen(false);
                }}
                type="button"
              >
                <span className="truncate">{option}</span>
                {option === value ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" /> : null}
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-sm font-semibold text-[#8a7f72]">
              No matching ledger found.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function getLedgerPickerDisplayValue(transaction: ReviewTransaction) {
  if (transaction.ledgerAction === "use_suspense") return "Put in Suspense";
  if (transaction.ledgerAction === "use_standard_ledger" && transaction.selectedLedgerName) {
    return `Standard: ${transaction.selectedLedgerName}`;
  }
  if (transaction.ledgerAction === "use_existing_ledger" && transaction.selectedLedgerName) {
    return `Use existing: ${transaction.selectedLedgerName}`;
  }
  return transaction.selectedLedgerName;
}

function isSuspenseLedgerName(value: string) {
  return normalizeName(value) === "suspense";
}

function LedgerReviewSelect({
  transaction,
  ledgerMasters,
  onChange,
}: {
  transaction: ReviewTransaction;
  ledgerMasters: TallyMaster[];
  onChange: (selection: LedgerSelection) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{
    bottom?: number;
    left: number;
    maxHeight: number;
    top?: number;
    width: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () => buildLedgerPickerGroups(transaction, ledgerMasters),
    [ledgerMasters, transaction]
  );
  const normalizedQuery = normalizeName(query);
  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groups;

    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) => {
          const searchable = `${group.label} ${option.label} ${option.name} ${option.helper ?? ""} ${option.badge ?? ""}`;
          return (
            normalizeName(searchable).includes(normalizedQuery) ||
            ledgerNameSimilarity(query, option.name) >= 0.78
          );
        }),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, normalizedQuery, query]);
  const displayValue = open ? query : getLedgerPickerDisplayValue(transaction);

  function selectOption(option: LedgerSelection) {
    onChange(option);
    setQuery("");
    setOpen(false);
  }

  function openMenu() {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const gutter = 16;
      const width = Math.min(480, window.innerWidth - gutter * 2);
      const left = Math.min(
        Math.max(gutter, rect.right - width),
        Math.max(gutter, window.innerWidth - width - gutter)
      );
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const shouldOpenAbove = spaceBelow < 360 && spaceAbove > spaceBelow;
      const availableHeight = Math.max(220, shouldOpenAbove ? spaceAbove - gutter * 2 : spaceBelow - gutter * 2);
      setPopoverPosition({
        bottom: shouldOpenAbove ? window.innerHeight - rect.top + 8 : undefined,
        left,
        maxHeight: Math.min(420, availableHeight),
        top: shouldOpenAbove ? undefined : rect.bottom + 8,
        width,
      });
    }
    setOpen(true);
  }

  const popover = open && popoverPosition ? (
    <div
      className="fixed z-[1000] overflow-auto rounded-xl border border-[#d8cbbb] bg-white p-1 shadow-2xl"
      style={{
        bottom: popoverPosition.bottom,
        left: popoverPosition.left,
        maxHeight: popoverPosition.maxHeight,
        top: popoverPosition.top,
        width: popoverPosition.width,
      }}
    >
      {filteredGroups.length > 0 ? (
        filteredGroups.map((group) => (
          <div className="mb-1 last:mb-0" key={group.label}>
            <div className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#9a8d7f]">
              {group.label}
            </div>
            {group.options.map((option) => {
              const selected =
                normalizeName(option.name) === normalizeName(transaction.selectedLedgerName) &&
                option.action === transaction.ledgerAction;
              return (
                <button
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-[#fbf4ea] ${
                    selected ? "bg-[#f6efe6] text-[#4b3828]" : "text-[#2b241d]"
                  }`}
                  key={option.key}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectOption(option);
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block whitespace-normal break-words">{option.label}</span>
                    {option.helper ? (
                      <span className="mt-0.5 block whitespace-normal break-words text-[11px] font-medium leading-4 text-[#8a7f72]">
                        {option.helper}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {option.badge ? (
                      <Badge className="border-[#d8cbbb] bg-white text-[#6f4e2f]" variant="outline">
                        {option.badge}
                      </Badge>
                    ) : null}
                    {selected ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        ))
      ) : ledgerMasters.length === 0 ? (
        <div className="px-3 py-4 text-sm font-semibold text-[#8a7f72]">
          Tally ledgers are not loaded. Use Sync above, then search again.
        </div>
      ) : (
        <div className="px-3 py-4 text-sm font-semibold text-[#8a7f72]">
          No matching ledger found.
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="relative" ref={rootRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8d7f]" />
        <input
          className="h-10 w-full rounded-md border border-[#d8cbbb] bg-white px-3 pl-9 text-sm font-medium text-[#2b241d] outline-none transition placeholder:text-[#9a8d7f] focus:border-[#7c5f3f] focus:ring-2 focus:ring-[#7c5f3f]/10"
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            setQuery(event.target.value);
            openMenu();
          }}
          onFocus={openMenu}
          placeholder="Search or choose action"
          value={displayValue}
        />
      </div>

      {popover ? createPortal(popover, document.body) : null}
    </div>
  );
}

function getReviewStatus(transaction: ReviewTransaction): ReviewStatusFilter {
  if (transaction.ledgerAction === "use_suspense" || isSuspenseLedgerName(transaction.selectedLedgerName)) {
    return "suspense";
  }
  if (
    transaction.selectedLedgerName.trim() &&
    (transaction.ledgerAction === "use_existing_ledger" || transaction.ledgerAction === "use_standard_ledger")
  ) {
    return "matched";
  }
  return "needs_review";
}

function getReviewStatusLabel(transaction: ReviewTransaction) {
  const status = getReviewStatus(transaction);
  if (status === "matched") return "Matched";
  if (status === "suspense") return "In Suspense";
  return "Needs review";
}

function getReviewStatusClass(transaction: ReviewTransaction) {
  const status = getReviewStatus(transaction);
  if (status === "matched") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "suspense") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function getLedgerGroupLabel(transaction: ReviewTransaction, ledgerMasters: TallyMaster[]) {
  const ledger = findLedgerByNormalizedName(ledgerMasters, transaction.selectedLedgerName);
  return ledger?.parent || transaction.ledgerGroup || "-";
}

function transactionQueueKey(transaction: {
  transactionDate: string;
  description: string;
  referenceNumber?: string | null;
  debitAmount?: string | number | null;
  creditAmount?: string | number | null;
}) {
  return [
    transaction.transactionDate,
    transaction.referenceNumber || "",
    transaction.description,
    String(transaction.debitAmount ?? ""),
    String(transaction.creditAmount ?? ""),
  ].join("|");
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getAnalysisCompleteMessage(payload: PreviewResponse) {
  const extractionIssue = payload.extractionError
    ? payload.extractionError
    : payload.extractionDiagnostics?.rawAiTransactionCount
      ? `AI found ${payload.extractionDiagnostics.rawAiTransactionCount} row(s), but ${payload.extractionDiagnostics.normalizedAiTransactionCount ?? 0} passed validation.`
      : "No transaction rows were extracted.";

  if (payload.requiresManualExtraction || payload.transactions.length === 0) {
    return {
      tone: "info" as const,
      text: `File stored. ${extractionIssue} Please verify rows before sending.`,
    };
  }

  if (payload.ledgerRecommendationError) {
    return {
      tone: "info" as const,
      text: `Statement analyzed, but ledger recommendations need review: ${payload.ledgerRecommendationError}`,
    };
  }

  return {
    tone: "success" as const,
    text: "Statement analyzed. Review the rows, then send to Tally.",
  };
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    diagnostics?: unknown;
  };
  const message = payload.error || `Request failed with status ${response.status}`;
  if (!payload.diagnostics) return message;

  return `${message} ${JSON.stringify(payload.diagnostics)}`;
}

export function BankStatementsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [account, setAccount] = useState<DraftAccount>(EMPTY_ACCOUNT);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [, setRecentImports] = useState<BankStatementImport[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [connections, setConnections] = useState<TallyConnection[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [tallyConnectionId, setTallyConnectionId] = useState("");
  const [bankLedgerName, setBankLedgerName] = useState("");
  const [ledgerMasters, setLedgerMasters] = useState<TallyMaster[]>([]);
  const [transactions, setTransactions] = useState<ReviewTransaction[]>([]);
  const [editingLedgerIds, setEditingLedgerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [syncingMasters, setSyncingMasters] = useState(false);
  const [refreshingConnections, setRefreshingConnections] = useState(false);
  const [banner, setBanner] = useState<{ tone: MessageTone; text: string } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [reviewFiltersOpen, setReviewFiltersOpen] = useState(false);
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatusFilter>("all");
  const [reviewDirectionFilter, setReviewDirectionFilter] = useState<ReviewDirectionFilter>("all");
  const [reviewDateFrom, setReviewDateFrom] = useState("");
  const [reviewDateTo, setReviewDateTo] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const validTransactions = useMemo(
    () => transactions.filter(transactionIsValid),
    [transactions]
  );
  const visibleConnections = useMemo(
    () => getRelevantTallyConnections(connections),
    [connections]
  );
  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === tallyConnectionId) ?? null,
    [connections, tallyConnectionId]
  );
  const tallyConnected =
    selectedConnection?.status === "company_loaded" || selectedConnection?.status === "tally_reachable";
  const bankLedgerOptions = useMemo(() => {
    const bankLedgers = ledgerMasters.filter(isBankLedgerMaster);
    return bankLedgers.length > 0 ? bankLedgers : ledgerMasters;
  }, [ledgerMasters]);
  const missingLedgerCount = useMemo(
    () => validTransactions.filter((transaction) => !transaction.selectedLedgerName.trim()).length,
    [validTransactions]
  );
  const matchedLedgerCount = validTransactions.filter(
    (transaction) =>
      transaction.selectedLedgerName.trim() &&
      !isSuspenseLedgerName(transaction.selectedLedgerName) &&
      (transaction.ledgerAction === "use_existing_ledger" || transaction.ledgerAction === "use_standard_ledger")
  ).length;
  const suspenseLedgerCount = validTransactions.filter(
    (transaction) => transaction.ledgerAction === "use_suspense" || isSuspenseLedgerName(transaction.selectedLedgerName)
  ).length;
  const needsReviewCount = validTransactions.filter(
    (transaction) => getReviewStatus(transaction) === "needs_review"
  ).length;
  const filteredTransactions = useMemo(() => {
    const normalizedSearch = normalizeName(reviewSearch);
    return validTransactions.filter((transaction) => {
      if (reviewStatusFilter !== "all" && getReviewStatus(transaction) !== reviewStatusFilter) {
        return false;
      }
      if (reviewDirectionFilter === "debit" && (parseNumber(transaction.debitAmount) ?? 0) <= 0) {
        return false;
      }
      if (reviewDirectionFilter === "credit" && (parseNumber(transaction.creditAmount) ?? 0) <= 0) {
        return false;
      }
      if (reviewDateFrom && transaction.transactionDate < reviewDateFrom) {
        return false;
      }
      if (reviewDateTo && transaction.transactionDate > reviewDateTo) {
        return false;
      }

      if (!normalizedSearch) return true;

      const searchable = [
        transaction.transactionDate,
        transaction.description,
        transaction.referenceNumber,
        transaction.transactionType,
        transaction.category,
        transaction.counterpartyName,
        transaction.suggestedLedgerName,
        transaction.selectedLedgerName,
        transaction.ledgerGroup,
        transaction.debitAmount,
        transaction.creditAmount,
        getTransactionPartyTitle(transaction),
      ].join(" ");
      return normalizeName(searchable).includes(normalizedSearch);
    });
  }, [reviewDateFrom, reviewDateTo, reviewDirectionFilter, reviewSearch, reviewStatusFilter, validTransactions]);
  const visibleReviewTransactions = useMemo(
    () => filteredTransactions.slice(0, rowsPerPage),
    [filteredTransactions, rowsPerPage]
  );
  const activeReviewFilterCount = [
    reviewSearch.trim(),
    reviewStatusFilter !== "all" ? reviewStatusFilter : "",
    reviewDirectionFilter !== "all" ? reviewDirectionFilter : "",
    reviewDateFrom,
    reviewDateTo,
  ].filter(Boolean).length;

  const loadTallyConnections = useCallback(async () => {
    const response = await apiFetch("/api/tally/connections", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await readError(response));
    }

    const payload = (await response.json()) as { connections?: TallyConnection[] };
    const loadedConnections = payload.connections ?? [];
    const preferredConnection = getRelevantTallyConnections(loadedConnections)[0];
    setConnections(loadedConnections);
    setTallyConnectionId((current) => current || preferredConnection?.id || "");
    return loadedConnections;
  }, []);

  const loadLedgerMasters = useCallback(async (connectionId: string) => {
    if (!connectionId) {
      setLedgerMasters([]);
      return;
    }

    const response = await apiFetch(
      `/api/tally/connections/${connectionId}/masters?type=ledger&limit=5000`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error(await readError(response));
    }
    const payload = (await response.json()) as { masters?: TallyMaster[] };
    setLedgerMasters(payload.masters ?? []);
  }, []);

  const waitForCommand = useCallback(async (connectionId: string, commandId: string) => {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      await wait(2000);
      const response = await apiFetch(`/api/tally/connections/${connectionId}/commands`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const payload = (await response.json()) as { commands?: TallyCommand[] };
      const command = (payload.commands ?? []).find((item) => item.id === commandId);
      if (!command) continue;
      if (command.status === "succeeded" || command.status === "failed" || command.status === "canceled") {
        return command;
      }
    }

    return null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const [importsResponse, accountsResponse, loadedConnections] = await Promise.all([
        apiFetch("/api/bank-statements/imports", { cache: "no-store" }),
        apiFetch("/api/bank-statements/accounts", { cache: "no-store" }),
        loadTallyConnections(),
      ]);

      if (cancelled) return;

      if (importsResponse.ok) {
        const payload = (await importsResponse.json()) as { imports?: BankStatementImport[] };
        setRecentImports(payload.imports ?? []);
      }
      if (accountsResponse.ok) {
        const payload = (await accountsResponse.json()) as { accounts?: BankAccount[] };
        setAccounts(payload.accounts ?? []);
      }
      const preferredConnection = getRelevantTallyConnections(loadedConnections)[0];
      setTallyConnectionId((current) => current || preferredConnection?.id || "");
    }

    loadSummary().catch(() => {
      if (!cancelled) {
        setBanner({ tone: "error", text: "Could not load bank statement details." });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadTallyConnections]);

  useEffect(() => {
    let cancelled = false;

    loadLedgerMasters(tallyConnectionId).catch(() => {
      if (!cancelled) setLedgerMasters([]);
    });

    return () => {
      cancelled = true;
    };
  }, [loadLedgerMasters, tallyConnectionId]);

  useEffect(() => {
    if (visibleConnections.length === 0) {
      setTallyConnectionId("");
      return;
    }

    if (!visibleConnections.some((connection) => connection.id === tallyConnectionId)) {
      setTallyConnectionId(visibleConnections[0]?.id || "");
    }
  }, [tallyConnectionId, visibleConnections]);

  useEffect(() => {
    if (ledgerMasters.length === 0) return;

    setTransactions((current) =>
      current.map((transaction) => {
        const autoMatchedTransaction = autoMatchUntouchedLedgerSelection(transaction, ledgerMasters);
        if (autoMatchedTransaction !== transaction) return autoMatchedTransaction;

        if (
          transaction.ledgerAction === "use_suspense" ||
          transaction.ledgerAction === "needs_review" ||
          transaction.requiresUserConfirmation
        ) {
          return transaction;
        }

        const matchedLedger =
          findLedgerByNormalizedName(ledgerMasters, transaction.selectedLedgerName) ||
          findLedgerByNormalizedName(ledgerMasters, transaction.suggestedLedgerName);
        return matchedLedger
          ? {
              ...transaction,
              selectedLedgerName: matchedLedger.name,
              ledgerAction:
                transaction.ledgerAction === "use_standard_ledger" ? "use_standard_ledger" : "use_existing_ledger",
              requiresUserConfirmation: false,
            }
          : transaction;
      })
    );
  }, [ledgerMasters]);

  function updateLedgerSelection(id: string, selection: LedgerSelection) {
    setTransactions((current) =>
      current.map((transaction) =>
        transaction.id === id
          ? {
              ...transaction,
              selectedLedgerName: selection.name,
              ledgerAction: selection.action,
              ledgerGroup: selection.ledgerGroup || "",
              requiresUserConfirmation: false,
              ledgerSelectionTouched: true,
            }
          : transaction
      )
    );
  }

  function dismissToast(id: string) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showToast(tone: MessageTone, text: string) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    setToasts((current) => [...current, { id, tone, text }].slice(-3));
    window.setTimeout(() => dismissToast(id), 5000);
  }

  async function refreshTallyConnectionStatus() {
    try {
      setRefreshingConnections(true);
      const loadedConnections = await loadTallyConnections();
      const preferredConnection = getRelevantTallyConnections(loadedConnections)[0];
      if (preferredConnection?.id) {
        setTallyConnectionId(preferredConnection.id);
        await loadLedgerMasters(preferredConnection.id).catch(() => setLedgerMasters([]));
      }
      showToast("success", "Tally connection refreshed.");
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Could not refresh Tally connection.");
    } finally {
      setRefreshingConnections(false);
    }
  }

  function applyTallyBankLedgerSelection(ledgerName: string) {
    const ledger = ledgerMasters.find((item) => item.name === ledgerName);
    const mappedAccount = accounts.find((item) => item.tallyLedgerName === ledgerName);
    const ledgerAccountNumber =
      mappedAccount?.accountNumber?.trim() || ledger?.bankAccountNumber?.trim() || "";

    setAccount((current) => ({
      ...current,
      tallyLedgerName: ledgerName,
      bankName: mappedAccount?.bankName || ledger?.bankName || ledger?.name || current.bankName,
      accountNumber: ledgerAccountNumber || current.accountNumber,
      accountHolderName:
        mappedAccount?.accountHolderName ||
        ledger?.accountHolderName ||
        ledger?.name ||
        current.accountHolderName,
      ifscCode: mappedAccount?.ifscCode || ledger?.ifscCode || current.ifscCode,
    }));
    setBankLedgerName(ledgerName);
  }

  function applyPreviewPayload(payload: PreviewResponse, fallbackAccount = account) {
    const singleCandidate = payload.candidates.length === 1 ? payload.candidates[0] : null;
    const nextTallyLedgerName =
      singleCandidate?.tallyLedgerName ||
      payload.account.tallyLedgerName ||
      fallbackAccount.tallyLedgerName;

    setPreview(payload);
    setAccount({
      bankName: payload.account.bankName ?? fallbackAccount.bankName,
      accountNumber: payload.account.accountNumber ?? fallbackAccount.accountNumber,
      accountHolderName: payload.account.accountHolderName ?? fallbackAccount.accountHolderName,
      ifscCode: payload.account.ifscCode ?? fallbackAccount.ifscCode,
      tallyLedgerName: nextTallyLedgerName,
    });
    setSelectedAccountId(singleCandidate?.id || "");
    setBankLedgerName(nextTallyLedgerName || "");
    setTransactions(payload.transactions.map((transaction) => normalizeReviewTransaction(transaction, ledgerMasters)));
    setEditingLedgerIds(new Set());
  }

  async function pollImportUntilReady(importId: string) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await wait(2500);
      const response = await apiFetch(`/api/bank-statements/imports/${importId}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as PreviewResponse;
      if (payload.processing) {
        setBanner({
          tone: "info",
          text: payload.job?.stage
            ? `Analyzing statement: ${payload.job.stage}`
            : "Analyzing statement...",
        });
        continue;
      }

      if (payload.job?.status === "failed") {
        throw new Error(payload.job.error || "Bank statement analysis failed.");
      }

      applyPreviewPayload(payload);
      setBanner(getAnalysisCompleteMessage(payload));
      return payload;
    }

    throw new Error("Bank statement analysis is still running. Please refresh in a moment.");
  }

  async function analyzeFile(nextFile = file) {
    if (!nextFile) {
      setBanner({ tone: "error", text: "Select a bank statement file." });
      return;
    }

    try {
      setLoading(true);
      setBanner(null);
      setFile(nextFile);
      const formData = new FormData();
      formData.set("file", nextFile);
      formData.set("account", JSON.stringify(account));
      if (tallyConnectionId) {
        formData.set("connectionId", tallyConnectionId);
      }

      const response = await apiFetch("/api/bank-statements/imports", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as PreviewResponse;
      if (payload.processing) {
        setBanner({
          tone: "info",
          text: payload.job?.stage
            ? `Analyzing statement: ${payload.job.stage}`
            : "Analyzing statement...",
        });
        await pollImportUntilReady(payload.import.id);
        return;
      }

      applyPreviewPayload(payload);
      setBanner(getAnalysisCompleteMessage(payload));
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Bank statement analysis failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncLedgerMasters() {
    const connection = connections.find((item) => item.id === tallyConnectionId);
    if (!connection) {
      setBanner({ tone: "error", text: "Select a Tally connection before syncing ledgers." });
      return;
    }

    try {
      setSyncingMasters(true);
      setBanner(null);
      const response = await apiFetch(`/api/tally/connections/${connection.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandType: "sync_masters",
          payload: {
            companyName: connection.lastCompanyName,
            requestedMasterTypes: ["ledger", "group"],
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const payload = (await response.json()) as { command?: TallyCommand };
      const command = payload.command;
      if (!command?.id) {
        throw new Error("Tally ledger sync was queued, but no command id was returned.");
      }
      setBanner({
        tone: "info",
        text: "Tally ledger sync is running. Keep the connector open.",
      });
      const completedCommand = await waitForCommand(connection.id, command.id);
      if (!completedCommand) {
        setBanner({
          tone: "info",
          text: "Tally ledger sync is still pending. Keep the connector running and try again shortly.",
        });
        return;
      }
      if (completedCommand.status !== "succeeded") {
        throw new Error(completedCommand.error || `Tally ledger sync ${completedCommand.status}.`);
      }

      await loadLedgerMasters(connection.id);
      setBanner({ tone: "success", text: "Tally ledgers refreshed." });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not sync Tally ledgers.",
      });
    } finally {
      setSyncingMasters(false);
    }
  }

  async function sendToTally() {
    if (!preview) return;
    if (!tallyConnectionId) {
      showToast("error", "Select a Tally connection.");
      return;
    }
    if (!bankLedgerName.trim()) {
      showToast("error", "Select the Tally bank ledger.");
      return;
    }
    if (validTransactions.length === 0) {
      showToast("error", "No valid rows are available to send.");
      return;
    }
    if (missingLedgerCount > 0) {
      showToast("error", "Select a ledger for every row before sending to Tally.");
      return;
    }

    try {
      setSending(true);
      setBanner(null);
      const confirmResponse = await apiFetch(`/api/bank-statements/imports/${preview.import.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccountId || null,
          account: {
            ...account,
            tallyLedgerName: bankLedgerName,
          },
          transactions: validTransactions.map((transaction) => ({
            transactionDate: transaction.transactionDate,
            valueDate: transaction.valueDate || transaction.transactionDate,
            description: transaction.description,
            referenceNumber: transaction.referenceNumber || null,
            debitAmount: parseNumber(transaction.debitAmount),
            creditAmount: parseNumber(transaction.creditAmount),
            balanceAmount: parseNumber(transaction.balanceAmount),
            transactionType: transaction.transactionType,
            category: transaction.category,
            counterpartyName: transaction.counterpartyName || null,
            suggestedLedgerName: transaction.suggestedLedgerName || null,
            suggestionConfidence: transaction.suggestionConfidence,
            suggestionReason: transaction.suggestionReason || null,
            confirmedLedgerName: transaction.selectedLedgerName || null,
          })),
        }),
      });

      if (!confirmResponse.ok) {
        throw new Error(await readError(confirmResponse));
      }

      const confirmPayload = (await confirmResponse.json()) as {
        account: BankAccount;
        import: BankStatementImport;
        importedTransactionCount: number;
        duplicateTransactionCount: number;
      };

      const transactionsResponse = await apiFetch(
        `/api/bank-statements/transactions?${new URLSearchParams({
          accountId: confirmPayload.account.id,
          importId: confirmPayload.import.id,
          status: "queueable",
          connectionId: tallyConnectionId,
        }).toString()}`,
        { cache: "no-store" }
      );
      if (!transactionsResponse.ok) {
        throw new Error(await readError(transactionsResponse));
      }

      const queuePayload = (await transactionsResponse.json()) as { transactions?: QueueTransaction[] };
      const queueRows = queuePayload.transactions ?? [];
      const reviewedTransactionsByKey = new Map(
        validTransactions.map((transaction) => [transactionQueueKey(transaction), transaction])
      );
      if (queueRows.length === 0) {
        setAccounts((current) => [confirmPayload.account, ...current.filter((item) => item.id !== confirmPayload.account.id)]);
        setRecentImports((current) => [confirmPayload.import, ...current.filter((item) => item.id !== confirmPayload.import.id)]);
        setPreview(null);
        setTransactions([]);
        setFile(null);
        showToast(
          "success",
          `${confirmPayload.importedTransactionCount} transactions imported. No new rows needed Tally posting.`
        );
        return;
      }

      const queueResponse = await apiFetch("/api/bank-statements/tally/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: tallyConnectionId,
          accountId: confirmPayload.account.id,
          transactionIds: queueRows.map((transaction) => transaction.id),
          bankLedgerName,
          transactions: queueRows.map((transaction) => ({
            transactionId: transaction.id,
            ...(() => {
              const reviewedTransaction = reviewedTransactionsByKey.get(transactionQueueKey(transaction));
              return {
                counterpartyLedgerName:
                  reviewedTransaction?.selectedLedgerName ||
                  transaction.confirmedLedgerName ||
                  transaction.suggestedLedgerName ||
                  "Suspense",
                createLedgerName: "",
                createLedgerParentName: "",
              };
            })(),
            saveMapping: true,
          })),
        }),
      });

      if (!queueResponse.ok) {
        throw new Error(await readError(queueResponse));
      }

      const queuedPayload = (await queueResponse.json()) as { queuedCount?: number; commands?: TallyCommand[] };
      setAccounts((current) => [confirmPayload.account, ...current.filter((item) => item.id !== confirmPayload.account.id)]);
      setRecentImports((current) => [confirmPayload.import, ...current.filter((item) => item.id !== confirmPayload.import.id)]);
      setPreview(null);
      setTransactions([]);
      setFile(null);
      setSelectedAccountId("");
      setBanner(null);
      showToast(
        "success",
        `${confirmPayload.importedTransactionCount} transactions imported. ${queuedPayload.queuedCount ?? 0} voucher(s) queued for Tally.`
      );
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Could not send bank statement to Tally.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <div className="fixed bottom-6 right-6 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : toast.tone === "info"
                  ? "border-blue-200 bg-blue-50 text-blue-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
            }`}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            {toast.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1 leading-5">{toast.text}</span>
            <button
              type="button"
              aria-label="Close notification"
              className="-mr-1 rounded-md p-1 opacity-70 transition hover:bg-black/5 hover:opacity-100"
              onClick={() => dismissToast(toast.id)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className={`min-h-screen bg-[#f7f4ee] px-4 py-6 text-[#1a1a1a] sm:px-8 sm:py-8 ${preview ? "pb-40" : ""}`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d8cbbb] bg-[#fffaf2] shadow-sm">
                <Landmark className="h-5 w-5 text-[#69513a]" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-[#181512] sm:text-3xl">
                  Bank Statements
                </h1>
                <p className="mt-1 max-w-2xl text-sm font-medium text-[#7c6f62]">
                  Upload a statement, check the rows, and send them to Tally.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-[#e3d6c6] bg-white px-3 py-2 shadow-sm sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-2">
                {tallyConnected ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-black text-[#2b241d]">
                    {tallyConnected ? "Tally connected" : "Tally not connected"}
                  </div>
                  <div className="truncate text-[11px] font-semibold text-[#8a7f72]">
                    {selectedConnection?.lastCompanyName ||
                      selectedConnection?.status?.replaceAll("_", " ") ||
                      "Open Tally Bridge"}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={refreshTallyConnectionStatus}
                  disabled={refreshingConnections}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-[#d8cbbb] bg-white px-2 text-xs font-bold text-[#6f4e2f] hover:bg-[#fbf7f1] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {refreshingConnections ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh
                </button>
                {!tallyConnected ? (
                  <button
                    type="button"
                    onClick={() => router.push("/tally-prime")}
                    className="inline-flex h-8 items-center rounded-md bg-[#4b3828] px-3 text-xs font-bold text-white hover:bg-[#38291d]"
                  >
                    Retry connection
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          {banner && (
            <div
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
                banner.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : banner.tone === "info"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {banner.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4" />
              )}
              <span>{banner.text}</span>
            </div>
          )}

          {!preview ? (
            <section className="rounded-2xl border border-[#e3d6c6] bg-white p-5 shadow-sm">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.pdf,image/*"
                className="hidden"
                onClick={(event) => {
                  event.currentTarget.value = "";
                }}
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  if (nextFile) void analyzeFile(nextFile);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  const nextFile = event.dataTransfer.files?.[0] ?? null;
                  if (nextFile) void analyzeFile(nextFile);
                }}
                className={`flex min-h-[420px] w-full flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition ${
                  dragActive
                    ? "border-[#7c5f3f] bg-[#fbf4ea]"
                    : "border-[#d6c8b8] bg-[#fdfaf6] hover:border-[#9c7a52] hover:bg-[#fbf4ea]"
                }`}
              >
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#4b3828] text-white shadow-sm">
                  {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
                </div>
                <div className="text-xl font-black text-[#2b241d]">
                  {loading ? "Analyzing statement..." : "Drop bank statement here"}
                </div>
                <div className="mt-2 max-w-md text-sm font-medium leading-6 text-[#8a7f72]">
                  Click to upload or drag a PDF, image, CSV, or text file.
                </div>
                {file ? (
                  <div className="mt-5 rounded-full border border-[#e3d6c6] bg-white px-4 py-2 text-sm font-bold text-[#6f4e2f]">
                    {file.name}
                  </div>
                ) : null}
              </button>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="rounded-2xl border border-[#e3d6c6] bg-white px-4 py-3 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
                  <div className="min-w-0 rounded-xl border border-[#eee5da] bg-[#fdfaf6] px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                      Statement account
                    </div>
                    <div className="mt-2 flex min-w-0 items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-[#2b241d]">
                          {account.bankName || "Bank not found"}
                          {account.accountNumber ? ` · ${maskAccountNumber(account.accountNumber)}` : ""}
                        </div>
                        <div className="truncate text-xs font-semibold text-[#8a7f72]">
                          {account.accountHolderName || "Holder not found"}
                          {account.ifscCode ? ` · ${account.ifscCode}` : ""}
                        </div>
                      </div>
                    </div>
                    {preview.candidates.length > 1 ? (
                      <select
                        value={selectedAccountId || "new"}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSelectedAccountId(value === "new" ? "" : value);
                          const candidate = preview.candidates.find((item) => item.id === value);
                          if (candidate) {
                            setAccount({
                              bankName: candidate.bankName || account.bankName,
                              accountNumber: candidate.accountNumber || account.accountNumber,
                              accountHolderName: candidate.accountHolderName || account.accountHolderName,
                              ifscCode: candidate.ifscCode || account.ifscCode,
                              tallyLedgerName: candidate.tallyLedgerName || account.tallyLedgerName,
                            });
                            if (candidate.tallyLedgerName) setBankLedgerName(candidate.tallyLedgerName);
                          }
                        }}
                        className="mt-3 h-9 w-full rounded-md border border-[#d8cbbb] bg-white px-3 text-sm font-medium outline-none focus:border-[#7c5f3f]"
                      >
                        <option value="new">Use extracted account</option>
                        {preview.candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.accountHolderName || "Saved account"} · {candidate.accountNumberMasked}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>

                  <div className="min-w-0 rounded-xl border border-[#eee5da] bg-[#fdfaf6] px-4 py-3">
                    <div className="flex min-h-7 items-center justify-between gap-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#9a8d7f]">
                        Post entries to Tally bank account
                      </div>
                      <button
                        type="button"
                        onClick={handleSyncLedgerMasters}
                        disabled={!tallyConnectionId || syncingMasters}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[#d8cbbb] bg-white px-2 text-[11px] font-bold text-[#6f4e2f] hover:bg-[#fbf7f1] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {syncingMasters ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Sync
                      </button>
                    </div>
                    {bankLedgerName ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                          <div className="truncate text-sm font-black text-[#2b241d]">{bankLedgerName}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBankLedgerName("")}
                          className="text-xs font-bold text-[#6f4e2f] underline-offset-2 hover:underline"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <LedgerSearchSelect
                          onChange={applyTallyBankLedgerSelection}
                          options={bankLedgerOptions.map((ledger) => ledger.name)}
                          placeholder="Search Tally bank account"
                          value={bankLedgerName}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#e3d6c6] bg-white shadow-sm">
                <div className="border-b border-[#eee5da] px-4 py-3">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <button
                      className={`inline-flex h-9 w-fit items-center gap-2 rounded-md border px-3 text-xs font-black transition ${
                        reviewFiltersOpen || activeReviewFilterCount > 0
                          ? "border-[#7c5f3f] bg-[#fbf4ea] text-[#4b3828]"
                          : "border-[#e3d6c6] bg-[#fbf7f1] text-[#4b3828] hover:bg-[#f6efe6]"
                      }`}
                      onClick={() => setReviewFiltersOpen((current) => !current)}
                      type="button"
                    >
                      <Filter className="h-3.5 w-3.5" />
                      Filters
                      {activeReviewFilterCount > 0 ? (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#4b3828] px-1.5 text-[10px] text-white">
                          {activeReviewFilterCount}
                        </span>
                      ) : null}
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-[#d6c8b8] bg-[#f6efe6] text-[#6f4e2f]" variant="outline">
                        {transactions.length} total
                      </Badge>
                      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800" variant="outline">
                        {matchedLedgerCount} matched
                      </Badge>
                      {needsReviewCount > 0 ? (
                        <Badge className="border-amber-200 bg-amber-50 text-amber-800" variant="outline">
                          {needsReviewCount} needs review
                        </Badge>
                      ) : null}
                      {suspenseLedgerCount > 0 ? (
                        <Badge className="border-amber-200 bg-amber-50 text-amber-800" variant="outline">
                          {suspenseLedgerCount} in suspense
                        </Badge>
                      ) : null}
                      <Badge
                        className={
                          missingLedgerCount === 0
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-800"
                        }
                        variant="outline"
                      >
                        {missingLedgerCount === 0 ? "Ready" : `${missingLedgerCount} need ledger`}
                      </Badge>
                    </div>
                  </div>
                  {reviewFiltersOpen ? (
                    <div className="mt-3 rounded-xl border border-[#e3d6c6] bg-[#fdfaf6] p-3">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] xl:items-end">
                        <label className="block">
                          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a8d7f]">
                            Search
                          </span>
                          <div className="relative mt-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8d7f]" />
                            <input
                              className="h-9 w-full rounded-md border border-[#e3d6c6] bg-white px-3 pl-9 text-xs font-semibold text-[#2b241d] outline-none placeholder:text-[#9a8d7f] focus:border-[#7c5f3f] focus:ring-2 focus:ring-[#7c5f3f]/10"
                              onChange={(event) => setReviewSearch(event.target.value)}
                              placeholder="Narration, amount, ledger, reference..."
                              value={reviewSearch}
                            />
                          </div>
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a8d7f]">
                            Status
                          </span>
                          <select
                            className="mt-1 h-9 w-full rounded-md border border-[#e3d6c6] bg-white px-3 text-xs font-bold text-[#4b3828] outline-none focus:border-[#7c5f3f]"
                            onChange={(event) => setReviewStatusFilter(event.target.value as ReviewStatusFilter)}
                            value={reviewStatusFilter}
                          >
                            <option value="all">All rows</option>
                            <option value="matched">Matched</option>
                            <option value="needs_review">Needs review</option>
                            <option value="suspense">Suspense</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a8d7f]">
                            Type
                          </span>
                          <select
                            className="mt-1 h-9 w-full rounded-md border border-[#e3d6c6] bg-white px-3 text-xs font-bold text-[#4b3828] outline-none focus:border-[#7c5f3f]"
                            onChange={(event) => setReviewDirectionFilter(event.target.value as ReviewDirectionFilter)}
                            value={reviewDirectionFilter}
                          >
                            <option value="all">Debit and credit</option>
                            <option value="debit">Debit only</option>
                            <option value="credit">Credit only</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a8d7f]">
                            From date
                          </span>
                          <div className="relative mt-1">
                            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9a8d7f]" />
                            <input
                              className="h-9 w-full rounded-md border border-[#e3d6c6] bg-white px-3 pl-9 text-xs font-bold text-[#4b3828] outline-none focus:border-[#7c5f3f]"
                              onChange={(event) => setReviewDateFrom(event.target.value)}
                              type="date"
                              value={reviewDateFrom}
                            />
                          </div>
                        </label>
                        <label className="block">
                          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a8d7f]">
                            To date
                          </span>
                          <div className="relative mt-1">
                            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9a8d7f]" />
                            <input
                              className="h-9 w-full rounded-md border border-[#e3d6c6] bg-white px-3 pl-9 text-xs font-bold text-[#4b3828] outline-none focus:border-[#7c5f3f]"
                              onChange={(event) => setReviewDateTo(event.target.value)}
                              type="date"
                              value={reviewDateTo}
                            />
                          </div>
                        </label>
                        <button
                          className="h-9 rounded-md border border-[#e3d6c6] bg-white px-3 text-xs font-bold text-[#7c5f3f] hover:bg-[#fbf4ea]"
                          onClick={() => {
                            setReviewSearch("");
                            setReviewStatusFilter("all");
                            setReviewDirectionFilter("all");
                            setReviewDateFrom("");
                            setReviewDateTo("");
                          }}
                          type="button"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#eee5da] bg-[#fbf7f1] text-[10px] font-black uppercase tracking-[0.14em] text-[#8a7f72]">
                        <th className="w-32 px-3 py-3">Date</th>
                        <th className="px-3 py-3">Narration</th>
                        <th className="w-24 px-3 py-3">Type</th>
                        <th className="w-32 px-3 py-3">Ref / UTR</th>
                        <th className="w-36 px-3 py-3 text-right">Withdrawal (Dr)</th>
                        <th className="w-36 px-3 py-3 text-right">Deposit (Cr)</th>
                        <th className="w-72 px-3 py-3">Tally ledger</th>
                        <th className="w-32 px-3 py-3">Status</th>
                        <th className="w-20 px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee5da]">
                      {transactions.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-sm font-semibold text-[#8a7f72]">
                            No rows were extracted. Upload another file or add rows after extraction support improves.
                          </td>
                        </tr>
                      ) : visibleReviewTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-sm font-semibold text-[#8a7f72]">
                            No rows match the current filters.
                          </td>
                        </tr>
                      ) : (
                        visibleReviewTransactions.map((transaction) => {
                          const debit = formatAmount(transaction.debitAmount);
                          const credit = formatAmount(transaction.creditAmount);
                          const partyTitle = getTransactionPartyTitle(transaction);
                          const direction = getTransactionDirection(transaction);
                          const mode = getTransactionMode(transaction);
                          const reference = getTransactionReference(transaction);
                          const isEditingLedger = editingLedgerIds.has(transaction.id);
                          const showLedgerSelect = isEditingLedger;

                          return (
                            <tr key={transaction.id} className="align-middle text-sm text-[#2b241d] hover:bg-[#fffaf4]">
                              <td className="px-3 py-3 text-xs font-semibold text-[#4b4036]">
                                {formatShortDate(transaction.transactionDate)}
                              </td>
                              <td className="max-w-[360px] px-3 py-3">
                                <div className="truncate text-sm font-black text-[#2b241d]" title={partyTitle}>
                                  {partyTitle}
                                </div>
                                <div className="mt-1 truncate text-xs font-semibold text-[#8a7f72]" title={transaction.description}>
                                  {transaction.description || "Narration not found"}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <Badge
                                  className={
                                    direction === "Credit"
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : "border-red-200 bg-red-50 text-red-700"
                                  }
                                  variant="outline"
                                >
                                  {direction}
                                </Badge>
                              </td>
                              <td className="max-w-[150px] px-3 py-3">
                                <div className="truncate text-xs font-black text-[#4b4036]" title={mode}>
                                  {mode || "-"}
                                </div>
                                <div className="mt-1 truncate text-xs font-semibold text-[#8a7f72]" title={reference}>
                                  {reference || "-"}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right text-xs font-black text-red-600">
                                {debit || "-"}
                              </td>
                              <td className="px-3 py-3 text-right text-xs font-black text-emerald-700">
                                {credit || "-"}
                              </td>
                              <td className="px-3 py-3">
                                {showLedgerSelect ? (
                                  <LedgerReviewSelect
                                    ledgerMasters={ledgerMasters}
                                    onChange={(selection) => {
                                      updateLedgerSelection(transaction.id, selection);
                                      setEditingLedgerIds((current) => {
                                        const next = new Set(current);
                                        next.delete(transaction.id);
                                        return next;
                                      });
                                    }}
                                    transaction={transaction}
                                  />
                                ) : (
                                  <div className="block max-w-full text-left">
                                    <span className="block truncate text-sm font-black text-[#2b241d]" title={transaction.selectedLedgerName}>
                                      {transaction.selectedLedgerName}
                                    </span>
                                    <span className="mt-1 block truncate text-xs font-semibold text-[#8a7f72]">
                                      {getLedgerGroupLabel(transaction, ledgerMasters)}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <Badge className={getReviewStatusClass(transaction)} variant="outline">
                                  {getReviewStatusLabel(transaction)}
                                </Badge>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex justify-end gap-1">
                                  <button
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
                                      isEditingLedger
                                        ? "bg-[#4b3828] text-white hover:bg-[#38291d]"
                                        : "text-[#6f6256] hover:bg-[#f6efe6]"
                                    }`}
                                    onClick={() =>
                                      setEditingLedgerIds((current) => {
                                        const next = new Set(current);
                                        if (next.has(transaction.id)) {
                                          next.delete(transaction.id);
                                        } else {
                                          next.add(transaction.id);
                                        }
                                        return next;
                                      })
                                    }
                                    title={isEditingLedger ? "Close ledger selection" : "Change ledger"}
                                    type="button"
                                  >
                                    {isEditingLedger ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-[#eee5da] px-4 py-3 text-xs font-semibold text-[#6f6256] sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span>Rows per page</span>
                    <select
                      className="h-8 rounded-md border border-[#e3d6c6] bg-white px-2 text-xs font-bold text-[#4b3828] outline-none"
                      onChange={(event) => setRowsPerPage(Number(event.target.value))}
                      value={rowsPerPage}
                    >
                      {[25, 50, 100, 200].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    Showing {visibleReviewTransactions.length === 0 ? 0 : 1}-
                    {visibleReviewTransactions.length} of {filteredTransactions.length}
                  </div>
                </div>
              </div>

              <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#d8cbbb] bg-[#fbf7f1]/95 px-4 py-3 shadow-[0_-8px_24px_rgba(74,56,40,0.10)] backdrop-blur sm:left-[224px] sm:px-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold text-[#5f5348]">
                  {validTransactions.length} row(s) ready after review.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="border-[#d8cbbb] bg-white text-[#2b241d] hover:bg-[#f7efe5]"
                    onClick={() => {
                      setPreview(null);
                      setTransactions([]);
                      setFile(null);
                      setBanner(null);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Upload Another
                  </Button>
                  <Button
                    className="bg-[#4b3828] text-white hover:bg-[#38291d]"
                    onClick={sendToTally}
                    disabled={sending || validTransactions.length === 0}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    Send To Tally
                  </Button>
                </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
