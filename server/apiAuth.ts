/**
 * API Integration Authentication & Security Module
 * Handles: key generation, hashing, client validation, rate limiting, request logging
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db';
import { apiClients, apiLogs } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';

// ─── Key Generation ──────────────────────────────────────────────────────────

/** Generate a cryptographically secure API key with rc_ prefix */
export function generateApiKey(): string {
  const raw = crypto.randomBytes(32).toString('hex');
  return `rc_live_${raw}`;
}

/** Hash an API key using SHA-256 (fast, non-bcrypt for lookup performance) */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/** Extract last 4 chars of the key (after prefix) for masked display */
export function getKeyLast4(key: string): string {
  return key.slice(-4);
}

// ─── Per-Client Rate Limiting ────────────────────────────────────────────────

const rateLimitStore = new Map<number, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60;           // 60 requests per minute per client

function checkRateLimit(clientId: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(clientId);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ─── Duplicate Request Prevention (idempotency key) ─────────────────────────

const recentRequests = new Map<string, number>(); // idempotency_key → timestamp
const DEDUP_WINDOW_MS = 30_000; // 30 seconds

export function duplicateRequestCheck(idempotencyKey: string | undefined): boolean {
  if (!idempotencyKey) return false;
  const key = idempotencyKey.trim().slice(0, 128);
  const now = Date.now();
  // Purge old entries periodically
  if (recentRequests.size > 10_000) {
    for (const [k, t] of recentRequests.entries()) {
      if (now - t > DEDUP_WINDOW_MS) recentRequests.delete(k);
    }
  }
  if (recentRequests.has(key)) return true;
  recentRequests.set(key, now);
  return false;
}

// ─── Request Logging ─────────────────────────────────────────────────────────

export interface LogApiRequestParams {
  apiClientId?: number | null;
  clientName?: string | null;
  endpoint: string;
  method: string;
  requestPayloadSafe?: any;
  responsePayloadSafe?: any;
  statusCode: number;
  success: boolean;
  errorMessage?: string | null;
  bookingReference?: string | null;
  ipAddress?: string | null;
}

export async function logApiRequest(params: LogApiRequestParams): Promise<void> {
  try {
    await db.insert(apiLogs).values({
      apiClientId: params.apiClientId ?? null,
      clientName: params.clientName ?? null,
      endpoint: params.endpoint,
      method: params.method,
      requestPayloadSafe: params.requestPayloadSafe ?? null,
      responsePayloadSafe: params.responsePayloadSafe ?? null,
      statusCode: params.statusCode,
      success: params.success,
      errorMessage: params.errorMessage ?? null,
      bookingReference: params.bookingReference ?? null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch (err) {
    // Non-fatal: log failure should not break the response
    console.error('[API Log] Failed to write log entry:', err);
  }
}

// ─── Permission Validation ───────────────────────────────────────────────────

export type ApiPermission = 'quote' | 'booking' | 'tracking' | 'cancel' | 'webhooks';

const permissionMap: Record<ApiPermission, keyof typeof apiClients.$inferSelect> = {
  quote:    'allowQuote',
  booking:  'allowBooking',
  tracking: 'allowTracking',
  cancel:   'allowCancel',
  webhooks: 'allowWebhooks',
};

export function validateApiPermission(
  client: typeof apiClients.$inferSelect,
  permission: ApiPermission,
): boolean {
  const field = permissionMap[permission];
  return !!(client as any)[field];
}

// ─── Authentication Middleware ────────────────────────────────────────────────

/** Attach the authenticated API client to req for downstream use */
declare global {
  namespace Express {
    interface Request {
      apiClient?: typeof apiClients.$inferSelect;
    }
  }
}

/**
 * Express middleware that validates:
 *  1. API key presence (Authorization: Bearer <key> or X-Api-Key: <key>)
 *  2. Client exists and is active
 *  3. Rate limit not exceeded
 * Sets req.apiClient on success.
 */
export async function authenticateApiClient(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  // Extract key from header
  const authHeader = req.headers['authorization'];
  const xApiKey = req.headers['x-api-key'] as string | undefined;

  let rawKey: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    rawKey = authHeader.slice(7).trim();
  } else if (xApiKey) {
    rawKey = xApiKey.trim();
  }

  if (!rawKey) {
    await logApiRequest({
      endpoint: req.path,
      method: req.method,
      statusCode: 401,
      success: false,
      errorMessage: 'missing_api_key',
      ipAddress: ip,
    });
    res.status(401).json({ error: 'invalid_api_key', message: 'No API key provided.' });
    return;
  }

  // Hash and look up
  const hashed = hashApiKey(rawKey);
  let client: typeof apiClients.$inferSelect | undefined;
  try {
    const rows = await db.select().from(apiClients).where(eq(apiClients.apiKeyHash, hashed)).limit(1);
    client = rows[0];
  } catch (err) {
    console.error('[API Auth] DB error during key lookup:', err);
    res.status(500).json({ error: 'internal_error', message: 'Authentication service unavailable.' });
    return;
  }

  if (!client) {
    await logApiRequest({
      endpoint: req.path,
      method: req.method,
      statusCode: 401,
      success: false,
      errorMessage: 'invalid_api_key',
      ipAddress: ip,
    });
    res.status(401).json({ error: 'invalid_api_key', message: 'Invalid API key.' });
    return;
  }

  if (!client.isActive) {
    await logApiRequest({
      apiClientId: client.id,
      clientName: client.companyName,
      endpoint: req.path,
      method: req.method,
      statusCode: 403,
      success: false,
      errorMessage: 'inactive_client',
      ipAddress: ip,
    });
    res.status(403).json({ error: 'inactive_client', message: 'API access has been disabled for this account.' });
    return;
  }

  // Rate limit
  if (!checkRateLimit(client.id)) {
    res.status(429).json({ error: 'rate_limit_exceeded', message: 'Too many requests. Limit is 60 per minute.' });
    return;
  }

  // Update last_used_at + request_count (fire-and-forget)
  db.update(apiClients)
    .set({
      lastUsedAt: new Date(),
      requestCount: sql`${apiClients.requestCount} + 1`,
    })
    .where(eq(apiClients.id, client.id))
    .catch(err => console.error('[API Auth] Failed to update usage stats:', err));

  req.apiClient = client;
  next();
}

/**
 * Higher-order middleware factory that checks a specific permission AFTER auth.
 * Usage: router.post('/book-job', authenticateApiClient, requireApiPermission('booking'), handler)
 */
export function requireApiPermission(permission: ApiPermission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const client = req.apiClient;
    if (!client) {
      res.status(401).json({ error: 'invalid_api_key', message: 'Not authenticated.' });
      return;
    }
    if (!validateApiPermission(client, permission)) {
      await logApiRequest({
        apiClientId: client.id,
        clientName: client.companyName,
        endpoint: req.path,
        method: req.method,
        statusCode: 403,
        success: false,
        errorMessage: `permission_denied:${permission}`,
      });
      res.status(403).json({
        error: 'permission_denied',
        message: `Your API key does not have '${permission}' access. Contact Run Courier to request this permission.`,
      });
      return;
    }
    next();
  };
}

/** Shared Neon/PG pool factory for API-integration tables */
export async function getApiPool() {
  const { Pool } = await import('pg');
  return new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: parseInt(process.env.PGPORT || '5432'),
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
}
