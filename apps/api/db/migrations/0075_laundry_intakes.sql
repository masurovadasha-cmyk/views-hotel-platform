BEGIN;
ALTER TABLE service_catalog DROP CONSTRAINT service_catalog_execution_kind_check;
ALTER TABLE service_catalog ADD CONSTRAINT service_catalog_execution_kind_check CHECK(execution_kind IN ('cleaning','laundry'));
CREATE TABLE laundry_intakes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, property_id uuid NOT NULL,
 reservation_id uuid NOT NULL, service_id uuid NOT NULL, currency char(3) NOT NULL,
 stage text NOT NULL DEFAULT 'requested' CHECK(stage IN ('requested','received','quoted','accepted','washing','ready','delivered','closed','awaiting_return','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), declared_count integer NOT NULL CHECK(declared_count BETWEEN 1 AND 50),
 preferences text NOT NULL CHECK(length(preferences)<=500), pickup_at timestamptz NOT NULL,
 estimate_minor bigint NOT NULL CHECK(estimate_minor>0), name jsonb NOT NULL,
 items jsonb, total_minor bigint CHECK(total_minor>0), return_by timestamptz,
 commission_bps integer NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
 order_id uuid UNIQUE REFERENCES service_orders(id), folio_entry_id uuid UNIQUE REFERENCES folio_entries(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,reservation_id,currency) REFERENCES reservations(organization_id,property_id,id,currency),
 FOREIGN KEY(organization_id,property_id,service_id,currency) REFERENCES service_catalog(organization_id,property_id,id,currency),
 CHECK((stage='closed')=(folio_entry_id IS NOT NULL)),
 CHECK(stage NOT IN ('accepted','washing','ready','delivered','closed') OR order_id IS NOT NULL),
 CHECK(stage IN ('requested','received','cancelled') OR (items IS NOT NULL AND total_minor IS NOT NULL AND return_by IS NOT NULL))
);
CREATE INDEX laundry_intakes_property_idx ON laundry_intakes(organization_id,property_id,id);
CREATE INDEX laundry_intakes_reservation_idx ON laundry_intakes(reservation_id,id);
ALTER TABLE laundry_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_intakes FORCE ROW LEVEL SECURITY;
CREATE POLICY laundry_intake_read ON laundry_intakes FOR SELECT USING(app.registry_access(organization_id,property_id,'reservation.manage'));
-- Runtime mutations use authenticated functions only.
CREATE FUNCTION service_private.laundry_receipt(i public.laundry_intakes) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('intakeId',i.id,'stage',i.stage,'revision',i.revision,'name',i.name,'currency',i.currency,
 'declaredCount',i.declared_count,'preferences',i.preferences,'pickupAt',i.pickup_at,'estimateMinor',i.estimate_minor::text,
 'items',i.items,'totalMinor',i.total_minor::text,'returnBy',i.return_by,'orderId',i.order_id,'idempotentReplay',false)
$$;
CREATE FUNCTION service_private.laundry_record(who uuid,mid uuid,key uuid,payload jsonb,i public.laundry_intakes,event text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb:=service_private.laundry_receipt(i); summary jsonb;
BEGIN
 INSERT INTO service_private.commands(actor_user_id,command_key,payload,result) VALUES(who,key,payload,result);
 summary:=jsonb_build_object('intakeId',i.id,'stage',i.stage,'revision',i.revision,'orderId',i.order_id);
 INSERT INTO public.audit_log(organization_id,actor_user_id,actor_membership_id,action,entity_type,entity_id,after_state) VALUES(i.organization_id,who,mid,event,'laundry_intake',i.id,summary);
 INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES(i.organization_id,'laundry_intake',i.id,event,'laundry:'||who||':'||key,summary);
 RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA service_private FROM PUBLIC;
COMMIT;
