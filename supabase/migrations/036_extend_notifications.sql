-- Migration 036: Extend notifications table for admin notification hub
-- Adds missing columns to notifications table and creates notification_recipients table
-- Required by POST/GET /api/admin/notifications routes

-- ═══════════════════════════════════════════════════════════════════
-- 1. Add missing columns to notifications table
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_id VARCHAR(36);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_role TEXT DEFAULT 'admin';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_id VARCHAR(36);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS target_user_name TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type TEXT DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sms_sent BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sms_sent_count INTEGER DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Create notification_recipients table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id VARCHAR(36) NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  recipient_user_id VARCHAR(36) NOT NULL,
  recipient_name TEXT,
  recipient_email TEXT,
  recipient_role TEXT DEFAULT 'driver',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notification_recipients_notification_id 
  ON notification_recipients(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_recipient_user_id 
  ON notification_recipients(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_target_type 
  ON notifications(target_type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
  ON notifications(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 3. RLS Policies for notification_recipients
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE notification_recipients ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "service_role_full_access_notification_recipients"
  ON notification_recipients
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Drivers can read their own notifications
CREATE POLICY "drivers_read_own_notification_recipients"
  ON notification_recipients
  FOR SELECT
  USING (recipient_user_id = auth.uid()::text);

-- Drivers can mark their own notifications as read
CREATE POLICY "drivers_update_own_notification_recipients"
  ON notification_recipients
  FOR UPDATE
  USING (recipient_user_id = auth.uid()::text)
  WITH CHECK (recipient_user_id = auth.uid()::text);
