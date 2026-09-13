"use client";

let currentUserId = "";
const prefix = "polaad:tally-user:";

export function setTallyStorageUser(userId: string | null) {
  currentUserId = userId || "";
}

export function clearTallyBrowserCredentials() {
  if (typeof window !== "undefined") {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(prefix) || key.startsWith("polaad:tally-connection-control:") ||
          key === "polaad:selected-tally-connection" || key.startsWith("polaad.bankStatements.selectedCompany")) {
        window.localStorage.removeItem(key);
      }
    }
  }
  currentUserId = "";
}

// Legacy unscoped keys are deliberately not imported: the user must re-pair.
export const tallyBrowserStorage = {
  getItem(key: string) {
    if (!currentUserId || typeof window === "undefined") return null;
    return window.localStorage.getItem(`${prefix}${currentUserId}:${key}`);
  },
  setItem(key: string, value: string) {
    if (currentUserId && typeof window !== "undefined") window.localStorage.setItem(`${prefix}${currentUserId}:${key}`, value);
  },
  removeItem(key: string) {
    if (currentUserId && typeof window !== "undefined") window.localStorage.removeItem(`${prefix}${currentUserId}:${key}`);
  },
};
