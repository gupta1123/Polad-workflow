import test from "node:test";
import assert from "node:assert/strict";
import { planChronologicalBillAllocations } from "./bill-allocation.mjs";

test("plans same-ledger transactions chronologically without reusing consumed bill value", () => {
  const plans = planChronologicalBillAllocations({
    transactions: [
      { transactionId: "later", voucherDate: "2026-05-02", amount: 70, counterpartyLedgerName: "Acme" },
      { transactionId: "first", voucherDate: "2026-05-01", amount: 60, counterpartyLedgerName: "Acme" },
    ],
    verificationRows: [{ transactionId: "first", verificationStatus: "missing" }, { transactionId: "later", verificationStatus: "missing" }],
    openBillsByLedger: { Acme: { complete: true, openBills: [{ referenceName: "A-1", pendingAmount: 100 }], existingAdvances: [] } },
  });
  assert.equal(plans.first.allocations[0].allocatedAmount, 60);
  assert.equal(plans.later.allocations[0].allocatedAmount, 40);
  assert.equal(plans.later.newAdvanceAmount, 30);
});

test("does not auto-plan a ledger with existing advances", () => {
  const plans = planChronologicalBillAllocations({
    transactions: [{ transactionId: "t1", voucherDate: "2026-05-01", amount: 50, counterpartyLedgerName: "Acme" }],
    verificationRows: [{ transactionId: "t1", verificationStatus: "missing" }],
    openBillsByLedger: { Acme: { complete: true, openBills: [], existingAdvances: [{ referenceName: "ADV" }] } },
  });
  assert.deepEqual(plans, {});
});

test("prefers the longest visible bill reference when another bill is its prefix", () => {
  const ledgerName = "Acme";
  const plans = planChronologicalBillAllocations({
    transactions: [{
      transactionId: "t1",
      voucherDate: "2026-09-01",
      amount: 10_000,
      counterpartyLedgerName: ledgerName,
      narration: "AGAINST GKS-OB-SEP26-01-01 NEFT CR FROM ACME",
    }],
    verificationRows: [{ transactionId: "t1", verificationStatus: "missing" }],
    openBillsByLedger: {
      [ledgerName]: {
        complete: true,
        openBills: [
          { referenceName: "OLD-BILL", pendingAmount: 99_000, invoiceDate: "2026-07-01" },
          { referenceName: "GKS-OB-SEP26-01", pendingAmount: 20_000, invoiceDate: "2026-08-31" },
          { referenceName: "GKS-OB-SEP26-01-01", pendingAmount: 10_000, invoiceDate: "2026-08-31" },
        ],
        existingAdvances: [],
      },
    },
  });
  assert.equal(plans.t1.allocations[0].referenceName, "GKS-OB-SEP26-01-01");
});

test("narration with only the invoice number settles that bill, not the oldest", () => {
  const plans = planChronologicalBillAllocations({
    transactions: [{ transactionId: "t1", counterpartyLedgerName: "Arnav", voucherDate: "2026-10-22", creditAmount: 156409, narration: "NEFT CR-UTIB0001234-ARNAV BAJAJ INDUSTRIAL WORKS-55112" }],
    verificationRows: [{ transactionId: "t1", verificationStatus: "missing" }],
    openBillsByLedger: { Arnav: { openBills: [
      { referenceName: "INV/26-27/11074", invoiceDate: "2026-04-01", pendingAmount: 94742 },
      { referenceName: "INV/26-27/55112", invoiceDate: "2026-04-01", pendingAmount: 156409 },
    ], existingAdvances: [] } },
  });
  assert.deepEqual(plans.t1.allocations.map((a) => [a.referenceName, a.allocatedAmount]), [["INV/26-27/55112", 156409]]);
});

test("an existing advance does not block an exact-amount bill", () => {
  const plans = planChronologicalBillAllocations({
    transactions: [{ transactionId: "t2", counterpartyLedgerName: "Neel", voucherDate: "2026-10-22", creditAmount: 326376, narration: "NEFT CR-NEELKANTH" }],
    verificationRows: [{ transactionId: "t2", verificationStatus: "missing" }],
    openBillsByLedger: { Neel: {
      openBills: [
        { referenceName: "INV/26-27/06269", invoiceDate: "2026-04-01", pendingAmount: 326376 },
        { referenceName: "INV/26-27/26173", invoiceDate: "2026-04-04", pendingAmount: 83874 },
      ],
      existingAdvances: [{ referenceName: "Adv/20260424/14490", pendingAmount: 83300 }],
    } },
  });
  assert.deepEqual(plans.t2.allocations.map((a) => [a.referenceName, a.allocatedAmount]), [["INV/26-27/06269", 326376]]);
});

test("an existing advance with no clear target still waits for review", () => {
  const plans = planChronologicalBillAllocations({
    transactions: [{ transactionId: "t3", counterpartyLedgerName: "X", voucherDate: "2026-10-22", creditAmount: 1000, narration: "NEFT" }],
    verificationRows: [{ transactionId: "t3", verificationStatus: "missing" }],
    openBillsByLedger: { X: { openBills: [{ referenceName: "A-1", pendingAmount: 5000 }], existingAdvances: [{ referenceName: "ADV", pendingAmount: 10 }] } },
  });
  assert.equal(plans.t3, undefined);
});
