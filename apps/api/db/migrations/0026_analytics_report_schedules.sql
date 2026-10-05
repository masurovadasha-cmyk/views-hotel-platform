BEGIN;

CREATE TABLE analytics_report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('dashboard_summary')),
  format text NOT NULL CHECK (format IN ('json','csv')),
  cadence text NOT NULL CHECK (cadence IN ('daily','weekly','monthly')),
  period_kind text NOT NULL CHECK (
    period_kind IN ('previous_day','previous_7_days','previous_month')
  ),
  timezone text NOT NULL,
  local_time time NOT NULL,
  iso_weekday smallint CHECK (iso_weekday BETWEEN 1 AND 7),
  day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 28),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  idempotency_key text NOT NULL,
  request_hash char(64) NOT NULL CHECK (length(request_hash)=64),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_by_membership_id uuid NOT NULL REFERENCES organization_memberships(id),
  next_run_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  lease_token text,
  lease_until timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures>=0),
  max_failures integer NOT NULL DEFAULT 5 CHECK (max_failures BETWEEN 1 AND 10),
  last_error_code text,
  last_enqueued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(idempotency_key) BETWEEN 1 AND 160),
  CHECK (
    (cadence='daily' AND iso_weekday IS NULL AND day_of_month IS NULL)
    OR
    (cadence='weekly' AND iso_weekday IS NOT NULL AND day_of_month IS NULL)
    OR
    (cadence='monthly' AND iso_weekday IS NULL AND day_of_month IS NOT NULL)
  ),
  UNIQUE(organization_id,created_by_membership_id,idempotency_key)
);

CREATE INDEX analytics_report_schedules_due_idx
  ON analytics_report_schedules(status,next_attempt_at,next_run_at,lease_until)
  WHERE status='active';

ALTER TABLE analytics_report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_report_schedules FORCE ROW LEVEL SECURITY;

CREATE POLICY analytics_report_schedules_read
ON analytics_report_schedules
FOR SELECT
USING (
  organization_id=app.current_organization_id()
  AND (
    created_by_membership_id=app.current_membership_id()
    OR app.current_membership_role() IN ('owner','manager','accountant')
  )
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
);

CREATE POLICY analytics_report_schedules_insert
ON analytics_report_schedules
FOR INSERT
WITH CHECK (
  organization_id=app.current_organization_id()
  AND created_by_user_id=app.current_user_id()
  AND created_by_membership_id=app.current_membership_id()
  AND app.current_membership_role() IN ('host','owner','manager','accountant')
  AND (
    property_id IS NULL
    OR app.can_access_property(property_id)
  )
);

CREATE OR REPLACE FUNCTION app.next_analytics_report_schedule_run(
  target_cadence text,
  target_timezone text,
  target_local_time time,
  target_iso_weekday integer,
  target_day_of_month integer,
  target_after_at timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_local_after timestamp;
  v_local_date date;
  v_candidate_date date;
  v_candidate timestamptz;
  v_delta integer;
  v_next_month date;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_timezone_names WHERE name=target_timezone
  ) THEN
    RAISE EXCEPTION 'INVALID_REPORT_SCHEDULE_TIMEZONE';
  END IF;

  v_local_after:=target_after_at AT TIME ZONE target_timezone;
  v_local_date:=v_local_after::date;

  IF target_cadence='daily' THEN
    IF target_iso_weekday IS NOT NULL OR target_day_of_month IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_DAILY_REPORT_SCHEDULE';
    END IF;
    v_candidate_date:=v_local_date;
    v_candidate:=(v_candidate_date+target_local_time) AT TIME ZONE target_timezone;
    IF v_candidate<=target_after_at THEN
      v_candidate_date:=v_candidate_date+1;
      v_candidate:=(v_candidate_date+target_local_time) AT TIME ZONE target_timezone;
    END IF;
    RETURN v_candidate;
  END IF;

  IF target_cadence='weekly' THEN
    IF target_iso_weekday IS NULL
       OR target_iso_weekday<1
       OR target_iso_weekday>7
       OR target_day_of_month IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_WEEKLY_REPORT_SCHEDULE';
    END IF;

    v_delta:=mod(
      target_iso_weekday-extract(isodow from v_local_date)::integer+7,
      7
    );
    v_candidate_date:=v_local_date+v_delta;
    v_candidate:=(v_candidate_date+target_local_time) AT TIME ZONE target_timezone;
    IF v_candidate<=target_after_at THEN
      v_candidate_date:=v_candidate_date+7;
      v_candidate:=(v_candidate_date+target_local_time) AT TIME ZONE target_timezone;
    END IF;
    RETURN v_candidate;
  END IF;

  IF target_cadence='monthly' THEN
    IF target_day_of_month IS NULL
       OR target_day_of_month<1
       OR target_day_of_month>28
       OR target_iso_weekday IS NOT NULL THEN
      RAISE EXCEPTION 'INVALID_MONTHLY_REPORT_SCHEDULE';
    END IF;

    v_candidate_date:=make_date(
      extract(year from v_local_date)::integer,
      extract(month from v_local_date)::integer,
      target_day_of_month
    );
    v_candidate:=(v_candidate_date+target_local_time) AT TIME ZONE target_timezone;

    IF v_candidate<=target_after_at THEN
      v_next_month:=(date_trunc('month',v_local_date)+interval '1 month')::date;
      v_candidate_date:=make_date(
        extract(year from v_next_month)::integer,
        extract(month from v_next_month)::integer,
        target_day_of_month
      );
      v_candidate:=(v_candidate_date+target_local_time) AT TIME ZONE target_timezone;
    END IF;
    RETURN v_candidate;
  END IF;

  RAISE EXCEPTION 'INVALID_REPORT_SCHEDULE_CADENCE';
END
$$;

CREATE OR REPLACE FUNCTION app.analytics_report_schedule_period(
  target_period_kind text,
  target_timezone text,
  target_scheduled_for timestamptz
)
RETURNS TABLE(from_date date,to_date date)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_run_date date;
  v_month_start date;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_timezone_names WHERE name=target_timezone
  ) THEN
    RAISE EXCEPTION 'INVALID_REPORT_SCHEDULE_TIMEZONE';
  END IF;

  v_run_date:=(target_scheduled_for AT TIME ZONE target_timezone)::date;

  IF target_period_kind='previous_day' THEN
    RETURN QUERY SELECT v_run_date-1,v_run_date-1;
    RETURN;
  END IF;

  IF target_period_kind='previous_7_days' THEN
    RETURN QUERY SELECT v_run_date-7,v_run_date-1;
    RETURN;
  END IF;

  IF target_period_kind='previous_month' THEN
    v_month_start:=date_trunc('month',v_run_date)::date;
    RETURN QUERY SELECT
      (v_month_start-interval '1 month')::date,
      v_month_start-1;
    RETURN;
  END IF;

  RAISE EXCEPTION 'INVALID_REPORT_PERIOD_KIND';
END
$$;

CREATE OR REPLACE FUNCTION app.claim_due_analytics_report_schedules(
  target_worker_token text,
  target_limit integer,
  target_lease_seconds integer,
  target_now timestamptz DEFAULT now()
)
RETURNS TABLE(
  schedule_id uuid,
  organization_id uuid,
  property_id uuid,
  report_type text,
  format text,
  timezone text,
  scheduled_for timestamptz,
  from_date date,
  to_date date,
  created_by_user_id uuid,
  created_by_membership_id uuid,
  consecutive_failures integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF target_worker_token IS NULL
     OR length(target_worker_token)<8
     OR length(target_worker_token)>200 THEN
    RAISE EXCEPTION 'INVALID_REPORT_SCHEDULER_TOKEN';
  END IF;
  IF target_limit<1 OR target_limit>100 THEN
    RAISE EXCEPTION 'INVALID_REPORT_SCHEDULE_LIMIT';
  END IF;
  IF target_lease_seconds<30 OR target_lease_seconds>1800 THEN
    RAISE EXCEPTION 'INVALID_REPORT_SCHEDULE_LEASE';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT s.id
    FROM analytics_report_schedules s
    WHERE s.status='active'
      AND s.next_run_at<=target_now
      AND s.next_attempt_at<=target_now
      AND (s.lease_until IS NULL OR s.lease_until<=target_now)
    ORDER BY s.next_run_at,s.id
    FOR UPDATE SKIP LOCKED
    LIMIT target_limit
  ),
  claimed AS (
    UPDATE analytics_report_schedules s
    SET lease_token=target_worker_token,
        lease_until=target_now+make_interval(secs=>target_lease_seconds),
        updated_at=target_now
    FROM candidates c
    WHERE s.id=c.id
    RETURNING
      s.id,s.organization_id,s.property_id,s.report_type,s.format,
      s.timezone,s.next_run_at,s.period_kind,
      s.created_by_user_id,s.created_by_membership_id,
      s.consecutive_failures
  )
  SELECT
    c.id,c.organization_id,c.property_id,c.report_type,c.format,c.timezone,
    c.next_run_at,p.from_date,p.to_date,
    c.created_by_user_id,c.created_by_membership_id,c.consecutive_failures
  FROM claimed c
  CROSS JOIN LATERAL app.analytics_report_schedule_period(
    c.period_kind,c.timezone,c.next_run_at
  ) p;
END
$$;

REVOKE ALL ON FUNCTION app.claim_due_analytics_report_schedules(
  text,integer,integer,timestamptz
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.complete_analytics_report_schedule(
  target_schedule_id uuid,
  target_worker_token text,
  target_scheduled_for timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_next_run timestamptz;
BEGIN
  SELECT app.next_analytics_report_schedule_run(
    s.cadence,s.timezone,s.local_time,s.iso_weekday,s.day_of_month,
    target_scheduled_for
  )
  INTO v_next_run
  FROM analytics_report_schedules s
  WHERE s.id=target_schedule_id
    AND s.status='active'
    AND s.lease_token=target_worker_token
    AND s.next_run_at=target_scheduled_for;

  IF v_next_run IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE analytics_report_schedules
  SET last_enqueued_at=target_scheduled_for,
      next_run_at=v_next_run,
      next_attempt_at=v_next_run,
      lease_token=NULL,
      lease_until=NULL,
      consecutive_failures=0,
      last_error_code=NULL,
      updated_at=now()
  WHERE id=target_schedule_id
    AND status='active'
    AND lease_token=target_worker_token
    AND next_run_at=target_scheduled_for;

  RETURN v_next_run;
END
$$;

REVOKE ALL ON FUNCTION app.complete_analytics_report_schedule(
  uuid,text,timestamptz
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.fail_analytics_report_schedule(
  target_schedule_id uuid,
  target_worker_token text,
  target_error_code text,
  target_now timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_status text;
BEGIN
  UPDATE analytics_report_schedules
  SET consecutive_failures=consecutive_failures+1,
      status=CASE
        WHEN consecutive_failures+1>=max_failures THEN 'paused'
        ELSE status
      END,
      next_attempt_at=CASE
        WHEN consecutive_failures+1>=max_failures THEN next_attempt_at
        ELSE target_now+make_interval(
          secs=>LEAST(
            3600,
            30*power(2,GREATEST(0,consecutive_failures))::integer
          )
        )
      END,
      lease_token=NULL,
      lease_until=NULL,
      last_error_code=LEFT(
        COALESCE(target_error_code,'REPORT_SCHEDULE_ERROR'),
        120
      ),
      updated_at=target_now
  WHERE id=target_schedule_id
    AND lease_token=target_worker_token
  RETURNING status INTO v_status;

  RETURN v_status;
END
$$;

REVOKE ALL ON FUNCTION app.fail_analytics_report_schedule(
  uuid,text,text,timestamptz
) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.pause_analytics_report_schedule(
  target_schedule_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE analytics_report_schedules s
  SET status='paused',
      lease_token=NULL,
      lease_until=NULL,
      updated_at=now()
  WHERE s.id=target_schedule_id
    AND s.organization_id=app.current_organization_id()
    AND (
      s.created_by_membership_id=app.current_membership_id()
      OR app.current_membership_role() IN ('owner','manager','accountant')
    )
    AND (
      s.property_id IS NULL
      OR app.can_access_property(s.property_id)
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated=1;
END
$$;

REVOKE ALL ON FUNCTION app.pause_analytics_report_schedule(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.resume_analytics_report_schedule(
  target_schedule_id uuid,
  target_now timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_next_run timestamptz;
BEGIN
  SELECT app.next_analytics_report_schedule_run(
    s.cadence,s.timezone,s.local_time,s.iso_weekday,s.day_of_month,target_now
  )
  INTO v_next_run
  FROM analytics_report_schedules s
  WHERE s.id=target_schedule_id
    AND s.organization_id=app.current_organization_id()
    AND (
      s.created_by_membership_id=app.current_membership_id()
      OR app.current_membership_role() IN ('owner','manager','accountant')
    )
    AND (
      s.property_id IS NULL
      OR app.can_access_property(s.property_id)
    );

  IF v_next_run IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE analytics_report_schedules
  SET status='active',
      next_run_at=v_next_run,
      next_attempt_at=v_next_run,
      lease_token=NULL,
      lease_until=NULL,
      consecutive_failures=0,
      last_error_code=NULL,
      updated_at=target_now
  WHERE id=target_schedule_id;

  RETURN v_next_run;
END
$$;

REVOKE ALL ON FUNCTION app.resume_analytics_report_schedule(uuid,timestamptz)
  FROM PUBLIC;

COMMIT;
