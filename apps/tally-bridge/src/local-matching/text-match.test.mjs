import assert from "node:assert/strict";
import test from "node:test";

import { extractPayeeText, fuseCandidates, textMatchLedgers } from "./text-match.mjs";

const ledger = (name, key = name) => ({ master_key: key, tally_name: name, parent_name: "Sundry Creditors" });
const ledgers = [
  ledger("Goyal Agencies"),
  ledger("Ashirwad Agencies (Jalgaon)"),
  ledger("Sainath Traders"),
  ledger("Abhishek Traders"),
  ledger("Praveen Enterprises"),
  ledger("Trimurti Traders &amp; Hardware"),
  ledger("Anil Traders"),
  ledger("Anil Transport Co."),
];

test("extracts the payee from common bank narration shapes", () => {
  assert.equal(extractPayeeText("NEFT:SAINATH TRADERS:UBIN").trim(), "SAINATH TRADERS");
  assert.equal(extractPayeeText("RTGS :SHREE LAXMI SALES :ICIC").trim(), "SHREE LAXMI SALES");
  assert.equal(extractPayeeText("TO DR NAVANDER R B"), "NAVANDER R B");
  assert.equal(extractPayeeText("IMPS/P2A/629509728569/MUSTAFA ABBA/9325585252/90"), "MUSTAFA ABBA");
  assert.equal(extractPayeeText("INB/RTGS/UTIBR62026102216568551/G AJLAXMI STEEL/ x"), "G AJLAXMI STEEL");
  assert.equal(extractPayeeText("NEFT Cr- TBMC0001007- DWARKADHISH ENTERPRISE- BHAGYA").trim(), "DWARKADHISH ENTERPRISE");
  assert.equal(extractPayeeText("IMPS-AFAJALKHAN AMARULLAK - 07352320000966 - 1856147"), "AFAJALKHAN AMARULLAK");
});

test("an exact party name outranks a lookalike that shares a generic word", () => {
  const hits = textMatchLedgers({ query: "RTGS :ASHIRWAD AGENCIES :UBIN", activeLedgers: ledgers, cacheKey: "t1" });
  assert.equal(hits[0].ledger.tally_name, "Ashirwad Agencies (Jalgaon)");
  const sainath = textMatchLedgers({ query: "NEFT:SAINATH TRADERS:UBIN", activeLedgers: ledgers, cacheKey: "t1" });
  assert.equal(sainath[0].ledger.tally_name, "Sainath Traders");
});

test("spelling variants and HTML-escaped ampersands still match", () => {
  const spelling = textMatchLedgers({ query: "NEFT:PRAVIN ENTERPRISES:IBKL", activeLedgers: ledgers, cacheKey: "t2" });
  assert.equal(spelling[0].ledger.tally_name, "Praveen Enterprises");
  const amp = textMatchLedgers({ query: "NEFT:TRIMURTI TRADERS AND HARDWARE:SBIN", activeLedgers: ledgers, cacheKey: "t2" });
  assert.equal(amp[0].ledger.tally_name, "Trimurti Traders &amp; Hardware");
});

test("ambiguous names surface every plausible ledger", () => {
  const names = textMatchLedgers({ query: "NEFT:ANIL TRADERS:ICIC", activeLedgers: ledgers, cacheKey: "t3" }).map((hit) => hit.ledger.tally_name);
  assert.ok(names.includes("Anil Traders"));
  assert.ok(names.includes("Anil Transport Co."));
});

test("a narration with no usable name yields no text candidates", () => {
  assert.deepEqual(textMatchLedgers({ query: "NEFT:123456:ICIC", activeLedgers: ledgers, cacheKey: "t4" }), []);
});

test("fusion ranks a ledger found by both searches first and keeps text-only hits", () => {
  const a = ledger("A"), b = ledger("B"), c = ledger("C");
  const fused = fuseCandidates({
    vectorHits: [{ ledger: a, vectorScore: 0.7 }, { ledger: b, vectorScore: 0.65 }],
    textHits: [{ ledger: b, textScore: 0.9 }, { ledger: c, textScore: 0.8 }],
    limit: 10,
  });
  assert.deepEqual(fused.map((item) => item.ledger.tally_name), ["B", "A", "C"]);
  assert.equal(fused[0].vectorScore, 0.65);
  assert.equal(fused[0].textScore, 0.9);
  assert.equal(fused[2].vectorScore, null);
});

test("an exact full-name ledger beats one that only ties after stop-word stripping", () => {
  const ledgers = [
    { master_key: "a", tally_name: "Crystal Components India LLP" },
    { master_key: "b", tally_name: "Crystal Components LLP" },
  ];
  const hits = textMatchLedgers({ query: "NEFT CR-UTIB0001234-CRYSTAL COMPONENTS LLP-ADVANCE", activeLedgers: ledgers, cacheKey: "tie-test" });
  assert.equal(hits[0].ledger.tally_name, "Crystal Components LLP");
  assert.ok(hits[0].textScore > hits[1].textScore);
});

test("a distinctive ledger name inside a noisy narration scores as a strong match", () => {
  const ledgers = [
    { master_key: "s", tally_name: "Supabase" },
    { master_key: "r", tally_name: "Rohit" },
    { master_key: "x", tally_name: "Ac Drive Make : Fuji" },
  ];
  const hits = textMatchLedgers({ query: "ME DC SI 416021XXXXXX3033 SUPABASE", activeLedgers: ledgers, cacheKey: "contain-test" });
  assert.equal(hits[0].ledger.tally_name, "Supabase");
  assert.ok(hits[0].textScore >= 0.9);
  const short = textMatchLedgers({ query: "UPI-ROHIT GORE-9307042816-2@AXL", activeLedgers: ledgers, cacheKey: "contain-test2" });
  assert.ok(!short.some((hit) => hit.ledger.tally_name === "Rohit" && hit.textScore >= 0.9));
});
