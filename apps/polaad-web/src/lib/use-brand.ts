"use client";

import { useEffect, useState } from "react";

import { BRANDS, brandForEmail, defaultBrand, type Brand } from "@/lib/brand";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const STORAGE_KEY = "workflow:session-email";

function readStoredEmail() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function storeEmail(email: string) {
  try {
    if (email) window.localStorage.setItem(STORAGE_KEY, email);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked; the brand then follows the live session only.
  }
}

/** Signed-in email (empty while signed out or still loading), plus the brand it maps to. */
export function useSessionBrand(): { email: string; brand: Brand } {
  // Start from the deployment default so server and first client render match.
  const [email, setEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    const stored = readStoredEmail();
    if (stored) setEmail(stored);

    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const next = data.session?.user?.email || "";
        setEmail(next);
        storeEmail(next);
      })
      .catch(() => undefined);

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.email || "";
      setEmail(next);
      storeEmail(next);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { email, brand: email ? brandForEmail(email) : defaultBrand() };
}

export function useBrand(): Brand {
  return useSessionBrand().brand;
}

export { BRANDS };
