BEGIN;

CREATE OR REPLACE FUNCTION app.current_membership_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT r.code
  FROM organization_memberships m
  JOIN roles r ON r.id=m.role_id
  WHERE m.id=app.current_membership_id()
    AND m.organization_id=app.current_organization_id()
    AND m.status='active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.membership_belongs_to_current_org(target_membership_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM organization_memberships m
    WHERE m.id=target_membership_id
      AND m.organization_id=app.current_organization_id()
  )
$$;

DROP POLICY IF EXISTS memberships_tenant_read ON organization_memberships;
CREATE POLICY memberships_tenant_read ON organization_memberships
  FOR SELECT USING (
    organization_id=app.current_organization_id()
    AND (
      user_id=app.current_user_id()
      OR app.current_membership_role() IN ('owner','manager')
    )
  );

DROP POLICY IF EXISTS membership_scopes_tenant_read ON membership_property_scopes;
CREATE POLICY membership_scopes_tenant_read ON membership_property_scopes
  FOR SELECT USING (
    app.membership_belongs_to_current_org(membership_id)
  );

COMMIT;
