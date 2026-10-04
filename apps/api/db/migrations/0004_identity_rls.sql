BEGIN;

CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_membership_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.membership_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.can_access_property(target_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM organization_memberships m
    JOIN roles r ON r.id=m.role_id
    WHERE m.id=app.current_membership_id()
      AND m.organization_id=app.current_organization_id()
      AND m.status='active'
      AND (
        r.code IN ('owner','manager')
        OR EXISTS(
          SELECT 1 FROM membership_property_scopes s
          WHERE s.membership_id=m.id AND s.property_id=target_property_id
        )
      )
  )
$$;

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_property_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant_read ON organization_memberships
  FOR SELECT USING (
    organization_id=app.current_organization_id()
    AND (
      user_id=app.current_user_id()
      OR EXISTS(
        SELECT 1 FROM organization_memberships actor
        JOIN roles ar ON ar.id=actor.role_id
        WHERE actor.id=app.current_membership_id()
          AND actor.organization_id=organization_memberships.organization_id
          AND actor.status='active'
          AND ar.code IN ('owner','manager')
      )
    )
  );

CREATE POLICY membership_scopes_tenant_read ON membership_property_scopes
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM organization_memberships m
      WHERE m.id=membership_property_scopes.membership_id
        AND m.organization_id=app.current_organization_id()
    )
  );

CREATE POLICY guest_profiles_tenant_policy ON guest_profiles
  USING (organization_id=app.current_organization_id())
  WITH CHECK (organization_id=app.current_organization_id());

CREATE POLICY audit_tenant_read ON audit_log
  FOR SELECT USING (organization_id=app.current_organization_id());

CREATE POLICY audit_tenant_insert ON audit_log
  FOR INSERT WITH CHECK (
    organization_id=app.current_organization_id()
    AND actor_user_id=app.current_user_id()
  );

COMMIT;
