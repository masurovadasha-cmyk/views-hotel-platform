BEGIN;

CREATE TABLE provider_egress_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  provider_id text NOT NULL,
  operation_id text NOT NULL,
  request_id uuid NOT NULL,
  attempt_no smallint NOT NULL DEFAULT 1 CHECK (attempt_no>0),
  deadline_ms integer NOT NULL CHECK (deadline_ms BETWEEN 100 AND 30000),
  delivery_state text NOT NULL DEFAULT 'not-sent'
    CHECK (delivery_state IN ('not-sent','unknown','response')),
  outcome text NOT NULL DEFAULT 'started'
    CHECK (outcome IN ('started','completed','failed')),
  status_code integer CHECK (status_code IS NULL OR status_code BETWEEN 200 AND 599),
  error_code text CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 120),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms>=0),
  CHECK (provider_id ~ '^[a-z][a-z0-9._-]{0,63}$'),
  CHECK (operation_id ~ '^[a-z][a-z0-9._-]{0,63}$'),
  CHECK (
    (outcome='started'
      AND completed_at IS NULL
      AND status_code IS NULL
      AND error_code IS NULL)
    OR
    (outcome='completed'
      AND completed_at IS NOT NULL
      AND delivery_state='response'
      AND status_code IS NOT NULL
      AND error_code IS NULL)
    OR
    (outcome='failed'
      AND completed_at IS NOT NULL
      AND error_code IS NOT NULL)
  ),
  UNIQUE(organization_id,provider_id,operation_id,request_id,attempt_no)
);

CREATE INDEX provider_egress_attempts_org_time_idx
  ON provider_egress_attempts(organization_id,started_at DESC);
CREATE INDEX provider_egress_attempts_reconcile_scan_idx
  ON provider_egress_attempts(organization_id,started_at)
  WHERE outcome='started';

CREATE TABLE provider_egress_reconciliation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  attempt_id uuid NOT NULL REFERENCES provider_egress_attempts(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('unknown_delivery','stale_started')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','resolved','dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  locked_by uuid,
  last_error text CHECK (last_error IS NULL OR length(last_error) BETWEEN 1 AND 120),
  resolution_code text CHECK (resolution_code IS NULL OR length(resolution_code) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE(attempt_id),
  CHECK (
    (status='pending' AND lease_until IS NULL AND locked_by IS NULL AND resolved_at IS NULL)
    OR
    (status='processing' AND lease_until IS NOT NULL AND locked_by IS NOT NULL AND resolved_at IS NULL)
    OR
    (status IN ('resolved','dead_letter') AND lease_until IS NULL AND locked_by IS NULL AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX provider_egress_reconciliation_due_idx
  ON provider_egress_reconciliation_queue(
    organization_id,status,next_attempt_at,lease_until
  )
  WHERE status IN ('pending','processing');

ALTER TABLE provider_egress_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_egress_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE provider_egress_reconciliation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_egress_reconciliation_queue FORCE ROW LEVEL SECURITY;

CREATE POLICY provider_egress_attempts_tenant_read
ON provider_egress_attempts
FOR SELECT
USING (organization_id=app.current_organization_id());

CREATE POLICY provider_egress_reconciliation_tenant_read
ON provider_egress_reconciliation_queue
FOR SELECT
USING (organization_id=app.current_organization_id());

CREATE OR REPLACE FUNCTION app.begin_provider_egress_attempt(
  target_provider_id text,
  target_operation_id text,
  target_request_id uuid,
  target_deadline_ms integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_org uuid:=app.current_organization_id();
  v_id uuid;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_ORGANIZATION_REQUIRED';
  END IF;
  IF target_provider_id !~ '^[a-z][a-z0-9._-]{0,63}$'
     OR target_operation_id !~ '^[a-z][a-z0-9._-]{0,63}$' THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_IDENTIFIER_INVALID';
  END IF;
  IF target_request_id IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_REQUEST_ID_REQUIRED';
  END IF;
  IF target_deadline_ms<100 OR target_deadline_ms>30000 THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_DEADLINE_INVALID';
  END IF;

  INSERT INTO provider_egress_attempts(
    organization_id,provider_id,operation_id,request_id,deadline_ms
  ) VALUES(
    v_org,target_provider_id,target_operation_id,target_request_id,target_deadline_ms
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_REQUEST_REPLAY';
END
$$;

REVOKE ALL ON FUNCTION app.begin_provider_egress_attempt(
  text,text,uuid,integer
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.complete_provider_egress_attempt(
  target_provider_id text,
  target_operation_id text,
  target_request_id uuid,
  target_event text,
  target_delivery_state text,
  target_status_code integer,
  target_error_code text,
  target_duration_ms integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_org uuid:=app.current_organization_id();
  v_attempt_id uuid;
  v_inserted integer:=0;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_ORGANIZATION_REQUIRED';
  END IF;
  IF target_event NOT IN ('completed','failed') THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_EVENT_INVALID';
  END IF;
  IF target_delivery_state NOT IN ('not-sent','unknown','response') THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_DELIVERY_INVALID';
  END IF;
  IF target_duration_ms IS NULL OR target_duration_ms<0 THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_DURATION_INVALID';
  END IF;
  IF target_event='completed' THEN
    IF target_delivery_state<>'response'
       OR target_status_code IS NULL
       OR target_status_code<200
       OR target_status_code>599
       OR target_error_code IS NOT NULL THEN
      RAISE EXCEPTION 'PROVIDER_EGRESS_COMPLETION_INVALID';
    END IF;
  ELSE
    IF target_error_code IS NULL
       OR length(target_error_code)<1
       OR length(target_error_code)>120
       OR target_status_code IS NOT NULL THEN
      RAISE EXCEPTION 'PROVIDER_EGRESS_FAILURE_INVALID';
    END IF;
  END IF;

  UPDATE provider_egress_attempts
     SET delivery_state=target_delivery_state,
         outcome=target_event,
         status_code=target_status_code,
         error_code=target_error_code,
         completed_at=now(),
         duration_ms=target_duration_ms
   WHERE organization_id=v_org
     AND provider_id=target_provider_id
     AND operation_id=target_operation_id
     AND request_id=target_request_id
     AND attempt_no=1
     AND outcome='started'
  RETURNING id INTO v_attempt_id;

  IF v_attempt_id IS NULL THEN
    RETURN false;
  END IF;

  IF target_event='failed' AND target_delivery_state='unknown' THEN
    INSERT INTO provider_egress_reconciliation_queue(
      organization_id,attempt_id,reason
    ) VALUES(
      v_org,v_attempt_id,'unknown_delivery'
    )
    ON CONFLICT(attempt_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted=ROW_COUNT;

    IF v_inserted=1 THEN
      INSERT INTO outbox_events(
        organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
      ) VALUES(
        v_org,'provider_egress_attempt',v_attempt_id,
        'provider.egress.reconciliation_required',
        'provider-egress-reconcile:'||v_attempt_id::text,
        jsonb_build_object(
          'attemptId',v_attempt_id,
          'providerId',target_provider_id,
          'operationId',target_operation_id,
          'requestId',target_request_id,
          'reason','unknown_delivery'
        )
      )
      ON CONFLICT(idempotency_key) DO NOTHING;
    END IF;
  END IF;

  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION app.complete_provider_egress_attempt(
  text,text,uuid,text,text,integer,text,integer
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.queue_stale_provider_egress_attempts(
  target_limit integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_org uuid:=app.current_organization_id();
  v_row provider_egress_attempts%ROWTYPE;
  v_inserted integer;
  v_count integer:=0;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_ORGANIZATION_REQUIRED';
  END IF;
  IF target_limit<1 OR target_limit>500 THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_RECONCILE_LIMIT_INVALID';
  END IF;

  FOR v_row IN
    SELECT a.*
      FROM provider_egress_attempts a
     WHERE a.organization_id=v_org
       AND a.outcome='started'
       AND a.started_at
           + make_interval(secs=>CEIL(a.deadline_ms/1000.0)::integer)
           + interval '30 seconds' <= now()
       AND NOT EXISTS(
         SELECT 1
           FROM provider_egress_reconciliation_queue q
          WHERE q.attempt_id=a.id
       )
     ORDER BY a.started_at,a.id
     FOR UPDATE SKIP LOCKED
     LIMIT target_limit
  LOOP
    UPDATE provider_egress_attempts
       SET delivery_state='unknown',
           outcome='failed',
           error_code='EGRESS_OUTCOME_UNKNOWN',
           completed_at=now(),
           duration_ms=GREATEST(
             0,
             FLOOR(EXTRACT(EPOCH FROM (now()-started_at))*1000)::integer
           )
     WHERE id=v_row.id
       AND outcome='started';

    INSERT INTO provider_egress_reconciliation_queue(
      organization_id,attempt_id,reason
    ) VALUES(
      v_org,v_row.id,'stale_started'
    )
    ON CONFLICT(attempt_id) DO NOTHING;
    GET DIAGNOSTICS v_inserted=ROW_COUNT;

    IF v_inserted=1 THEN
      v_count:=v_count+1;
      INSERT INTO outbox_events(
        organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
      ) VALUES(
        v_org,'provider_egress_attempt',v_row.id,
        'provider.egress.reconciliation_required',
        'provider-egress-reconcile:'||v_row.id::text,
        jsonb_build_object(
          'attemptId',v_row.id,
          'providerId',v_row.provider_id,
          'operationId',v_row.operation_id,
          'requestId',v_row.request_id,
          'reason','stale_started'
        )
      )
      ON CONFLICT(idempotency_key) DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_count;
END
$$;

REVOKE ALL ON FUNCTION app.queue_stale_provider_egress_attempts(integer)
FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.claim_provider_egress_reconciliation(
  target_worker_id uuid,
  target_limit integer DEFAULT 20
)
RETURNS TABLE(
  queue_id uuid,
  attempt_id uuid,
  provider_id text,
  operation_id text,
  request_id uuid,
  reason text,
  attempt_count integer,
  started_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_org uuid:=app.current_organization_id();
BEGIN
  IF v_org IS NULL OR target_worker_id IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_RECONCILE_CONTEXT_INVALID';
  END IF;
  IF target_limit<1 OR target_limit>100 THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_RECONCILE_LIMIT_INVALID';
  END IF;

  PERFORM app.queue_stale_provider_egress_attempts(
    LEAST(target_limit*4,400)
  );

  RETURN QUERY
  WITH candidates AS (
    SELECT q.id
      FROM provider_egress_reconciliation_queue q
     WHERE q.organization_id=v_org
       AND q.next_attempt_at<=now()
       AND (
         q.status='pending'
         OR (
           q.status='processing'
           AND (q.lease_until IS NULL OR q.lease_until<now())
         )
       )
     ORDER BY q.created_at,q.id
     FOR UPDATE SKIP LOCKED
     LIMIT target_limit
  ),
  claimed AS (
    UPDATE provider_egress_reconciliation_queue q
       SET status='processing',
           attempt_count=q.attempt_count+1,
           lease_until=now()+interval '2 minutes',
           locked_by=target_worker_id,
           updated_at=now()
      FROM candidates c
     WHERE q.id=c.id
    RETURNING q.*
  )
  SELECT
    c.id,
    c.attempt_id,
    a.provider_id,
    a.operation_id,
    a.request_id,
    c.reason,
    c.attempt_count,
    a.started_at,
    a.completed_at
  FROM claimed c
  JOIN provider_egress_attempts a ON a.id=c.attempt_id
  ORDER BY c.created_at,c.id;
END
$$;

REVOKE ALL ON FUNCTION app.claim_provider_egress_reconciliation(uuid,integer)
FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.finish_provider_egress_reconciliation(
  target_queue_id uuid,
  target_worker_id uuid,
  target_resolved boolean,
  target_code text,
  target_retry_after_seconds integer DEFAULT 60
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_org uuid:=app.current_organization_id();
  v_attempt_count integer;
  v_status text;
  v_attempt_id uuid;
BEGIN
  IF v_org IS NULL OR target_queue_id IS NULL OR target_worker_id IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_RECONCILE_CONTEXT_INVALID';
  END IF;
  IF target_code IS NULL OR length(target_code)<1 OR length(target_code)>120 THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_RECONCILE_CODE_INVALID';
  END IF;
  IF target_retry_after_seconds<1 OR target_retry_after_seconds>3600 THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_RECONCILE_DELAY_INVALID';
  END IF;

  SELECT attempt_count,attempt_id
    INTO v_attempt_count,v_attempt_id
    FROM provider_egress_reconciliation_queue
   WHERE id=target_queue_id
     AND organization_id=v_org
     AND status='processing'
     AND locked_by=target_worker_id
   FOR UPDATE;

  IF v_attempt_id IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_EGRESS_RECONCILE_LEASE_LOST';
  END IF;

  IF target_resolved THEN
    UPDATE provider_egress_reconciliation_queue
       SET status='resolved',
           lease_until=NULL,
           locked_by=NULL,
           last_error=NULL,
           resolution_code=target_code,
           resolved_at=now(),
           updated_at=now()
     WHERE id=target_queue_id;
    v_status:='resolved';

    INSERT INTO outbox_events(
      organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
    ) VALUES(
      v_org,'provider_egress_attempt',v_attempt_id,
      'provider.egress.reconciliation_resolved',
      'provider-egress-reconciled:'||v_attempt_id::text,
      jsonb_build_object(
        'attemptId',v_attempt_id,
        'resolutionCode',target_code
      )
    )
    ON CONFLICT(idempotency_key) DO NOTHING;
  ELSIF v_attempt_count>=10 THEN
    UPDATE provider_egress_reconciliation_queue
       SET status='dead_letter',
           lease_until=NULL,
           locked_by=NULL,
           last_error=target_code,
           resolution_code='dead_letter',
           resolved_at=now(),
           updated_at=now()
     WHERE id=target_queue_id;
    v_status:='dead_letter';

    INSERT INTO outbox_events(
      organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
    ) VALUES(
      v_org,'provider_egress_attempt',v_attempt_id,
      'provider.egress.reconciliation_dead_letter',
      'provider-egress-dead-letter:'||v_attempt_id::text,
      jsonb_build_object(
        'attemptId',v_attempt_id,
        'errorCode',target_code
      )
    )
    ON CONFLICT(idempotency_key) DO NOTHING;
  ELSE
    UPDATE provider_egress_reconciliation_queue
       SET status='pending',
           lease_until=NULL,
           locked_by=NULL,
           last_error=target_code,
           next_attempt_at=now()+make_interval(secs=>target_retry_after_seconds),
           updated_at=now()
     WHERE id=target_queue_id;
    v_status:='pending';
  END IF;

  RETURN v_status;
END
$$;

REVOKE ALL ON FUNCTION app.finish_provider_egress_reconciliation(
  uuid,uuid,boolean,text,integer
) FROM PUBLIC;

COMMIT;
