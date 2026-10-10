BEGIN;
-- Staff write policies require a verified active dispatcher membership and property scope.
-- This migration intentionally does NOT grant privileges to the runtime DB role.
-- Privileges and end-to-end command execution must be tested separately.

CREATE OR REPLACE FUNCTION app.market_dispatcher_can_write(target_org uuid,target_property uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,app AS $$
 SELECT target_org=app.current_organization_id()
   AND EXISTS(
    SELECT 1 FROM organization_memberships m
    JOIN roles r ON r.id=m.role_id
    WHERE m.id=app.current_membership_id()
      AND m.user_id=app.current_user_id()
      AND m.organization_id=target_org
      AND m.status='active'
      AND r.code IN ('owner','manager','front_desk','concierge','platform_admin')
      AND (
        r.code IN ('owner','manager')
        OR EXISTS(
          SELECT 1 FROM membership_property_scopes s
          WHERE s.membership_id=m.id AND s.property_id=target_property
        )
      )
   )
$$;
REVOKE ALL ON FUNCTION app.market_dispatcher_can_write(uuid,uuid) FROM PUBLIC;

CREATE POLICY market_order_staff_update ON market_service_orders FOR UPDATE
 USING(app.market_dispatcher_can_write(organization_id,property_id))
 WITH CHECK(app.market_dispatcher_can_write(organization_id,property_id));

CREATE POLICY market_assignment_staff_insert ON market_service_assignments FOR INSERT
 WITH CHECK(
   app.market_dispatcher_can_write(organization_id,(
    SELECT o.property_id FROM market_service_orders o
    WHERE o.id=order_id AND o.organization_id=market_service_assignments.organization_id
   ))
 );
CREATE POLICY market_assignment_staff_update ON market_service_assignments FOR UPDATE
 USING(
   app.market_dispatcher_can_write(organization_id,(
    SELECT o.property_id FROM market_service_orders o
    WHERE o.id=order_id AND o.organization_id=market_service_assignments.organization_id
   ))
 )
 WITH CHECK(
   app.market_dispatcher_can_write(organization_id,(
    SELECT o.property_id FROM market_service_orders o
    WHERE o.id=order_id AND o.organization_id=market_service_assignments.organization_id
   ))
 );

CREATE POLICY market_events_staff_insert ON market_service_events FOR INSERT
 WITH CHECK(
   app.market_dispatcher_can_write(organization_id,(
    SELECT o.property_id FROM market_service_orders o
    WHERE o.id=order_id AND o.organization_id=market_service_events.organization_id
   ))
   AND actor_membership_id=app.current_membership_id()
 );

CREATE POLICY market_idempotency_staff_select ON market_command_idempotency FOR SELECT
 USING(
   organization_id=app.current_organization_id()
   AND EXISTS(
    SELECT 1 FROM market_service_orders o
    WHERE o.id=order_id AND o.organization_id=market_command_idempotency.organization_id
      AND app.market_dispatcher_can_write(o.organization_id,o.property_id)
   )
 );
CREATE POLICY market_idempotency_staff_insert ON market_command_idempotency FOR INSERT
 WITH CHECK(
   organization_id=app.current_organization_id()
   AND command_type IN ('assignment','status')
   AND EXISTS(
    SELECT 1 FROM market_service_orders o
    WHERE o.id=order_id AND o.organization_id=market_command_idempotency.organization_id
      AND app.market_dispatcher_can_write(o.organization_id,o.property_id)
   )
 );

-- Stock writes intentionally remain closed until reserve/release/sale policies
-- and command-level atomicity tests are reviewed. This is NOT a live release.
COMMIT;
