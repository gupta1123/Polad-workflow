// Product branding. The same deployment serves more than one brand: existing
// accounts stay on Polaad, and accounts created on a Nyx email domain get Nyx.
// Anything that only changes the words or the connector link lives here; the
// backend, the data and the Tally logic are shared.

export type BrandId = "polaad" | "nyx";

export interface Brand {
  id: BrandId;
  /** Short name used in sentences, e.g. "Refresh Nyx to confirm the company". */
  name: string;
  /** Full product name for the page title and sign-in screen. */
  product: string;
  description: string;
  /** Single letter shown in the sidebar logo tile. */
  mark: string;
  connectorName: string;
  /** URL scheme the installed Tally connector registers, e.g. nyx-tally://. */
  connectorProtocol: string;
  /** Where the web app sends people to download the matching connector. */
  connectorReleasePrefix: string;
}

export const BRANDS: Record<BrandId, Brand> = {
  polaad: {
    id: "polaad",
    name: "Polaad",
    product: "Polaad Workflows",
    description: "Document, statement, and Tally workflow tools for Polaad.",
    mark: "G",
    connectorName: "Polaad Tally Connector",
    connectorProtocol: "polaad-tally",
    connectorReleasePrefix: "polaad-tally-connector",
  },
  nyx: {
    id: "nyx",
    name: "Nyx",
    product: "Nyx Solution Workflows",
    description: "Document, statement, and Tally workflow tools for Nyx Solution.",
    mark: "N",
    connectorName: "Nyx Tally Connector",
    connectorProtocol: "nyx-tally",
    connectorReleasePrefix: "nyx-tally-connector",
  },
};

const DEFAULT_NYX_EMAIL_DOMAINS = "nyx.com,nyx.local,nyxsolution.com,nyxsolutions.com";

function parseList(value: string | undefined, fallback: string) {
  return (value || fallback)
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/** Brand shown before anyone is signed in. Set NEXT_PUBLIC_DEFAULT_BRAND=nyx on the Nyx site. */
export function defaultBrandId(): BrandId {
  return process.env.NEXT_PUBLIC_DEFAULT_BRAND === "nyx" ? "nyx" : "polaad";
}

/**
 * Existing accounts keep Polaad. An account on a Nyx email domain gets Nyx.
 * Without an email, the deployment default applies.
 */
export function brandIdForEmail(email?: string | null): BrandId {
  const domain = String(email || "").trim().toLowerCase().split("@")[1];
  if (!domain) return defaultBrandId();
  const nyxDomains = parseList(process.env.NEXT_PUBLIC_NYX_EMAIL_DOMAINS, DEFAULT_NYX_EMAIL_DOMAINS);
  return nyxDomains.includes(domain) ? "nyx" : "polaad";
}

export function brandForEmail(email?: string | null): Brand {
  return BRANDS[brandIdForEmail(email)];
}

export function defaultBrand(): Brand {
  return BRANDS[defaultBrandId()];
}
