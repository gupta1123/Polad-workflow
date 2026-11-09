export type CustomerScopeMaster = { name: string; parent: string | null };
export type CustomerScopeMastersResult = {
  masters?: { groups?: unknown; ledgers?: unknown };
  groups?: unknown;
  ledgers?: unknown;
  validatedAt?: unknown;
  fetchedAt?: unknown;
};

function readMasters(value: unknown): CustomerScopeMaster[] {
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const parent = typeof record.parent === "string" && record.parent.trim() ? record.parent.trim() : null;
    return name ? [{ name, parent }] : [];
  });
}

export function readCustomerScopeMasters(value: CustomerScopeMastersResult) {
  // Current connectors send one canonical copy under masters; older versions
  // sent flat arrays. Do not replace an existing list with an empty refresh.
  const groups = readMasters(value.masters?.groups ?? value.groups);
  const ledgers = readMasters(value.masters?.ledgers ?? value.ledgers);
  if (!groups.length) throw new Error("Tally returned no account groups. Check the selected company and try refreshing again.");
  return { groups, ledgers };
}
