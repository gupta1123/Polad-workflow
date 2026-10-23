// Name-based ledger candidate search. It complements the vector search: exact
// and near-exact party names are found by shared words and letter trigrams,
// which embeddings tend to blur ("Ashirwad Agencies" vs "Goyal Agencies").

const STOP_WORDS = new Set([
  "pvt", "ltd", "limited", "private", "and", "the", "m", "s", "ms", "shri", "shree", "sri",
  "co", "company", "india", "of", "mr", "mrs", "dr",
]);
const MIN_SCORE = 0.3;
const RRF_K = 60;

const indexCache = new Map();

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&amp;|&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return normalize(value).split(" ").filter((token) => token && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function trigrams(value) {
  const padded = ` ${tokens(value).join(" ")} `;
  const grams = new Set();
  for (let index = 0; index < padded.length - 2; index += 1) grams.add(padded.slice(index, index + 3));
  return grams;
}

// Pull the party name out of common bank narration shapes; fall back to the
// whole narration (digits and stop words are dropped by `tokens`).
export function extractPayeeText(description) {
  const text = String(description ?? "").trim();
  let match;
  if ((match = /^(?:NEFT|RTGS)\s*:\s*([^:]+):/i.exec(text))) return match[1];
  if ((match = /^TO\s+DR\s+(.+)$/i.exec(text))) return match[1];
  if ((match = /^(?:NEFT|RTGS|IMPS)\s*(?:Cr|Dr)?\s*-\s*[A-Z]{4}0[A-Z0-9]{6}\s*-\s*([^-]+)-/i.exec(text))) return match[1];
  if ((match = /^IMPS\s*-\s*([^-]+?)\s*-\s*\d{6,}/i.exec(text))) return match[1];
  if ((match = /^IMPS\/P2A\/\d+\/([^/]+)/i.exec(text))) return match[1];
  if ((match = /^(?:INB\/)?(?:RTGS|NEFT|IMPS)\/[^/]+\/([^/]+)/i.exec(text))) {
    if (!/^[A-Z]{4}R?\d/.test(match[1])) return match[1];
  }
  if ((match = /^(?:NEFT|RTGS)\/[A-Z0-9]+\/([^/]+)/i.exec(text))) return match[1];
  return text;
}

function buildIndex(activeLedgers, cacheKey) {
  const cached = indexCache.get(cacheKey);
  if (cached && cached.size === activeLedgers.length) return cached.entries;
  const entries = activeLedgers.map((ledger) => ({
    ledger,
    tokens: new Set(tokens(ledger.tally_name)),
    grams: trigrams(ledger.tally_name),
  }));
  indexCache.set(cacheKey, { size: activeLedgers.length, entries });
  if (indexCache.size > 8) indexCache.delete(indexCache.keys().next().value);
  return entries;
}

export function textMatchLedgers({ query, activeLedgers, cacheKey = "default", limit = 10 }) {
  const payee = extractPayeeText(query);
  const queryTokens = new Set(tokens(payee));
  if (!queryTokens.size) return [];
  const queryGrams = trigrams(payee);
  const scored = [];

  for (const entry of buildIndex(activeLedgers, cacheKey)) {
    let shared = 0;
    for (const token of queryTokens) if (entry.tokens.has(token)) shared += 1;
    let sharedGrams = 0;
    for (const gram of queryGrams) if (entry.grams.has(gram)) sharedGrams += 1;
    const dice = (2 * sharedGrams) / (queryGrams.size + entry.grams.size || 1);
    const jaccard = shared / (queryTokens.size + entry.tokens.size - shared || 1);
    const coverage = shared / queryTokens.size;
    const score = 0.5 * dice + 0.3 * jaccard + 0.2 * coverage;
    if (score >= MIN_SCORE) scored.push({ ledger: entry.ledger, score });
  }

  scored.sort((left, right) => right.score - left.score);
  return scored.slice(0, limit).map((item) => ({ ledger: item.ledger, textScore: Number(item.score.toFixed(4)) }));
}

// Reciprocal-rank fusion of vector hits and text hits (both lists best-first).
export function fuseCandidates({ vectorHits, textHits, limit }) {
  const byKey = new Map();
  const add = (ledger, rank, patch) => {
    const key = ledger.master_key;
    const entry = byKey.get(key) || { ledger, fused: 0, vectorScore: null, textScore: null };
    entry.fused += 1 / (RRF_K + rank);
    Object.assign(entry, patch);
    byKey.set(key, entry);
  };
  vectorHits.forEach((hit, index) => add(hit.ledger, index, { vectorScore: hit.vectorScore }));
  textHits.forEach((hit, index) => add(hit.ledger, index, { textScore: hit.textScore }));
  return [...byKey.values()].sort((left, right) => right.fused - left.fused).slice(0, limit);
}
