import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Get Supabase access token for authenticated API requests with timeout
async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    // Add 5 second timeout to prevent hanging (increased from 3s for slow connections)
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 5000);
    });
    
    const sessionPromise = supabase.auth.getSession();
    const result = await Promise.race([sessionPromise, timeoutPromise]);
    
    if (result && 'data' in result && result.data.session?.access_token) {
      console.log("[Auth] Session token available for API request");
      return { "Authorization": `Bearer ${result.data.session.access_token}` };
    }
    
    // Session not available - check if we're on production domain but session is stored
    // This can happen due to race conditions on page load
    if (result === null) {
      console.warn("[Auth] Session request timed out - retrying once");
      // Retry once without timeout as a fallback
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          console.log("[Auth] Session retrieved on retry");
          return { "Authorization": `Bearer ${data.session.access_token}` };
        }
      } catch (retryError) {
        console.warn("[Auth] Retry also failed:", retryError);
      }
    }
    
    console.warn("[Auth] No session available for API request");
  } catch (error) {
    console.warn("[Auth] Failed to get session for API request:", error);
  }
  return {};
}

function getBackendUrl(url: string): string {
  if (url.startsWith('http')) {
    return url;
  }
  // Use same origin for all requests - custom domain handles routing
  return url;
}

export function getWebSocketUrl(path: string, baseUrl?: string): string {
  // Handle mobile app or SSR environments where window is not available
  if (typeof window === 'undefined') {
    // Use provided baseUrl for mobile app or fallback
    if (baseUrl) {
      return `wss://${baseUrl}${path}`;
    }
    // Default fallback for SSR
    return `wss://runcourier.co.uk${path}`;
  }
  
  // Use same host for all environments - custom domain handles routing
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
  
  console.log(`[API] ${method} ${backendUrl}`);
  
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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
