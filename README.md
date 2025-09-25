# Plytix -> Lightspeed Sync App

This project syncs product data from Plytix PIM to multiple Lightspeed shops (New Rebels, Lial, Justified). It runs on Vercel (frontend + serverless API) with Supabase as the database.

## Architecture
- One GitHub repository
- Three Vercel projects (newrebels, lial, justified) on the same repo
- One Supabase project per shop (separate DB)
- TENANT selects which shop runs; optional metadata in `config/<TENANT>.json`

## Environment Variables
Frontend vars start with `REACT_APP_` (compile-time). Backend vars are runtime secrets.

| Var | Scope | Description |
|-----|------|-------------|
| TENANT | Backend/Frontend | `newrebels` | `lial` | `justified` |
| REACT_APP_SUPABASE_URL | Frontend | Supabase project URL |
| REACT_APP_SUPABASE_ANON_KEY | Frontend | Supabase anon key |
| SUPABASE_URL | Backend | Supabase project URL |
| SUPABASE_SERVICE_ROLE | Backend | Supabase service key (server-side only) |
| PLYTIX_API_KEY | Backend | Plytix API key |
| LIGHTSPEED_CLIENT_ID | Backend | Lightspeed client id |
| LIGHTSPEED_CLIENT_SECRET | Backend | Lightspeed secret |
| LIGHTSPEED_BASE_URL | Backend | Lightspeed API base URL |
| DRY_RUN | Backend | `true` in Preview, `false` in Production |

### Env matrix (Production)
- NewRebels: `TENANT=newrebels`, own Supabase/keys, `DRY_RUN=false`
- Lial: `TENANT=lial`, own Supabase/keys, `DRY_RUN=false`
- Justified: `TENANT=justified`, own Supabase/keys, `DRY_RUN=false`
- Preview (all projects): `DRY_RUN=true`

## Repository structure
- `/frontend` -> CRA app (production build)
- `/backend` -> Express app (exported as serverless)
- `/api/index.js` -> Exports backend app for Vercel functions
- `/config` -> Tenant configs (newrebels.json, lial.json, justified.json)
- `vercel.json` -> Static build + SPA rewrites
- `README.md`

## Deploy on Vercel
1. Connect repo to Vercel. Create 3 projects: `newrebels`, `lial`, `justified` (same repo)
2. Set env vars per project (see matrix). Production: `DRY_RUN=false`; Preview: `DRY_RUN=true`
3. Build settings
   - Build command: `npm run build --prefix frontend`
   - Output directory: `frontend/build`
4. Rewrites in `vercel.json` (SPA):
   - `/api/(.*)` -> `/api/$1`
   - `/(.*)` -> `/`
5. Deploy: `vercel --prod`

## Database (Supabase)
- Tables: `variant_lookup`, `brands`, `suppliers`, `image_tracking`, `import_runs`, `import_items`, `settings`, `exclusions`
- No file-based settings; use Supabase or env

## Cron Jobs
- `/api/sync/run` -> hourly
- `/api/sync/images` -> daily 02:00
- Endpoints are idempotent and respect `DRY_RUN`

## Health & Logging
- `GET /api/health` -> `{ ok: true, tenant }`
- `GET /api/logs/test` -> smoke-test logging
- Server logs are prefixed with `tenant=<TENANT>`

## Release flow
- Feature branch -> PR -> Preview deploy (`DRY_RUN=true`)
- Review per shop (same build, different TENANT/env)
- Merge to `main` -> Production (`DRY_RUN=false`)

## Pre-live checklist
- No file reads for settings (no `settings.json`)
- Backend exported via `api/index.js`; no `app.listen` on Vercel
- Frontend builds to `frontend/build`
- Import/update per SKU (short calls; no timeouts)
- 3 Vercel projects with correct env sets
- Health & logs smoke-tests OK
