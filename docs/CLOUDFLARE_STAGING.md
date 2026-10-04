# Cloudflare staging — $0 path

The repository is ready for Cloudflare Pages + D1, but deployment is deliberately disabled until the user's Cloudflare account is authorized.

## Required GitHub environment secrets
Environment: `views-cloudflare-staging`

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The token should be scoped only to the staging Pages project and D1 database where possible. Never commit tokens.

## Required GitHub repository variable
- `CLOUDFLARE_STAGING_ENABLED=true`

Until that variable is true, the workflow safely skips deploy and GitHub Pages remains the static staging preview.

## Cloudflare resources
- Pages project: `views-hotel-platform`
- D1 database: `views-staging`
- D1 binding expected by Functions: `DB`
- Environment variable: `VIEWS_ENV=staging`

## Migration order
1. migrations/0001_core.sql
2. migrations/0002_seed_staging.sql

The seed contains no real guest personal data.
