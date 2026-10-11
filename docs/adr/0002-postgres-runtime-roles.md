# PostgreSQL runtime roles

VIEWS uses separate database identities.

## views_migrator / database owner
- schema migrations only
- never used by the HTTP API
- may own tables
- privileged credentials stay in deployment secrets

## views_app
- LOGIN
- NOSUPERUSER
- NOBYPASSRLS
- no DDL
- runtime DML only
- all tenant tables are protected by RLS

The API DATABASE_URL must point to views_app, never the migration/database-owner role.
This separation is mandatory because PostgreSQL superusers bypass RLS even when FORCE ROW LEVEL SECURITY is enabled.
