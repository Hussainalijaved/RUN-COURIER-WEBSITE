import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeDocUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string' || url.trim() === '') return url || '';
  if (url.startsWith('text:')) return url;
  if (url.startsWith('/api/uploads/')) return url;
  if (url.startsWith('/uploads/')) return '/api' + url;
  const prodMatch = url.match(/^https?:\/\/(?:www\.)?runcourier\.co\.uk\/uploads\/(.+)$/i);
  if (prodMatch) return `/api/uploads/${prodMatch[1]}`;
  const supabaseMatch = url.match(/supabase\.co\/storage\/v1\/object\/(?:public\/)?(?:driver-documents|DRIVER-DOCUMENTS)\/(.+?)(?:\?.*)?$/i);
  if (supabaseMatch) return `/api/uploads/documents/${decodeURIComponent(supabaseMatch[1])}`;
  if (!url.startsWith('http') && !url.startsWith('/')) {
    return `/api/uploads/documents/${url}`;
  }
  return url;
}
