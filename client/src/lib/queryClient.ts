import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Determine backend URL based on current environment
  let backendUrl: string;
  
  if (url.startsWith('http')) {
    // Already a full URL
    backendUrl = url;
  } else {
    // Check if running on production (Hostinger) or development (Replit)
    const hostname = window.location.hostname;
    
    if (hostname === 'runcourier.co.uk' || hostname === 'www.runcourier.co.uk') {
      // Production: use Replit backend
      backendUrl = `https://run-courier-site--almashriqi2010.replit.app${url}`;
    } else {
      // Development: use relative URL (same server)
      backendUrl = url;
    }
  }
  
  const res = await fetch(backendUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
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
    const res = await fetch(url, {
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
