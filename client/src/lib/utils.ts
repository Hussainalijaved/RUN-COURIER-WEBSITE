import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeDocUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string' || url.trim() === '') return url || '';
  if (url.startsWith('text:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/uploads/')) return url;
  if (url.startsWith('/uploads/')) return '/api' + url;
  if (!url.startsWith('/')) {
    return `/api/uploads/documents/${url}`;
  }
  return url;
}
