# Price Isolation Verification Checklist

## Business Rules (Non-Negotiable)

| Price Type | Admin | Driver | Customer |
|------------|-------|--------|----------|
| customer_price (total_price) | ✅ Full access | ❌ NEVER visible | ✅ Own jobs only |
| driver_price | ✅ Full access | ✅ Assigned jobs only | ❌ Hidden |
| base_price, surcharges | ✅ Full access | ❌ NEVER visible | ❌ Hidden |

---

## Database-Level Protection (Supabase)

### RLS Policies (007_price_isolation_rls.sql)

| Policy | Target Role | Protection |
|--------|-------------|------------|
| `jobs_service_role` | Backend/Edge Functions | Full access (used by API) |
| `jobs_admin_full_access` | Admin, Dispatcher | All columns, all jobs |
| `jobs_driver_update` | Driver | Can UPDATE assigned jobs (POD/status) - NO SELECT! |
| *(none for SELECT)* | Driver/Customer | **BLOCKED** - Must use safe functions |

### Column-Level Security (SECURITY DEFINER Functions)

**Important**: RLS controls ROW access, NOT column access. Column filtering is enforced via:
1. **SECURITY DEFINER functions** with explicit column lists
2. **API layer** using explicit column selection (never `select('*')`)

| Function | Accessible By | Returns | EXCLUDED |
|----------|---------------|---------|----------|
| `get_driver_jobs_safe()` | Driver (own jobs) | driver_price only | total_price, base_price, all surcharges |
| `get_driver_job_by_id_safe()` | Driver (own job) | driver_price only | total_price, base_price, all surcharges |
| `get_customer_jobs_safe()` | Customer (own jobs) | price_payable (total_price) | driver_price, profit margins |
| `get_admin_jobs_full()` | Admin/Dispatcher only | ALL + profit_margin | None |

**Security Notes**:
- All functions use `SET search_path = public` to prevent hijacking
- All functions verify caller authorization before returning data
- **REVOKE ALL ON jobs FROM authenticated/anon** - Direct table privileges are removed
- **NO RLS SELECT policy for drivers/customers** - Even if privileges weren't revoked, RLS would block
- Drivers MUST use `get_driver_jobs_safe()` RPC function - any direct `supabase.from('jobs').select()` will get permission denied
- This provides defense-in-depth: REVOKE + RLS + column-filtered functions

---

## API-Level Protection (server/mobileRoutes.ts)

### Explicit Column Selection

All driver-facing endpoints now use explicit column lists:

| Endpoint | Protection |
|----------|------------|
| `GET /api/mobile/v1/driver/jobs` | Selects 40+ columns, EXCLUDES total_price/base_price |
| `GET /api/mobile/v1/driver/jobs/:jobId` | Selects driver-safe columns only |
| `PATCH /api/mobile/v1/driver/jobs/:jobId/status` | Selects only validation fields |
| `POST /api/mobile/v1/driver/jobs/:jobId/pod` | Selects only POD-related fields |

### Response Mapping

The `mapSupabaseJobToMobileFormat()` function (line 16) explicitly:
- Maps ONLY `driver_price` to `driverPrice`
- Comments document excluded fields
- Returns null if driver_price not set

---

## Realtime Protection (server/realtime.ts)

### WebSocket Messages

| Message Type | driver_price | customer_price |
|--------------|--------------|----------------|
| `job:assigned` | ✅ Included | ❌ NOT included |
| `job:status_update` | ❌ Not needed | ❌ NOT included |
| `job:created` | ❌ Not needed | ❌ NOT included |

---

## Verification Commands

Run these in Supabase SQL Editor to verify:

```sql
-- 1. Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'jobs';
-- Expected: rowsecurity = true

-- 2. Test driver function (replace with actual driver UUID)
SELECT * FROM get_driver_jobs_safe('driver-uuid-here');
-- Expected: Returns driver_price column, NOT total_price

-- 3. Test customer function (replace with actual customer UUID)
SELECT * FROM get_customer_jobs_safe('customer-uuid-here');
-- Expected: Returns price_payable (total_price), NOT driver_price

-- 4. Test admin function
SELECT * FROM get_admin_jobs_full();
-- Expected: Returns ALL columns including customer_price, driver_price, profit_margin

-- 5. Verify driver function return columns
SELECT proname, pg_get_function_result(oid) 
FROM pg_proc 
WHERE proname = 'get_driver_jobs_safe';
-- Expected: Should NOT include total_price, base_price, etc.

-- 6. Verify functions have proper security
SELECT proname, prosecdef, proconfig 
FROM pg_proc 
WHERE proname IN ('get_driver_jobs_safe', 'get_customer_jobs_safe', 'is_admin_or_dispatcher');
-- Expected: prosecdef = true (SECURITY DEFINER), proconfig includes search_path

-- 7. CRITICAL: Verify driver cannot SELECT directly from jobs
-- (Run as authenticated driver)
SELECT total_price FROM jobs WHERE driver_id = 'driver-uuid-here';
-- Expected: ERROR - no policy allows SELECT for drivers

-- 8. Verify driver CAN use safe function
SELECT * FROM get_driver_jobs_safe('driver-uuid-here');
-- Expected: Returns rows with driver_price, but NO total_price column exists
```

---

## Mobile App Verification

1. **Network Traffic**: Use Charles Proxy or React Native Debugger
   - Inspect `/api/mobile/v1/driver/jobs` response
   - Verify NO fields contain: `total_price`, `base_price`, `customer_price`
   
2. **Console Logging**: Add temporary log in mobile app
   ```typescript
   console.log('Job data received:', JSON.stringify(job, null, 2));
   // Verify only driverPrice is present, no customerPrice/totalPrice
   ```

3. **UI Check**: Confirm driver app shows only one price labeled as their earnings

---

## Audit Trail

- **Migration Created**: `007_price_isolation_rls.sql`
- **API Updated**: `server/mobileRoutes.ts` - All `select('*')` replaced with explicit columns
- **Realtime Verified**: `server/realtime.ts` - JobAssignedMessage only includes driverPrice
- **Documentation**: This file + replit.md updated

---

## Deployment Notes

**Before running the migration:**
1. Verify admin dashboard uses backend API (not direct Supabase client) for job queries
2. Verify customer pages use backend API for job data
3. Test in staging environment first

**Migration will:**
- REVOKE SELECT on jobs table from authenticated/anon roles
- Enable RLS with policies blocking direct driver SELECT
- Create SECURITY DEFINER functions for safe data access

**If clients break after migration:**
- Update clients to use RPC functions instead of direct table queries
- `supabase.rpc('get_driver_jobs_safe', { p_driver_id: '...' })` instead of `supabase.from('jobs').select(...)`

---

## Success Criteria ✓

- [x] Admin assigns job with driver_price → Both prices visible to admin
- [x] Driver receives job via mobile API → ONLY driver_price visible (explicit column selection)
- [x] Customer views job → ONLY customer_price (total_price) visible  
- [x] API level protection via explicit column selection (no `select('*')`)
- [x] Realtime protection via typed message payloads
- [x] Database migration ready with REVOKE + RLS + SECURITY DEFINER functions
- [ ] Migration deployed to Supabase (requires manual deployment after testing)
