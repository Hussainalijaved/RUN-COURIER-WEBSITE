# Run Courier - Supabase Integration Test Checklist

## Pre-Deployment Checklist

### 1. Apply SQL Migrations to Supabase

Run these SQL files in **Supabase SQL Editor** (Dashboard > SQL Editor):

1. **RLS Policies**: `supabase/migrations/rls_policies.sql`
2. **Storage Policies**: `supabase/migrations/storage_policies.sql`

### 2. Verify Environment Variables

#### Website (.env / Replit Secrets)
- [ ] `VITE_SUPABASE_URL` - Supabase project URL (public, frontend)
- [ ] `VITE_SUPABASE_ANON_KEY` - Supabase anon key (public, frontend)
- [ ] `SUPABASE_URL` - Same as above (backend)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Service role key (backend only, NEVER expose!)

#### Expo Mobile App (app.config.js or .env)
- [ ] `EXPO_PUBLIC_SUPABASE_URL` - Same Supabase project URL
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Same anon key

---

## Website Test Cases

### Authentication Tests
| Test Case | Expected Result | Pass |
|-----------|-----------------|------|
| Admin login | Redirects to /admin/dashboard | [ ] |
| Customer login | Redirects to /customer/dashboard | [ ] |
| Driver login | Redirects to /driver/dashboard | [ ] |
| Invalid credentials | Shows error message, no infinite loading | [ ] |
| Session persistence | Refresh page, stay logged in | [ ] |

### Admin - Jobs Page
| Test Case | Expected Result | Pass |
|-----------|-----------------|------|
| Load jobs list | Shows jobs table, no infinite loading | [ ] |
| Network error | Shows error UI with retry button | [ ] |
| Slow loading (>10s) | Shows timeout warning | [ ] |
| Create job | Job appears in list | [ ] |
| Assign driver | Job status updates to "assigned" | [ ] |
| View POD images | Images load (signed URLs work) | [ ] |

### Admin - Documents Page
| Test Case | Expected Result | Pass |
|-----------|-----------------|------|
| Load documents | Shows documents list | [ ] |
| Network error | Shows error UI with retry button | [ ] |
| Approve document | Status changes to "approved" | [ ] |
| Reject document | Status changes to "rejected" | [ ] |
| View document file | File opens (signed URL works) | [ ] |

### Admin - Drivers Page
| Test Case | Expected Result | Pass |
|-----------|-----------------|------|
| List all drivers | Shows all verified drivers | [ ] |
| Deactivate driver | Driver marked inactive | [ ] |
| View driver documents | Documents load correctly | [ ] |

### Customer - Orders Page
| Test Case | Expected Result | Pass |
|-----------|-----------------|------|
| View own orders only | Only shows customer's jobs | [ ] |
| Network error | Shows error UI with retry button | [ ] |
| Track order | Opens tracking page | [ ] |
| View POD | Shows delivery proof images | [ ] |

---

## Expo Mobile App Test Cases

### Driver Authentication
| Test Case | Expected Result | Pass |
|-----------|-----------------|------|
| Driver login | Successfully authenticates | [ ] |
| Invalid credentials | Shows error message | [ ] |
| Token refresh | Session stays active | [ ] |

### Driver - Jobs
| Test Case | Expected Result | Pass |
|-----------|-----------------|------|
| View assigned jobs | Only shows driver's jobs | [ ] |
| Accept job assignment | Status changes to "accepted" | [ ] |
| Reject job assignment | Status changes to "rejected" | [ ] |
| Cannot see other drivers' jobs | RLS enforced | [ ] |

### Driver - POD Upload
| Test Case | Expected Result | Pass |
|-----------|-----------------|------|
| Take photo | Camera opens | [ ] |
| Upload photo to Supabase | Photo uploads to "pod" bucket | [ ] |
| Add signature | Signature captured | [ ] |
| Complete delivery | Job status = "delivered", POD saved | [ ] |
| View uploaded POD | Signed URL works | [ ] |

### Driver - Location Updates
| Test Case | Expected Result | Pass |
|-----------|-----------------|------|
| Update location | Location saved to Supabase | [ ] |
| Location visible on admin map | Real-time update works | [ ] |

---

## RLS Policy Verification

Run these queries in Supabase SQL Editor to verify RLS is working:

```sql
-- Check RLS is enabled on all tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'drivers', 'jobs', 'documents', 'job_assignments');

-- Should return: rowsecurity = true for all tables
```

### Test RLS as Driver (simulate with JWT)
1. Login as a driver on the mobile app
2. Try to access `/rest/v1/jobs` - should only see assigned jobs
3. Try to update another driver's job - should fail

### Test RLS as Customer
1. Login as a customer on the website
2. View orders page - should only see own jobs
3. Cannot see any other customer's jobs

---

## Storage Bucket Verification

```sql
-- Check bucket privacy
SELECT id, name, public FROM storage.buckets;

-- Expected:
-- pod | false (PRIVATE)
-- documents | false (PRIVATE)
-- driver-applications | false (PRIVATE)
```

### Test Signed URLs
1. Upload a POD photo as driver
2. Try to access the raw URL - should fail (403)
3. Access via signed URL - should work

---

## Cross-Platform Sync Verification

| Action | Website Result | Mobile App Result | Pass |
|--------|---------------|-------------------|------|
| Admin assigns job | Shows in admin jobs | Driver receives notification | [ ] |
| Driver accepts job | Status updates | Status updates | [ ] |
| Driver uploads POD | POD visible in job details | POD saved locally | [ ] |
| Admin updates job | Status updates | Real-time update received | [ ] |

---

## Edge Function Deployment

Ensure these Edge Functions are deployed to Supabase:

```bash
supabase functions deploy assign-driver
supabase functions deploy create-driver
supabase functions deploy create-job
supabase functions deploy update-job-status
supabase functions deploy upload-pod
supabase functions deploy send-email
supabase functions deploy stripe-create-payment-intent
supabase functions deploy stripe-webhook
supabase functions deploy withdraw-assignment
supabase functions deploy delete-driver
supabase functions deploy update-driver
```

---

## Troubleshooting

### Infinite Loading
- Check browser console for errors
- Verify Supabase credentials are correct
- Check network tab for failed requests

### RLS Permission Errors
- Verify user has correct role in `auth.users.user_metadata`
- Check if JWT has role claim
- Test with service role key (admin only) to bypass RLS

### POD Upload Failures
- Check bucket exists: `pod`
- Verify storage policies are applied
- Check file size limit (10MB max)
- Verify mime type is allowed

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Admin Tester | | | |
| Customer Tester | | | |
| Driver Tester (Web) | | | |
| Driver Tester (Mobile) | | | |
