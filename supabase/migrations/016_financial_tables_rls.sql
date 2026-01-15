-- ============================================
-- EXTEND RLS TO FINANCIAL TABLES
-- ============================================
-- Tables covered: invoices, invoice_payment_tokens, customers, driver_payments
-- 
-- Security requirements:
-- - Admins: FULL read/write access to all financial tables
-- - Dispatchers: READ-only access (SELECT only)
-- - Customers: Can only see their own invoices (SELECT only)
-- - Drivers: No direct access to invoices
--
-- This migration:
-- 1. Uses existing is_admin_by_email() and is_dispatcher() functions from migration 015
-- 2. Adds admin and dispatcher policies to financial tables
-- 3. Adds customer self-access policy for invoices
-- 4. Does NOT weaken security for non-admin users
-- ============================================

-- ============================================
-- STEP 1: FIX INVOICES TABLE RLS
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_schema = 'public') THEN
        EXECUTE 'ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY';
        
        -- Drop existing policies
        EXECUTE 'DROP POLICY IF EXISTS "Admins can manage invoices" ON public.invoices';
        EXECUTE 'DROP POLICY IF EXISTS "invoices_admin_full_access" ON public.invoices';
        EXECUTE 'DROP POLICY IF EXISTS "invoices_dispatcher_select" ON public.invoices';
        EXECUTE 'DROP POLICY IF EXISTS "invoices_customer_select" ON public.invoices';
        EXECUTE 'DROP POLICY IF EXISTS "invoices_service_role" ON public.invoices';
        
        -- 1. Service role full access
        EXECUTE 'CREATE POLICY "invoices_service_role" ON public.invoices
            FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';
        
        -- 2. Admin FULL access (email-based) - can resend, mark as paid, print, etc.
        EXECUTE 'CREATE POLICY "invoices_admin_full_access" ON public.invoices
            FOR ALL USING (public.is_admin_by_email()) WITH CHECK (public.is_admin_by_email())';
        
        -- 3. Dispatcher READ-only access
        EXECUTE 'CREATE POLICY "invoices_dispatcher_select" ON public.invoices
            FOR SELECT USING (public.is_dispatcher())';
        
        -- 4. Customers can only see their own invoices (READ-only)
        -- This uses customer_id to match auth.uid() 
        EXECUTE 'CREATE POLICY "invoices_customer_select" ON public.invoices
            FOR SELECT USING (
                customer_id IS NOT NULL 
                AND customer_id::text = auth.uid()::text
            )';
        
        RAISE NOTICE 'RLS policies applied to invoices table';
    ELSE
        RAISE NOTICE 'invoices table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- STEP 2: FIX INVOICE_PAYMENT_TOKENS TABLE RLS
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoice_payment_tokens' AND table_schema = 'public') THEN
        EXECUTE 'ALTER TABLE public.invoice_payment_tokens ENABLE ROW LEVEL SECURITY';
        
        -- Drop existing policies
        EXECUTE 'DROP POLICY IF EXISTS "invoice_payment_tokens_admin_full_access" ON public.invoice_payment_tokens';
        EXECUTE 'DROP POLICY IF EXISTS "invoice_payment_tokens_dispatcher_select" ON public.invoice_payment_tokens';
        EXECUTE 'DROP POLICY IF EXISTS "invoice_payment_tokens_service_role" ON public.invoice_payment_tokens';
        EXECUTE 'DROP POLICY IF EXISTS "invoice_payment_tokens_public_select" ON public.invoice_payment_tokens';
        EXECUTE 'DROP POLICY IF EXISTS "Service role full access to payment tokens" ON public.invoice_payment_tokens';
        EXECUTE 'DROP POLICY IF EXISTS "Public can view payment token for payment flow" ON public.invoice_payment_tokens';
        
        -- 1. Service role full access
        EXECUTE 'CREATE POLICY "invoice_payment_tokens_service_role" ON public.invoice_payment_tokens
            FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';
        
        -- 2. Admin FULL access (email-based)
        EXECUTE 'CREATE POLICY "invoice_payment_tokens_admin_full_access" ON public.invoice_payment_tokens
            FOR ALL USING (public.is_admin_by_email()) WITH CHECK (public.is_admin_by_email())';
        
        -- 3. Dispatcher READ-only access
        EXECUTE 'CREATE POLICY "invoice_payment_tokens_dispatcher_select" ON public.invoice_payment_tokens
            FOR SELECT USING (public.is_dispatcher())';
        
        -- 4. Anon users can SELECT by token (needed for payment flow)
        -- Note: Actual token lookup is done via service role API, this is a fallback
        -- The payment page already uses the server-side API with service_role to fetch tokens
        -- No public policy needed - remove to prevent data leak
        -- If direct client access is needed in future, use RPC with SECURITY DEFINER
        
        RAISE NOTICE 'RLS policies applied to invoice_payment_tokens table';
    ELSE
        RAISE NOTICE 'invoice_payment_tokens table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- STEP 3: FIX CUSTOMERS TABLE RLS (if it exists separately from users)
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers' AND table_schema = 'public') THEN
        EXECUTE 'ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY';
        
        -- Drop existing policies
        EXECUTE 'DROP POLICY IF EXISTS "customers_admin_full_access" ON public.customers';
        EXECUTE 'DROP POLICY IF EXISTS "customers_dispatcher_select" ON public.customers';
        EXECUTE 'DROP POLICY IF EXISTS "customers_service_role" ON public.customers';
        EXECUTE 'DROP POLICY IF EXISTS "customers_select_own" ON public.customers';
        
        -- 1. Service role full access
        EXECUTE 'CREATE POLICY "customers_service_role" ON public.customers
            FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';
        
        -- 2. Admin FULL access (email-based)
        EXECUTE 'CREATE POLICY "customers_admin_full_access" ON public.customers
            FOR ALL USING (public.is_admin_by_email()) WITH CHECK (public.is_admin_by_email())';
        
        -- 3. Dispatcher READ-only access
        EXECUTE 'CREATE POLICY "customers_dispatcher_select" ON public.customers
            FOR SELECT USING (public.is_dispatcher())';
        
        -- 4. Customers can see their own record
        EXECUTE 'CREATE POLICY "customers_select_own" ON public.customers
            FOR SELECT USING (auth.uid() = id)';
        
        RAISE NOTICE 'RLS policies applied to customers table';
    ELSE
        RAISE NOTICE 'customers table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- STEP 4: FIX DRIVER_PAYMENTS TABLE RLS
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'driver_payments' AND table_schema = 'public') THEN
        EXECUTE 'ALTER TABLE public.driver_payments ENABLE ROW LEVEL SECURITY';
        
        -- Drop existing policies
        EXECUTE 'DROP POLICY IF EXISTS "driver_payments_admin_full_access" ON public.driver_payments';
        EXECUTE 'DROP POLICY IF EXISTS "driver_payments_dispatcher_select" ON public.driver_payments';
        EXECUTE 'DROP POLICY IF EXISTS "driver_payments_service_role" ON public.driver_payments';
        EXECUTE 'DROP POLICY IF EXISTS "driver_payments_select_own" ON public.driver_payments';
        
        -- 1. Service role full access
        EXECUTE 'CREATE POLICY "driver_payments_service_role" ON public.driver_payments
            FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';
        
        -- 2. Admin FULL access (email-based)
        EXECUTE 'CREATE POLICY "driver_payments_admin_full_access" ON public.driver_payments
            FOR ALL USING (public.is_admin_by_email()) WITH CHECK (public.is_admin_by_email())';
        
        -- 3. Dispatcher READ-only access
        EXECUTE 'CREATE POLICY "driver_payments_dispatcher_select" ON public.driver_payments
            FOR SELECT USING (public.is_dispatcher())';
        
        -- 4. Drivers can see their own payments
        EXECUTE 'CREATE POLICY "driver_payments_select_own" ON public.driver_payments
            FOR SELECT USING (auth.uid() = driver_id)';
        
        RAISE NOTICE 'RLS policies applied to driver_payments table';
    ELSE
        RAISE NOTICE 'driver_payments table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- STEP 5: FIX USERS TABLE RLS (for admin access to customer data)
-- ============================================
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public') THEN
        EXECUTE 'ALTER TABLE public.users ENABLE ROW LEVEL SECURITY';
        
        -- Drop existing policies to recreate
        EXECUTE 'DROP POLICY IF EXISTS "users_admin_full_access" ON public.users';
        EXECUTE 'DROP POLICY IF EXISTS "users_dispatcher_select" ON public.users';
        EXECUTE 'DROP POLICY IF EXISTS "users_service_role" ON public.users';
        EXECUTE 'DROP POLICY IF EXISTS "users_select_own" ON public.users';
        EXECUTE 'DROP POLICY IF EXISTS "users_update_own" ON public.users';
        EXECUTE 'DROP POLICY IF EXISTS "Admin full access to users" ON public.users';
        
        -- 1. Service role full access
        EXECUTE 'CREATE POLICY "users_service_role" ON public.users
            FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')';
        
        -- 2. Admin FULL access (email-based)
        EXECUTE 'CREATE POLICY "users_admin_full_access" ON public.users
            FOR ALL USING (public.is_admin_by_email()) WITH CHECK (public.is_admin_by_email())';
        
        -- 3. Dispatcher READ-only access
        EXECUTE 'CREATE POLICY "users_dispatcher_select" ON public.users
            FOR SELECT USING (public.is_dispatcher())';
        
        -- 4. Users can view their own profile
        EXECUTE 'CREATE POLICY "users_select_own" ON public.users
            FOR SELECT USING (auth.uid() = id)';
        
        -- 5. Users can update their own profile
        EXECUTE 'CREATE POLICY "users_update_own" ON public.users
            FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id)';
        
        RAISE NOTICE 'RLS policies applied to users table';
    ELSE
        RAISE NOTICE 'users table does not exist, skipping';
    END IF;
END $$;

-- ============================================
-- VERIFICATION (Run manually after migration)
-- ============================================
-- Login as admin and verify:
-- SELECT * FROM invoices;  -- Should return all invoices
-- SELECT * FROM invoice_payment_tokens;  -- Should return all tokens
-- SELECT * FROM users WHERE role = 'customer';  -- Should return all customers
--
-- Admin actions that should now work:
-- 1. Print invoices (viewing invoice details)
-- 2. Resend invoices (updating/triggering email)
-- 3. Mark invoices as paid (UPDATE status)
-- 4. View all customer information
-- ============================================
