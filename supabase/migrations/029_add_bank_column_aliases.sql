-- Add bank column aliases for mobile app compatibility
-- The mobile app's BankDetailsScreen uses different column names than the backend
-- Mobile app uses: bank_account_name, bank_sort_code, bank_account_number
-- Backend uses: account_holder_name, sort_code, account_number

-- Add the alias columns if they don't exist
DO $$
BEGIN
    -- Add bank_account_name column (alias for account_holder_name)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'bank_account_name') THEN
        ALTER TABLE public.drivers ADD COLUMN bank_account_name TEXT;
    END IF;
    
    -- Add bank_sort_code column (alias for sort_code)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'bank_sort_code') THEN
        ALTER TABLE public.drivers ADD COLUMN bank_sort_code TEXT;
    END IF;
    
    -- Add bank_account_number column (alias for account_number)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'drivers' AND column_name = 'bank_account_number') THEN
        ALTER TABLE public.drivers ADD COLUMN bank_account_number TEXT;
    END IF;
END $$;

-- Create a trigger function to sync bank fields
-- When mobile app updates bank_account_name/bank_sort_code/bank_account_number,
-- it also updates account_holder_name/sort_code/account_number (and vice versa)
CREATE OR REPLACE FUNCTION sync_bank_details()
RETURNS TRIGGER AS $$
BEGIN
    -- Sync from mobile app columns to backend columns
    IF NEW.bank_account_name IS NOT NULL AND NEW.bank_account_name <> '' THEN
        NEW.account_holder_name := NEW.bank_account_name;
    END IF;
    
    IF NEW.bank_sort_code IS NOT NULL AND NEW.bank_sort_code <> '' THEN
        NEW.sort_code := NEW.bank_sort_code;
    END IF;
    
    IF NEW.bank_account_number IS NOT NULL AND NEW.bank_account_number <> '' THEN
        NEW.account_number := NEW.bank_account_number;
    END IF;
    
    -- Sync from backend columns to mobile app columns (for reading)
    IF NEW.account_holder_name IS NOT NULL AND NEW.account_holder_name <> '' THEN
        NEW.bank_account_name := NEW.account_holder_name;
    END IF;
    
    IF NEW.sort_code IS NOT NULL AND NEW.sort_code <> '' THEN
        NEW.bank_sort_code := NEW.sort_code;
    END IF;
    
    IF NEW.account_number IS NOT NULL AND NEW.account_number <> '' THEN
        NEW.bank_account_number := NEW.account_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sync_bank_details_trigger ON public.drivers;

-- Create the trigger
CREATE TRIGGER sync_bank_details_trigger
    BEFORE INSERT OR UPDATE ON public.drivers
    FOR EACH ROW
    EXECUTE FUNCTION sync_bank_details();

-- Ensure RLS policy allows drivers to update their own records
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "drivers_update_own" ON public.drivers;

-- Create policy for drivers to update their own records
CREATE POLICY "drivers_update_own" ON public.drivers
    FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON public.drivers TO authenticated;
