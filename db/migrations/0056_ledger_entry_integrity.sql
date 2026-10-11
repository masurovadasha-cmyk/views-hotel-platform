BEGIN;
-- Do not rewrite posted history. Protect inserts as well as both sides of a move.
DROP TRIGGER ledger_entries_immutable_after_post ON ledger_entries;
CREATE OR REPLACE FUNCTION app.prevent_posted_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE old_journal uuid; new_journal uuid; target_org uuid; account_org uuid; account_currency char(3);
BEGIN
 IF TG_OP<>'INSERT' THEN old_journal:=OLD.journal_id; END IF;
 IF TG_OP<>'DELETE' THEN new_journal:=NEW.journal_id; END IF;
 -- Serialize with status='posted', and use stable lock order for row moves.
 PERFORM id FROM public.ledger_journals WHERE id IN (old_journal,new_journal) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.ledger_journals WHERE id IN (old_journal,new_journal) AND status='posted') THEN
  RAISE EXCEPTION 'posted ledger entries are immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT organization_id INTO target_org FROM public.ledger_journals WHERE id=new_journal;
 SELECT organization_id,currency INTO account_org,account_currency FROM public.ledger_accounts WHERE id=NEW.account_id FOR SHARE;
 IF target_org IS NULL OR account_org IS DISTINCT FROM target_org OR account_currency IS DISTINCT FROM NEW.currency THEN
  RAISE EXCEPTION 'LEDGER_ACCOUNT_SCOPE_OR_CURRENCY_MISMATCH' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ledger_entries_immutable_after_post BEFORE INSERT OR UPDATE OR DELETE ON ledger_entries
 FOR EACH ROW EXECUTE FUNCTION app.prevent_posted_ledger_mutation();
CREATE FUNCTION app.guard_ledger_account_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (NEW.organization_id,NEW.code,NEW.currency,NEW.account_type) IS DISTINCT FROM (OLD.organization_id,OLD.code,OLD.currency,OLD.account_type) THEN
  RAISE EXCEPTION 'LEDGER_ACCOUNT_IDENTITY_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ledger_account_identity BEFORE UPDATE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION app.guard_ledger_account_identity();
COMMIT;
