BEGIN;
-- Draft-only policies. No link, trigger or publication path to operational orders.
CREATE TABLE sla_policy_draft_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 property_id uuid NOT NULL REFERENCES properties(id),
 service_kind text NOT NULL CHECK(service_kind IN ('cleaning','laundry','market','concierge')),
 milestone text NOT NULL CHECK(milestone IN ('response','acceptance','completion')),
 revision integer NOT NULL CHECK(revision>0),
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),
 created_by uuid NOT NULL REFERENCES organization_memberships(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,property_id,service_kind,milestone,revision)
);
CREATE TABLE sla_policy_draft_commands (
 organization_id uuid NOT NULL REFERENCES organizations(id),
 command_key uuid NOT NULL,
 property_id uuid NOT NULL REFERENCES properties(id),
 request_hash text NOT NULL,
 outcome text NOT NULL CHECK(outcome IN ('saved','not_applied')),
 applied_revision integer CHECK(applied_revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,command_key),
 CHECK((outcome='saved')=(applied_revision IS NOT NULL))
);
ALTER TABLE sla_policy_draft_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_policy_draft_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE sla_policy_draft_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_policy_draft_commands FORCE ROW LEVEL SECURITY;
CREATE POLICY sla_versions_read ON sla_policy_draft_versions FOR SELECT USING(organization_id=app.current_organization_id() AND app.registry_access(organization_id,property_id,'reservation.manage'));
CREATE POLICY sla_versions_insert ON sla_policy_draft_versions FOR INSERT WITH CHECK(organization_id=app.current_organization_id() AND created_by=app.current_membership_id() AND app.registry_access(organization_id,property_id,'reservation.manage'));
CREATE POLICY sla_commands_read ON sla_policy_draft_commands FOR SELECT USING(organization_id=app.current_organization_id() AND app.registry_access(organization_id,property_id,'reservation.manage'));
CREATE POLICY sla_commands_insert ON sla_policy_draft_commands FOR INSERT WITH CHECK(organization_id=app.current_organization_id() AND app.registry_access(organization_id,property_id,'reservation.manage'));
-- No UPDATE/DELETE policy: revisions and terminal command outcomes are immutable.
REVOKE ALL ON sla_policy_draft_versions,sla_policy_draft_commands FROM PUBLIC;
COMMIT;
