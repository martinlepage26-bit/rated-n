# Rated N

Rated N turns a user’s career story into evidence-backed Professional DNA, then compares that evidence with current public job listings. It includes private accounts, persistent career stories and roles, saved-path tracking, application status, and grounded résumé, cover-letter, and LinkedIn material generation. If the story has no defensible capability evidence, results stay empty. If the analysis engine fails, the profile is marked failed. Rated N does not invent capabilities, job titles, or match scores to keep the request alive. `POST /profiles/analyze` returns immediately with `status: analyzing`; the results page polls until the Workflow writes `ready` or `failed`.

## Architecture

- React and Vite frontend on Cloudflare Pages
- Same-origin Pages Function proxy at `/api`
- Dedicated `rated-n-api` Cloudflare Worker
- D1 for users, sessions, profiles, roles, and short-lived market cache
- Workers AI structured output for analysis and application materials
- Cloudflare Workflow (`rated-n-analysis`) for durable DNA extraction, market discovery, and role matching
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

## Releasing

The Worker and the Pages site are two deployments that have to agree on the
same request protocol, so Rated N ships them as one release rather than
separately:

```bash
npm run release
```

That runs typecheck, tests and lint, builds the frontend, stamps the release
commit into both halves, deploys the API before the site so the service binding
resolves, and then refuses to report success unless the live `/release.json`
and the live `/api/health` both report that commit.

```bash
npm run release:preview   # ship the current branch to a Pages preview
npm run verify:release    # check the live halves are on the same commit
```

`npm run release` requires a clean working tree, because a release has to be
reproducible from a commit; pass `--allow-dirty` to override deliberately.

Deploying only one half is what breaks this app: when the API moved to an
asynchronous analysis, production Pages kept serving a frontend that expected
the result inline, and every analysis appeared to return nothing. Both halves
were individually healthy, so nothing surfaced it. `verify:release` exists to
make that state impossible to miss.
