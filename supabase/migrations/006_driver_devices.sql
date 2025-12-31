-- ============================================
-- DRIVER DEVICES TABLE FOR PUSH NOTIFICATIONS
-- Stores FCM/Expo push tokens for driver mobile apps
-- ============================================

CREATE TABLE IF NOT EXISTS public.driver_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    push_token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    device_info TEXT,
    app_version TEXT,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(driver_id, push_token)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_driver_devices_driver_id ON public.driver_devices(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_devices_token ON public.driver_devices(push_token);
CREATE INDEX IF NOT EXISTS idx_driver_devices_last_seen ON public.driver_devices(last_seen_at);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.driver_devices ENABLE ROW LEVEL SECURITY;

-- Drivers can only manage their own devices
DROP POLICY IF EXISTS "Drivers can view own devices" ON public.driver_devices;
CREATE POLICY "Drivers can view own devices" ON public.driver_devices
    FOR SELECT
    USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "Drivers can insert own devices" ON public.driver_devices;
CREATE POLICY "Drivers can insert own devices" ON public.driver_devices
    FOR INSERT
    WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "Drivers can update own devices" ON public.driver_devices;
CREATE POLICY "Drivers can update own devices" ON public.driver_devices
    FOR UPDATE
    USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "Drivers can delete own devices" ON public.driver_devices;
CREATE POLICY "Drivers can delete own devices" ON public.driver_devices
    FOR DELETE
    USING (driver_id = auth.uid());

-- Admins can view all devices
DROP POLICY IF EXISTS "Admins can view all devices" ON public.driver_devices;
CREATE POLICY "Admins can view all devices" ON public.driver_devices
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'dispatcher')
        )
    );

-- Service role (edge functions) can access all devices
DROP POLICY IF EXISTS "Service role full access to devices" ON public.driver_devices;
CREATE POLICY "Service role full access to devices" ON public.driver_devices
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- HELPER FUNCTION: Get active device tokens for a driver
-- ============================================
CREATE OR REPLACE FUNCTION get_driver_device_tokens(p_driver_id UUID)
RETURNS TABLE (push_token TEXT, platform TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT dd.push_token, dd.platform
    FROM public.driver_devices dd
    WHERE dd.driver_id = p_driver_id
    AND dd.last_seen_at > NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_driver_device_tokens TO authenticated;
