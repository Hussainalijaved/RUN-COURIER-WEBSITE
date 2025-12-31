-- ============================================
-- BATCH JOB ASSIGNMENT TABLES
-- Allows admins to assign multiple jobs to one driver in a single action
-- Jobs remain separate records - drivers see them individually
-- ============================================

-- Job Assignment Batches: Groups of jobs assigned together
CREATE TABLE IF NOT EXISTS public.job_assignment_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    created_by UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partially_withdrawn', 'fully_withdrawn', 'completed')),
    total_jobs INTEGER NOT NULL DEFAULT 0,
    assigned_jobs INTEGER NOT NULL DEFAULT 0,
    withdrawn_jobs INTEGER NOT NULL DEFAULT 0,
    total_driver_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job Assignment Batch Items: Individual jobs within a batch
CREATE TABLE IF NOT EXISTS public.job_assignment_batch_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES public.job_assignment_batches(id) ON DELETE CASCADE,
    job_id UUID NOT NULL,
    driver_price DECIMAL(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'accepted', 'withdrawn', 'completed', 'failed')),
    error_message TEXT,
    withdrawn_at TIMESTAMPTZ,
    withdrawn_by UUID,
    withdrawal_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_batch_driver_status ON public.job_assignment_batches(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_batch_created_by ON public.job_assignment_batches(created_by);
CREATE INDEX IF NOT EXISTS idx_batch_created_at ON public.job_assignment_batches(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_batch_items_batch_status ON public.job_assignment_batch_items(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_batch_items_job_id ON public.job_assignment_batch_items(job_id);

-- Unique constraint to prevent duplicate active assignments
-- A job can only have one non-withdrawn batch item at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_items_unique_active_job 
    ON public.job_assignment_batch_items(job_id) 
    WHERE status NOT IN ('withdrawn', 'failed');

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS on both tables
ALTER TABLE public.job_assignment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_assignment_batch_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Admin full access to batches" ON public.job_assignment_batches;
DROP POLICY IF EXISTS "Service role full access to batches" ON public.job_assignment_batches;
DROP POLICY IF EXISTS "Admin full access to batch items" ON public.job_assignment_batch_items;
DROP POLICY IF EXISTS "Service role full access to batch items" ON public.job_assignment_batch_items;

-- Admin can do everything with batches
CREATE POLICY "Admin full access to batches" ON public.job_assignment_batches
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'dispatcher')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'dispatcher')
        )
    );

-- Service role (edge functions) can access batches
CREATE POLICY "Service role full access to batches" ON public.job_assignment_batches
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Admin can do everything with batch items
CREATE POLICY "Admin full access to batch items" ON public.job_assignment_batch_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'dispatcher')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'dispatcher')
        )
    );

-- Service role (edge functions) can access batch items
CREATE POLICY "Service role full access to batch items" ON public.job_assignment_batch_items
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Note: Drivers have NO access to batch tables
-- They only see jobs via the regular jobs table RLS policies

-- ============================================
-- HELPER FUNCTION: Update batch counters
-- ============================================
CREATE OR REPLACE FUNCTION update_batch_counters()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the batch counters based on item statuses
    UPDATE public.job_assignment_batches
    SET 
        assigned_jobs = (
            SELECT COUNT(*) FROM public.job_assignment_batch_items 
            WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id) 
            AND status IN ('assigned', 'accepted', 'completed')
        ),
        withdrawn_jobs = (
            SELECT COUNT(*) FROM public.job_assignment_batch_items 
            WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id) 
            AND status = 'withdrawn'
        ),
        status = CASE
            WHEN (
                SELECT COUNT(*) FROM public.job_assignment_batch_items 
                WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id) 
                AND status = 'withdrawn'
            ) = total_jobs THEN 'fully_withdrawn'
            WHEN (
                SELECT COUNT(*) FROM public.job_assignment_batch_items 
                WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id) 
                AND status = 'withdrawn'
            ) > 0 THEN 'partially_withdrawn'
            WHEN (
                SELECT COUNT(*) FROM public.job_assignment_batch_items 
                WHERE batch_id = COALESCE(NEW.batch_id, OLD.batch_id) 
                AND status = 'completed'
            ) = total_jobs THEN 'completed'
            ELSE 'active'
        END,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.batch_id, OLD.batch_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update batch counters when items change
DROP TRIGGER IF EXISTS trigger_update_batch_counters ON public.job_assignment_batch_items;
CREATE TRIGGER trigger_update_batch_counters
    AFTER INSERT OR UPDATE OR DELETE ON public.job_assignment_batch_items
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_counters();

-- ============================================
-- HELPER FUNCTION: Batch assign driver (transactional)
-- ============================================
CREATE OR REPLACE FUNCTION batch_assign_driver(
    p_driver_id UUID,
    p_created_by UUID,
    p_job_assignments JSONB, -- Array of {job_id, driver_price}
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_batch_id UUID;
    v_job JSONB;
    v_job_id UUID;
    v_driver_price DECIMAL(10, 2);
    v_total_price DECIMAL(10, 2) := 0;
    v_job_count INTEGER := 0;
    v_results JSONB := '[]'::JSONB;
    v_existing_job RECORD;
BEGIN
    -- Validate driver exists and is active
    IF NOT EXISTS (
        SELECT 1 FROM public.drivers 
        WHERE id = p_driver_id 
        AND is_active = true
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Driver not found or inactive'
        );
    END IF;

    -- Validate all jobs are assignable
    FOR v_job IN SELECT * FROM jsonb_array_elements(p_job_assignments)
    LOOP
        v_job_id := (v_job->>'job_id')::UUID;
        v_driver_price := (v_job->>'driver_price')::DECIMAL(10, 2);
        
        -- Check job exists and is in assignable state
        SELECT * INTO v_existing_job FROM public.jobs WHERE id = v_job_id;
        
        IF v_existing_job IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Job %s not found', v_job_id)
            );
        END IF;
        
        IF v_existing_job.status NOT IN ('pending', 'unassigned') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Job %s is not in assignable state (current: %s)', v_job_id, v_existing_job.status)
            );
        END IF;
        
        IF v_existing_job.driver_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Job %s is already assigned to a driver', v_job_id)
            );
        END IF;
        
        v_total_price := v_total_price + v_driver_price;
        v_job_count := v_job_count + 1;
    END LOOP;

    -- Create the batch
    INSERT INTO public.job_assignment_batches (
        driver_id, created_by, total_jobs, total_driver_price, notes
    ) VALUES (
        p_driver_id, p_created_by, v_job_count, v_total_price, p_notes
    ) RETURNING id INTO v_batch_id;

    -- Assign each job
    FOR v_job IN SELECT * FROM jsonb_array_elements(p_job_assignments)
    LOOP
        v_job_id := (v_job->>'job_id')::UUID;
        v_driver_price := (v_job->>'driver_price')::DECIMAL(10, 2);
        
        -- Get tracking number for this job (before modification)
        SELECT * INTO v_existing_job FROM public.jobs WHERE id = v_job_id;
        
        -- Create batch item
        INSERT INTO public.job_assignment_batch_items (
            batch_id, job_id, driver_price, status
        ) VALUES (
            v_batch_id, v_job_id, v_driver_price, 'assigned'
        );
        
        -- Update the job
        UPDATE public.jobs SET
            driver_id = p_driver_id,
            driver_price = v_driver_price,
            dispatcher_id = p_created_by,
            status = 'assigned',
            updated_at = NOW()
        WHERE id = v_job_id;
        
        -- Add to results with tracking number
        v_results := v_results || jsonb_build_object(
            'job_id', v_job_id,
            'tracking_number', v_existing_job.tracking_number,
            'status', 'assigned',
            'driver_price', v_driver_price
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_batch_id,
        'total_jobs', v_job_count,
        'total_driver_price', v_total_price,
        'jobs', v_results
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Withdraw jobs from batch
-- ============================================
CREATE OR REPLACE FUNCTION withdraw_batch_items(
    p_batch_item_ids UUID[],
    p_withdrawn_by UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_item_id UUID;
    v_item RECORD;
    v_results JSONB := '[]'::JSONB;
    v_withdrawn_count INTEGER := 0;
BEGIN
    FOREACH v_item_id IN ARRAY p_batch_item_ids
    LOOP
        -- Get the batch item
        SELECT * INTO v_item FROM public.job_assignment_batch_items WHERE id = v_item_id;
        
        IF v_item IS NULL THEN
            v_results := v_results || jsonb_build_object(
                'item_id', v_item_id,
                'status', 'error',
                'error', 'Batch item not found'
            );
            CONTINUE;
        END IF;
        
        IF v_item.status = 'withdrawn' THEN
            v_results := v_results || jsonb_build_object(
                'item_id', v_item_id,
                'status', 'already_withdrawn'
            );
            CONTINUE;
        END IF;
        
        -- Check if job has progressed beyond withdrawable state
        IF EXISTS (
            SELECT 1 FROM public.jobs 
            WHERE id = v_item.job_id 
            AND status IN ('collected', 'on_the_way_delivery', 'delivered', 'completed')
        ) THEN
            v_results := v_results || jsonb_build_object(
                'item_id', v_item_id,
                'job_id', v_item.job_id,
                'status', 'error',
                'error', 'Job has progressed too far to withdraw'
            );
            CONTINUE;
        END IF;
        
        -- Update batch item
        UPDATE public.job_assignment_batch_items SET
            status = 'withdrawn',
            withdrawn_at = NOW(),
            withdrawn_by = p_withdrawn_by,
            withdrawal_reason = p_reason,
            updated_at = NOW()
        WHERE id = v_item_id;
        
        -- Update the job - remove driver assignment
        UPDATE public.jobs SET
            driver_id = NULL,
            driver_price = NULL,
            dispatcher_id = NULL,
            status = 'pending',
            updated_at = NOW()
        WHERE id = v_item.job_id;
        
        v_withdrawn_count := v_withdrawn_count + 1;
        v_results := v_results || jsonb_build_object(
            'item_id', v_item_id,
            'job_id', v_item.job_id,
            'status', 'withdrawn'
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'withdrawn_count', v_withdrawn_count,
        'items', v_results
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION batch_assign_driver TO authenticated;
GRANT EXECUTE ON FUNCTION withdraw_batch_items TO authenticated;
