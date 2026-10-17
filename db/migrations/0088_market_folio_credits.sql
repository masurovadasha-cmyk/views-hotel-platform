BEGIN;
ALTER TABLE public.folio_entries DROP CONSTRAINT folio_entries_kind_check;
ALTER TABLE public.folio_entries ADD CONSTRAINT folio_entries_kind_check CHECK(kind IN ('accommodation','service','minibar','fee','tax','payment','deposit','refund','reversal','credit'));
ALTER TABLE public.folio_entries ADD COLUMN credit_of uuid;
ALTER TABLE public.folio_entries ADD CONSTRAINT folio_credit_source_fk FOREIGN KEY(organization_id,folio_id,credit_of) REFERENCES public.folio_entries(organization_id,folio_id,id);
ALTER TABLE public.folio_entries ADD CONSTRAINT folio_credit_shape CHECK((kind='credit')=(credit_of IS NOT NULL) AND (kind<>'credit' OR amount_minor<0));
CREATE INDEX folio_credit_source_idx ON public.folio_entries(credit_of) WHERE credit_of IS NOT NULL;
CREATE TABLE public.market_credits (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,property_id uuid NOT NULL,order_id uuid NOT NULL,
 folio_id uuid NOT NULL,original_entry_id uuid NOT NULL,currency char(3) NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>0),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,property_id,order_id) REFERENCES public.market_orders(organization_id,property_id,order_id),
 FOREIGN KEY(organization_id,property_id,folio_id,currency) REFERENCES public.guest_folios(organization_id,property_id,id,currency),
 FOREIGN KEY(organization_id,folio_id,original_entry_id) REFERENCES public.folio_entries(organization_id,folio_id,id),
 FOREIGN KEY(id) REFERENCES public.folio_entries(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX market_credits_order_idx ON public.market_credits(order_id,created_at,id);
ALTER TABLE public.market_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_credits FORCE ROW LEVEL SECURITY;
CREATE POLICY market_credits_read ON public.market_credits FOR SELECT USING(app.registry_access(organization_id,property_id,'finance.read') OR app.registry_access(organization_id,property_id,'reservation.read'));
CREATE TRIGGER market_credits_immutable BEFORE UPDATE OR DELETE ON public.market_credits FOR EACH ROW EXECUTE FUNCTION app.registry_append_only();
CREATE FUNCTION app.market_credit_entry_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original public.folio_entries; credited numeric;
BEGIN
 IF NEW.kind='credit' THEN
  SELECT * INTO original FROM public.folio_entries WHERE id=NEW.credit_of;
  IF original.id IS NULL OR original.kind<>'service' OR original.source_type<>'service_order' OR original.ledger_journal_id IS NOT NULL
   OR NEW.source_type<>'market_credit' OR NEW.source_id<>NEW.id OR NEW.ledger_journal_id IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.folio_entries WHERE reversal_of=original.id)
   OR NOT EXISTS(SELECT 1 FROM public.market_credits c JOIN public.market_orders m ON m.order_id=c.order_id
    WHERE c.id=NEW.id AND c.organization_id=NEW.organization_id AND c.property_id=NEW.property_id AND c.folio_id=NEW.folio_id AND c.currency=NEW.currency
    AND c.original_entry_id=original.id AND c.amount_minor::numeric=-NEW.amount_minor::numeric AND m.folio_entry_id=original.id AND m.stage='completed')
  THEN RAISE EXCEPTION 'SERVICE_CREDIT_NOT_ALLOWED' USING ERRCODE='23514';END IF;
  SELECT coalesce(-sum(amount_minor::numeric),0) INTO credited FROM public.folio_entries WHERE credit_of=original.id;
  IF credited-NEW.amount_minor::numeric>original.amount_minor::numeric THEN RAISE EXCEPTION 'SERVICE_CREDIT_LIMIT' USING ERRCODE='23514';END IF;
 ELSIF NEW.reversal_of IS NOT NULL AND (EXISTS(SELECT 1 FROM public.folio_entries WHERE credit_of=NEW.reversal_of) OR EXISTS(SELECT 1 FROM public.folio_entries WHERE id=NEW.reversal_of AND kind='credit')) THEN
  RAISE EXCEPTION 'SERVICE_CREDIT_NOT_ALLOWED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
-- The existing folio_entry_check runs first and locks the folio, serializing credits/reversals.
CREATE TRIGGER market_credit_entry_guard BEFORE INSERT ON public.folio_entries FOR EACH ROW EXECUTE FUNCTION app.market_credit_entry_guard();
REVOKE ALL ON FUNCTION app.market_credit_entry_guard() FROM PUBLIC;
COMMIT;
