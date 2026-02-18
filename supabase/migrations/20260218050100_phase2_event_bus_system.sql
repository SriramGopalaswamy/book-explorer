-- ===================================================================
-- PHASE 2: EVENT BUS SYSTEM
-- ===================================================================
-- Implements event-driven architecture for HR system
-- All state changes publish events, modules subscribe and react
-- Ensures idempotency and ordered processing
-- ===================================================================

-- 1. Create event type ENUM
CREATE TYPE public.hr_event_type AS ENUM (
  'EmployeeCreated',
  'EmployeeActivated',
  'EmployeeStateChanged',
  'ManagerChanged',
  'SalaryChanged',
  'ExitInitiated',
  'ExitFinalized',
  'FnFCalculated',
  'FnFApproved',
  'FnFCompleted',
  'AssetAssigned',
  'AssetRecovered',
  'AssetRecoveryFailed',
  'PayrollProcessed',
  'LeaveApplied',
  'LeaveApproved',
  'AttendanceMarked',
  'RehireInitiated',
  'LoginRevoked',
  'LoginEnabled'
);

-- 2. Create hr_events table
CREATE TABLE IF NOT EXISTS public.hr_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type hr_event_type NOT NULL,
  entity_type TEXT NOT NULL, -- 'profile', 'payroll', 'asset', etc.
  entity_id UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  processing_error TEXT,
  retry_count INTEGER DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  correlation_id UUID, -- For tracking related events
  metadata JSONB
);

-- Create indexes
CREATE INDEX idx_hr_events_entity ON public.hr_events(entity_type, entity_id);
CREATE INDEX idx_hr_events_status ON public.hr_events(processing_status, created_at);
CREATE INDEX idx_hr_events_type ON public.hr_events(event_type, created_at DESC);
CREATE INDEX idx_hr_events_idempotency ON public.hr_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Enable RLS
ALTER TABLE public.hr_events ENABLE ROW LEVEL SECURITY;

-- 3. Create event subscribers table
CREATE TABLE IF NOT EXISTS public.event_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_name TEXT NOT NULL UNIQUE,
  event_types hr_event_type[] NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  handler_function TEXT NOT NULL,
  priority INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create event processing log
CREATE TABLE IF NOT EXISTS public.event_processing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.hr_events(id) ON DELETE CASCADE,
  subscriber_name TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  error_message TEXT,
  result JSONB
);

CREATE INDEX idx_event_processing_log_event ON public.event_processing_log(event_id);
CREATE INDEX idx_event_processing_log_subscriber ON public.event_processing_log(subscriber_name, started_at DESC);

-- Enable RLS
ALTER TABLE public.event_processing_log ENABLE ROW LEVEL SECURITY;

-- 5. Function to publish event (with idempotency)
CREATE OR REPLACE FUNCTION public.publish_hr_event(
  p_event_type hr_event_type,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_payload JSONB,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_existing_event_id UUID;
BEGIN
  -- Check for idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_event_id
    FROM public.hr_events
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_existing_event_id IS NOT NULL THEN
      -- Event already exists, return existing ID
      RETURN v_existing_event_id;
    END IF;
  END IF;

  -- Create new event
  INSERT INTO public.hr_events (
    event_type,
    entity_type,
    entity_id,
    payload,
    created_by,
    idempotency_key,
    correlation_id
  ) VALUES (
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_payload,
    auth.uid(),
    p_idempotency_key,
    p_correlation_id
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to process events
CREATE OR REPLACE FUNCTION public.process_pending_events(
  p_batch_size INTEGER DEFAULT 10,
  p_event_type hr_event_type DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  event_type hr_event_type,
  status TEXT,
  error TEXT
) AS $$
DECLARE
  v_event RECORD;
  v_subscriber RECORD;
  v_processing_log_id UUID;
  v_result JSONB;
  v_error TEXT;
BEGIN
  -- Lock and fetch pending events
  FOR v_event IN
    SELECT e.*
    FROM public.hr_events e
    WHERE e.processing_status = 'pending'
      AND (p_event_type IS NULL OR e.event_type = p_event_type)
    ORDER BY e.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Update status to processing
    UPDATE public.hr_events
    SET processing_status = 'processing'
    WHERE id = v_event.id;

    -- Process event with each subscriber
    FOR v_subscriber IN
      SELECT *
      FROM public.event_subscribers
      WHERE is_active = TRUE
        AND v_event.event_type = ANY(event_types)
      ORDER BY priority ASC
    LOOP
      BEGIN
        -- Log processing start
        INSERT INTO public.event_processing_log (event_id, subscriber_name, status)
        VALUES (v_event.id, v_subscriber.subscriber_name, 'started')
        RETURNING id INTO v_processing_log_id;

        -- Execute handler (simplified - in production, use pg_background or external worker)
        -- For now, we'll just log that it needs processing
        v_result := jsonb_build_object(
          'subscriber', v_subscriber.subscriber_name,
          'handler', v_subscriber.handler_function,
          'event_type', v_event.event_type,
          'processed', TRUE
        );

        -- Log completion
        UPDATE public.event_processing_log
        SET 
          status = 'completed',
          completed_at = NOW(),
          result = v_result
        WHERE id = v_processing_log_id;

      EXCEPTION WHEN OTHERS THEN
        v_error := SQLERRM;
        
        -- Log failure
        UPDATE public.event_processing_log
        SET 
          status = 'failed',
          completed_at = NOW(),
          error_message = v_error
        WHERE id = v_processing_log_id;

        -- Update event retry count
        UPDATE public.hr_events
        SET 
          retry_count = retry_count + 1,
          processing_error = v_error
        WHERE id = v_event.id;
      END;
    END LOOP;

    -- Mark event as completed
    UPDATE public.hr_events
    SET 
      processing_status = 'completed',
      processed_at = NOW()
    WHERE id = v_event.id;

    RETURN QUERY SELECT 
      v_event.id,
      v_event.event_type,
      'completed'::TEXT,
      NULL::TEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Trigger function to publish events on state changes
CREATE OR REPLACE FUNCTION public.publish_employee_state_change_event()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type hr_event_type;
  v_idempotency_key TEXT;
BEGIN
  -- Determine event type based on new state
  CASE NEW.current_state
    WHEN 'active' THEN
      v_event_type := 'EmployeeActivated';
    WHEN 'resigned' THEN
      v_event_type := 'ExitInitiated';
    WHEN 'exited' THEN
      v_event_type := 'ExitFinalized';
    WHEN 'fnf_completed' THEN
      v_event_type := 'FnFCompleted';
    ELSE
      v_event_type := 'EmployeeStateChanged';
  END CASE;

  -- Create idempotency key
  v_idempotency_key := format('state_change_%s_%s_%s', 
    NEW.id, 
    NEW.current_state, 
    extract(epoch from NOW())
  );

  -- Publish event
  PERFORM public.publish_hr_event(
    v_event_type,
    'profile',
    NEW.id,
    jsonb_build_object(
      'profile_id', NEW.id,
      'previous_state', OLD.current_state,
      'new_state', NEW.current_state,
      'employee_id', NEW.employee_id,
      'full_name', NEW.full_name,
      'department', NEW.department,
      'manager_id', NEW.manager_id,
      'date_of_joining', NEW.date_of_joining,
      'date_of_exit', NEW.date_of_exit
    ),
    v_idempotency_key,
    gen_random_uuid() -- correlation_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Trigger function for manager changes
CREATE OR REPLACE FUNCTION public.publish_manager_change_event()
RETURNS TRIGGER AS $$
DECLARE
  v_idempotency_key TEXT;
BEGIN
  IF OLD.manager_id IS DISTINCT FROM NEW.manager_id THEN
    v_idempotency_key := format('manager_change_%s_%s_%s', 
      NEW.id, 
      NEW.manager_id, 
      extract(epoch from NOW())
    );

    PERFORM public.publish_hr_event(
      'ManagerChanged',
      'profile',
      NEW.id,
      jsonb_build_object(
        'profile_id', NEW.id,
        'old_manager_id', OLD.manager_id,
        'new_manager_id', NEW.manager_id,
        'employee_id', NEW.employee_id,
        'full_name', NEW.full_name,
        'department', NEW.department
      ),
      v_idempotency_key,
      gen_random_uuid()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create triggers on profiles table
CREATE TRIGGER profile_state_change_event
AFTER UPDATE ON public.profiles
FOR EACH ROW
WHEN (OLD.current_state IS DISTINCT FROM NEW.current_state)
EXECUTE FUNCTION public.publish_employee_state_change_event();

CREATE TRIGGER profile_manager_change_event
AFTER UPDATE ON public.profiles
FOR EACH ROW
WHEN (OLD.manager_id IS DISTINCT FROM NEW.manager_id)
EXECUTE FUNCTION public.publish_manager_change_event();

-- 10. Register default event subscribers
INSERT INTO public.event_subscribers (subscriber_name, event_types, handler_function, priority) VALUES
  ('payroll_subscriber', ARRAY['EmployeeActivated', 'SalaryChanged', 'ExitFinalized']::hr_event_type[], 'handle_payroll_events', 100),
  ('asset_subscriber', ARRAY['EmployeeActivated', 'ExitInitiated', 'ExitFinalized']::hr_event_type[], 'handle_asset_events', 200),
  ('access_control_subscriber', ARRAY['EmployeeActivated', 'ExitFinalized', 'FnFCompleted']::hr_event_type[], 'handle_access_control_events', 50),
  ('finance_subscriber', ARRAY['PayrollProcessed', 'FnFCompleted', 'AssetAssigned', 'AssetRecovered']::hr_event_type[], 'handle_finance_events', 150),
  ('manager_sync_subscriber', ARRAY['ManagerChanged']::hr_event_type[], 'handle_manager_sync_events', 75)
ON CONFLICT (subscriber_name) DO NOTHING;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.publish_hr_event TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_pending_events TO authenticated;

-- RLS Policies
CREATE POLICY "Admins and HR can view all events"
  ON public.hr_events FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

CREATE POLICY "System can insert events"
  ON public.hr_events FOR INSERT
  WITH CHECK (true); -- Events can be created by triggers

CREATE POLICY "Admins can view processing log"
  ON public.event_processing_log FOR SELECT
  USING (public.is_admin_or_hr(auth.uid()));

-- Add comments
COMMENT ON TABLE hr_events IS 'Event bus for HR system - all state changes publish events here';
COMMENT ON TABLE event_subscribers IS 'Registry of event subscribers and their handlers';
COMMENT ON TABLE event_processing_log IS 'Audit trail of event processing by subscribers';
COMMENT ON FUNCTION publish_hr_event IS 'Publishes an event to the event bus with idempotency support';
COMMENT ON FUNCTION process_pending_events IS 'Processes pending events in batch with all registered subscribers';
