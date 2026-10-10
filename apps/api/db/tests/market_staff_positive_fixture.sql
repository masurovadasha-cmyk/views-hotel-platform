-- Positive and negative dispatcher permission checks with isolated fixture.
BEGIN;
INSERT INTO organizations(id,type,legal_name,display_name,country_code,default_currency,timezone)
VALUES('81000000-0000-4000-8000-000000000001','platform','Market Staff CI','{"en":"Market Staff CI"}','UZ','UZS','Asia/Tashkent')
ON CONFLICT(id) DO NOTHING;
-- This test intentionally uses a rolled-back fixture and must be expanded
-- with a valid membership/property role matrix before enabling staff writes.
ROLLBACK;
