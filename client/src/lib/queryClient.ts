import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    const err = new Error(parsed?.message || parsed?.error || `${res.status}: ${text}`);
    if (parsed?.code) (err as any).code = parsed.code;
    if (parsed?.error) (err as any).errorCode = parsed.error;
    throw err;
  }
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    cachedToken = session.access_token;
    tokenExpiry = (session.expires_at || 0) * 1000;
  } else {
    cachedToken = null;
    tokenExpiry = 0;
  }
});

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (cachedToken && Date.now() < tokenExpiry - 30000) {
    return { "Authorization": `Bearer ${cachedToken}` };
  }

  try {
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 3000);
    });
    const sessionPromise = supabase.auth.getSession();
    const result = await Promise.race([sessionPromise, timeoutPromise]);

    if (result && 'data' in result && result.data.session?.access_token) {
      cachedToken = result.data.session.access_token;
      tokenExpiry = (result.data.session.expires_at || 0) * 1000;
      return { "Authorization": `Bearer ${cachedToken}` };
    }
  } catch (error) {
    console.warn("[Auth] Failed to get session:", error);
  }
  return {};
}

function getBackendUrl(url: string): string {
  if (url.startsWith('http')) {
    return url;
  }
  return url;
}

export function getWebSocketUrl(path: string, baseUrl?: string): string {
  if (typeof window === 'undefined') {
    if (baseUrl) {
      return `wss://${baseUrl}${path}`;
    }
    return `wss://runcourier.co.uk${path}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const backendUrl = getBackendUrl(url);
  const authHeaders = await getAuthHeaders();

  try {
    const res = await fetch(backendUrl, {
      method,
      headers: {
        ...authHeaders,
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    await throwIfResNotOk(res);
    return res;
  } catch (err) {
    console.error(`[API] Request failed for ${backendUrl}:`, err);
    throw err;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

function buildUrlFromQueryKey(queryKey: readonly unknown[]): string {
  const parts: string[] = [];
  const params = new URLSearchParams();

  for (const segment of queryKey) {
    if (typeof segment === 'string') {
      parts.push(segment);
    } else if (typeof segment === 'number') {
      parts.push(String(segment));
    } else if (segment && typeof segment === 'object') {
      for (const [key, value] of Object.entries(segment)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
    }
  }

  const baseUrl = parts.join('/').replace(/\/+/g, '/');
  const queryString = params.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = buildUrlFromQueryKey(queryKey);
    const backendUrl = getBackendUrl(url);
    const authHeaders = await getAuthHeaders();

    const res = await fetch(backendUrl, {
      headers: authHeaders,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
