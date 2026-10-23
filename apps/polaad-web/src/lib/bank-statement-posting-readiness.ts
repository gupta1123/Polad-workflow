type BillAllocationDraftLike = {
  status: string;
  requiresUserReview: boolean;
  isEligibleForPosting: boolean;
  unallocatedAmount: number;
  allocations: Array<{ referenceName: string; allocatedAmount: number }>;
};

type PostingReadiness = {
  ledgerName: string;
  ledgerNeedsReview: boolean;
  presence?: { status: string; duplicateInTally?: boolean };
  billRequired: boolean;
  amount: number;
  // True until the user runs "Check Tally matches". Before that the connector's
  // live duplicate preflight is the authority; afterwards a row must have been
  // checked and found missing, so a failed check never silently turns into a post.
  directPosting?: boolean;
  postingRecorded?: boolean;
  allocation?: BillAllocationDraftLike;
};

// A draft is only posted against bills when it is complete and adds up to the
// bank amount. Anything else (needs review, cannot match, partly allocated,
// stale) is posted straight to the party ledger without bill references.
export function hasUsableBillAllocation(draft: BillAllocationDraftLike | null | undefined, amount: number): boolean {
  if (!draft || draft.status !== "ready_to_post" || draft.requiresUserReview || !draft.isEligibleForPosting) return false;
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (!Number.isFinite(draft.unallocatedAmount) || Math.abs(draft.unallocatedAmount) >= 0.005) return false;
  if (!draft.allocations.length || draft.allocations.some((line) =>
    !line.referenceName.trim() || !Number.isFinite(line.allocatedAmount) || line.allocatedAmount <= 0
  )) return false;
  const total = draft.allocations.reduce((sum, line) => sum + line.allocatedAmount, 0);
  return Math.abs(total - amount) < 0.005;
}

// Shared by the displayed counts and the rows sent to confirmation/queueing.
// Bill allocation never blocks posting: a row either carries a usable
// allocation or goes out as a direct voucher. Duplicate and ledger checks still
// hold a row back.
export function isReadyForTallyPosting(row: PostingReadiness): boolean {
  if (row.postingRecorded) return false;
  if (!row.ledgerName.trim() || row.ledgerNeedsReview) return false;
  if (row.presence?.duplicateInTally) return false;
  if (row.directPosting) {
    if (row.presence && !["missing", "not_checked"].includes(row.presence.status)) return false;
  } else if (row.presence?.status !== "missing") return false;
  return Number.isFinite(row.amount) && row.amount > 0;
}
