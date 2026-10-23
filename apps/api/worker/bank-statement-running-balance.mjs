function toMoneyNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

function sameMoney(left, right) {
  return Math.abs(left - right) < 0.01;
}

function positiveMoney(value) {
  const amount = toMoneyNumber(value);
  return amount !== null && amount > 0 ? amount : 0;
}

function scoreSequence(transactions, openingBalance, orientation) {
  const indexes = transactions.map((_transaction, index) => index);
  if (orientation === "reverse") indexes.reverse();
  let previousBalance = toMoneyNumber(openingBalance);
  const breaks = [];
  let checkedTransitions = 0;
  let matchingTransitions = 0;

  for (const index of indexes) {
    const transaction = transactions[index];
    const balance = toMoneyNumber(transaction.balance_amount);
    const debit = positiveMoney(transaction.debit_amount);
    const credit = positiveMoney(transaction.credit_amount);
    if (previousBalance !== null && balance !== null && (debit > 0 || credit > 0)) {
      checkedTransitions += 1;
      const expectedBalance = roundMoney(previousBalance - debit + credit);
      if (sameMoney(expectedBalance, balance)) matchingTransitions += 1;
      else breaks.push({ index, previousBalance, expectedBalance, actualBalance: balance, referenceNumber: transaction.reference_number ?? null });
    }
    if (balance !== null) previousBalance = balance;
  }
  return { orientation, checkedTransitions, matchingTransitions, breaks };
}

function isBetterScore(candidate, other) {
  if (candidate.breaks.length !== other.breaks.length) return candidate.breaks.length < other.breaks.length;
  if (candidate.matchingTransitions !== other.matchingTransitions) return candidate.matchingTransitions > other.matchingTransitions;
  return candidate.checkedTransitions > other.checkedTransitions;
}

export function analyzeRunningBalanceOrder(transactions, openingBalance = null) {
  const forward = scoreSequence(transactions, openingBalance, "forward");
  const reverse = scoreSequence(transactions, openingBalance, "reverse");
  const forwardWins = isBetterScore(forward, reverse);
  const reverseWins = isBetterScore(reverse, forward);
  return {
    orientation: reverseWins ? "reverse" : forwardWins ? "forward" : "unknown",
    selected: reverseWins ? reverse : forward,
    forward,
    reverse,
  };
}

export function validateRunningBalanceContinuity(transactions, openingBalance = null) {
  const analysis = analyzeRunningBalanceOrder(transactions, openingBalance);
  const selected = analysis.selected;
  return {
    status:
      selected.checkedTransitions === 0
        ? "unavailable"
        : selected.breaks.length === 0
          ? "verified"
          : "failed",
    // Keep `valid` for callers, but never certify a sequence when no balance
    // transition was actually checked.
    valid: selected.checkedTransitions > 0 && selected.breaks.length === 0,
    orientation: analysis.orientation,
    checkedTransitions: selected.checkedTransitions,
    matchingTransitions: selected.matchingTransitions,
    breaks: selected.breaks.map((entry) => {
      const provenance = transactions[entry.index]?.raw_payload?.extractionProvenance ?? {};
      return {
        page: Number(provenance.startPage) || null,
        sourceIndex: Number(provenance.sourceIndex) || 0,
        previousBalance: entry.previousBalance,
        expectedBalance: entry.expectedBalance,
        actualBalance: entry.actualBalance,
        referenceNumber: entry.referenceNumber,
      };
    }),
    orderScores: {
      forward: { checkedTransitions: analysis.forward.checkedTransitions, matchingTransitions: analysis.forward.matchingTransitions, breaks: analysis.forward.breaks.length },
      reverse: { checkedTransitions: analysis.reverse.checkedTransitions, matchingTransitions: analysis.reverse.matchingTransitions, breaks: analysis.reverse.breaks.length },
    },
  };
}

export function correctRowsFromRunningBalance(
  transactions,
  { openingBalance = null, detectCategory = (_description, debit, credit) => (credit ? "receipt" : debit ? "payment" : "unknown") } = {}
) {
  const analysis = analyzeRunningBalanceOrder(transactions, openingBalance);
  if (analysis.orientation === "unknown") return transactions;
  const indexes = transactions.map((_transaction, index) => index);
  if (analysis.orientation === "reverse") indexes.reverse();
  const corrected = [...transactions];
  let previousBalance = toMoneyNumber(openingBalance);

  for (const index of indexes) {
    const transaction = transactions[index];
    const balance = toMoneyNumber(transaction.balance_amount);
    const debit = positiveMoney(transaction.debit_amount);
    const credit = positiveMoney(transaction.credit_amount);
    // A single visible Debit or Credit cell is authoritative. Balance
    // movement only resolves rows where extraction populated both columns.
    if (previousBalance !== null && balance !== null && debit > 0 && credit > 0) {
      const delta = roundMoney(balance - previousBalance);
      const expectedAmount = roundMoney(Math.abs(delta));
      if (!sameMoney(delta, 0) && sameMoney(expectedAmount, Math.max(debit, credit))) {
        const correctedDebit = delta < 0 ? expectedAmount : null;
        const correctedCredit = delta > 0 ? expectedAmount : null;
        corrected[index] = {
          ...transaction,
          debit_amount: correctedDebit,
          credit_amount: correctedCredit,
          category: detectCategory(transaction.description, correctedDebit, correctedCredit),
          confidence: Math.max(transaction.confidence ?? 0, 0.9),
          raw_payload: {
            ...(transaction.raw_payload ?? {}),
            balanceCorrection: { orientation: analysis.orientation, previousBalance, balanceAmount: balance, delta, originalDebitAmount: debit, originalCreditAmount: credit },
          },
        };
      }
    }
    if (balance !== null) previousBalance = balance;
  }
  return corrected;
}

// An extractor can read "111854768.56 CR" as a negative balance. When the
// magnitude is exactly what the debit/credit movement predicts and only the sign
// is wrong, the row is repaired and flagged instead of failing the statement.
export function correctBalanceSignFlips(transactions, openingBalance = null) {
  const analysis = analyzeRunningBalanceOrder(transactions, openingBalance);
  if (analysis.orientation === "unknown") return { transactions, repairedCount: 0 };
  const indexes = transactions.map((_transaction, index) => index);
  if (analysis.orientation === "reverse") indexes.reverse();
  const corrected = [...transactions];
  let previousBalance = toMoneyNumber(openingBalance);
  let repairedCount = 0;
  for (const index of indexes) {
    const transaction = transactions[index];
    let balance = toMoneyNumber(transaction.balance_amount);
    const debit = positiveMoney(transaction.debit_amount);
    const credit = positiveMoney(transaction.credit_amount);
    if (previousBalance !== null && balance !== null && balance < 0 && (debit > 0 || credit > 0)) {
      const expected = roundMoney(previousBalance - debit + credit);
      if (!sameMoney(expected, balance) && sameMoney(expected, -balance)) {
        corrected[index] = {
          ...transaction,
          balance_amount: -balance,
          raw_payload: { ...(transaction.raw_payload ?? {}), balanceSignCorrection: { originalBalanceAmount: balance, previousBalance } },
        };
        balance = -balance;
        repairedCount += 1;
      }
    }
    if (balance !== null) previousBalance = balance;
  }
  return { transactions: corrected, repairedCount };
}
