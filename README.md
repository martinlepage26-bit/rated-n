# Rated N

Rated N turns a user’s career story into evidence-backed Professional DNA, then compares that evidence with current public job listings. It includes private accounts, persistent career stories and roles, saved-path tracking, application status, and grounded résumé, cover-letter, and LinkedIn material generation.

## Architecture

- React and Vite frontend on Cloudflare Pages
- Same-origin Pages Function proxy at `/api`
- Dedicated `rated-n-api` Cloudflare Worker
- D1 for users, sessions, profiles, roles, and short-lived market cache
- Workers AI structured output for analysis and application materials
- Browser Run for current public-job discovery
- HttpOnly, Secure, SameSite session cookies; PBKDF2 password hashing; hashed session, verification, and reset tokens

Raw career stories stay inside Rated N and Cloudflare-hosted processing. Public job searches receive derived role titles and the user’s optional location, not the raw story.

## Local checks

```bash
npm install
npm run build
npm test
npm run lint
npm run test:e2e
```

`npm run dev` starts the frontend with `/api` proxied to a Worker on port 8788. Browser Run is a remote-only binding, so end-to-end analysis development should use Wrangler’s remote development support or a deployed preview.

## Cloudflare setup

Create the D1 database and replace its ID in `worker/wrangler.jsonc`, then apply migrations:

```bash
npx wrangler d1 create rated-n-db
npm run db:migrate:remote
```

Set the mandatory account-security secret:

```bash
npx wrangler secret put AUTH_PEPPER --config worker/wrangler.jsonc
```

For email registration, verification, and password reset, onboard Cloudflare Email Sending with a verified sender domain, add an `EMAIL` send-email binding to `worker/wrangler.jsonc`, and set `EMAIL_FROM` to the approved sender. The app reports email registration unavailable until both are present; it never pretends an email was sent.

For Google sign-in, create a Google OAuth web client with this authorized redirect URI:

```text
https://rated-n.pages.dev/api/auth/google/callback
```

Then add both Worker secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID --config worker/wrangler.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET --config worker/wrangler.jsonc
```

Deploy the API before the Pages app so the service binding resolves:

```bash
npm run deploy:api
npm run build
npm run deploy:web
```
