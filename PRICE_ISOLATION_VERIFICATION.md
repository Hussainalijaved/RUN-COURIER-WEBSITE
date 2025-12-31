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
| `jobs_service_role` | Backend/Edge Functions | Full access |
| `jobs_admin_full_access` | Admin, Dispatcher | All columns, all jobs |
| `jobs_driver_select` | Driver | Row access to assigned jobs only |
| `jobs_driver_update` | Driver | Can update POD/status only |
| `jobs_customer_select` | Customer | Row access to own jobs only |

### Column-Level Security (Views)

| View | Columns Included | Columns EXCLUDED |
|------|------------------|------------------|
| `admin_jobs_view` | ALL + profit_margin | None |
| `driver_jobs_view` | driver_price only | total_price, base_price, all surcharges |
| `customer_jobs_view` | total_price (as price_payable) | driver_price, coordinates |

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

-- 2. Test as driver (replace with actual driver UUID)
SET LOCAL ROLE authenticated;
SET request.jwt.claim.sub = 'driver-uuid-here';
SELECT id, driver_price, total_price FROM jobs LIMIT 1;
-- Expected: ERROR or total_price should be NULL/hidden

-- 3. Verify driver view excludes customer pricing
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'driver_jobs_view';
-- Expected: Should NOT include total_price, base_price, etc.

-- 4. Verify admin view includes all pricing
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'admin_jobs_view';
-- Expected: Should include customer_price (total_price), driver_price, profit_margin
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

## Success Criteria ✓

- [x] Admin assigns job with driver_price → Both prices visible to admin
- [x] Driver receives job → ONLY driver_price visible
- [x] Customer views job → ONLY customer_price (total_price) visible  
- [x] Database level protection via RLS + views
- [x] API level protection via explicit column selection
- [x] Realtime protection via typed message payloads
- [x] No `select('*')` in driver-facing endpoints
