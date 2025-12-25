import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

const REPLIT_BACKEND_HOST = 'run-courier-site--almashriqi2010.replit.app';

function getBackendUrl(url: string): string {
  if (url.startsWith('http')) {
    return url;
  }
  
  const hostname = window.location.hostname;
  
  if (hostname === 'runcourier.co.uk' || hostname === 'www.runcourier.co.uk') {
    return `https://${REPLIT_BACKEND_HOST}${url}`;
  }
  
  return url;
}

export function getWebSocketUrl(path: string, baseUrl?: string): string {
  // Handle mobile app or SSR environments where window is not available
  if (typeof window === 'undefined') {
    // Use provided baseUrl or fallback to Replit backend
    const host = baseUrl || REPLIT_BACKEND_HOST;
    return `wss://${host}${path}`;
  }
  
  const hostname = window.location.hostname;
  
  // Frontend hosted on Hostinger - route to Replit backend
  if (hostname === 'runcourier.co.uk' || hostname === 'www.runcourier.co.uk') {
    return `wss://${REPLIT_BACKEND_HOST}${path}`;
  }
  
  // Local development or Replit preview - use same host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const backendUrl = getBackendUrl(url);
  
  console.log(`[API] ${method} ${backendUrl}`);
  
  try {
    const res = await fetch(backendUrl, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
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
    const res = await fetch(backendUrl, {
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
