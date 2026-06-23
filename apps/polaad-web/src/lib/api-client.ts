"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const USE_CROSS_ORIGIN_API =
  process.env.NEXT_PUBLIC_USE_DIRECT_API_BASE_URL === "true" && API_BASE_URL.length > 0;
const ACCESS_TOKEN_EXPIRY_SAFETY_MS = 30_000;

let browserClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;
let cachedAccessToken: { token: string; expiresAt: number } | null = null;
let pendingAccessToken: Promise<string | null> | null = null;

function clearCachedAccessToken() {
  cachedAccessToken = null;
  pendingAccessToken = null;
}

function getBrowserClient() {
  if (!browserClient) {
    browserClient = createSupabaseBrowserClient();
    browserClient.auth.onAuthStateChange(clearCachedAccessToken);
  }

  return browserClient;
}

async function readAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }

  if (pendingAccessToken) {
    return pendingAccessToken;
  }

  pendingAccessToken = getBrowserClient()
    .auth.getSession()
    .then(({ data: { session } }) => {
      const token = session?.access_token ?? null;
      const expiresAtSeconds = session?.expires_at;

      if (token && typeof expiresAtSeconds === "number") {
        const expiresAt = expiresAtSeconds * 1000 - ACCESS_TOKEN_EXPIRY_SAFETY_MS;
        if (expiresAt > Date.now()) {
          cachedAccessToken = { token, expiresAt };
        }
      } else {
        cachedAccessToken = null;
      }

      return token;
    })
    .finally(() => {
      pendingAccessToken = null;
    });

  return pendingAccessToken;
}

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!USE_CROSS_ORIGIN_API) {
    return normalizedPath;
  }

  return `${API_BASE_URL}${normalizedPath}`;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const accessToken = await readAccessToken();

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  return fetch(buildApiUrl(path), {
    ...init,
    headers,
    credentials: USE_CROSS_ORIGIN_API ? "omit" : (init?.credentials ?? "same-origin"),
  });
}
