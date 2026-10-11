BEGIN;
ALTER TABLE service_catalog DROP CONSTRAINT service_catalog_execution_kind_check;
ALTER TABLE service_catalog ADD CONSTRAINT service_catalog_execution_kind_check CHECK(execution_kind IN ('cleaning','laundry','market','concierge'));
CREATE TABLE concierge_requests (
 order_id uuid PRIMARY KEY, organization_id uuid NOT NULL, property_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('restaurant','documents','help')),
 party_size integer NOT NULL CHECK(party_size BETWEEN 1 AND 50), budget_minor bigint NOT NULL CHECK(budget_minor>=0),
 stage text NOT NULL DEFAULT 'requested' CHECK(stage IN ('requested','working','answered','closed','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 assigned_membership_id uuid REFERENCES organization_memberships(id),
 response_due_at timestamptz NOT NULL, answered_at timestamptz,
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES service_orders(organization_id,property_id,id),
 UNIQUE(organization_id,property_id,order_id),
 CHECK(stage NOT IN ('working','answered','closed') OR assigned_membership_id IS NOT NULL)
);
CREATE INDEX concierge_queue_idx ON concierge_requests(organization_id,property_id,order_id);
CREATE TABLE concierge_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL,property_id uuid NOT NULL,order_id uuid NOT NULL,
 author_kind text NOT NULL CHECK(author_kind IN ('guest','staff')),body text NOT NULL CHECK(length(body) BETWEEN 1 AND 500 AND body !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES concierge_requests(organization_id,property_id,order_id)
);
CREATE INDEX concierge_messages_order_idx ON concierge_messages(order_id,created_at,id);
ALTER TABLE concierge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE concierge_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE concierge_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE concierge_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY concierge_read ON concierge_requests FOR SELECT USING(app.registry_access(organization_id,property_id,'reservation.manage') OR app.registry_access(organization_id,property_id,'concierge.work') AND (assigned_membership_id IS NULL OR assigned_membership_id=app.current_membership_id()));
CREATE POLICY concierge_message_read ON concierge_messages FOR SELECT USING(EXISTS(SELECT 1 FROM concierge_requests r WHERE r.order_id=concierge_messages.order_id));
CREATE TRIGGER concierge_message_immutable BEFORE UPDATE OR DELETE ON concierge_messages FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();
CREATE FUNCTION service_private.concierge_receipt(oid uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('orderId',r.order_id,'stage',r.stage,'revision',r.revision,'category',r.category,'partySize',r.party_size,'budgetMinor',r.budget_minor::text,
 'currency',o.currency,'requestedFor',o.requested_for,'responseDueAt',r.response_due_at,'answeredAt',r.answered_at,'assigned',r.assigned_membership_id IS NOT NULL,
 'messages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'author',m.author_kind,'text',m.body,'createdAt',m.created_at) ORDER BY m.created_at,m.id) FROM public.concierge_messages m WHERE m.order_id=oid),'[]'::jsonb),'idempotentReplay',false)
 FROM public.concierge_requests r JOIN public.service_orders o ON o.id=r.order_id WHERE r.order_id=oid
$$;
REVOKE ALL ON FUNCTION service_private.concierge_receipt(uuid) FROM PUBLIC;
COMMIT;
