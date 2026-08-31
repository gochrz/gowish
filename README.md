# GoWish Creator Program

Static creator and manager intake pages backed by Convex.

## Repository layout

- `vercel-site/` contains the only files Vercel should publish.
- `convex/` contains the database schema, public HTTP routes, admin operations, and automated tests.
- `tests/` verifies that the static pages use the expected backend contract.
- `docs/plans/` records the workflow and data decisions behind the implementation.

## Local verification

```bash
npm ci
npm run verify
```

## Convex Development

The current development deployment is `tough-spaniel-606`.

Required Convex environment variables:

- `ALLOWED_ORIGINS`
- `ADMIN_KEY`
- `IDENTITY_HASH_SALT`
- `PUBLIC_SITE_URL`

Deploy credentials and admin credentials must never be committed. Automated email is intentionally not configured.

## Vercel

Connect this repository to the existing GoWish Vercel project with:

- Production branch: `main`
- Root Directory: `vercel-site`
- Framework preset: `Other`
- Build command: none
- Output directory: none

The public form is `index.html`. The protected operations console is `admin.html`.
