# Rated N — Evidence-Grounded Career Analysis

Rated N turns a career narrative into a structured skills profile and compares that evidence with public job listings. Users can save roles, track applications, and prepare application materials from the same source story.

**Stack:** React, Vite, TypeScript, Cloudflare Workers, D1, Workflows, Workers AI, Vitest, and Playwright.

## Engineering highlights

- Analysis runs asynchronously with explicit analyzing, ready, and failed states.
- Evidence checks reject unsupported capability statements and avoid an artificial minimum match score.
- Authentication and persisted user data live behind the API.
- A coordinated release process checks that the frontend and API report the same revision.

## Review the implementation

| Question | Start here |
| --- | --- |
| How are generated claims checked against the story? | [Evidence logic](worker/src/evidence.ts), [regression tests](worker/src/evidence.test.ts) |
| How does analysis move through its stages? | [Workflow](worker/src/workflow.ts) |
| How are accounts handled? | [Authentication routes](worker/src/auth.ts) |
| How is frontend/API version drift detected? | [Release](scripts/release.mjs), [verification](scripts/verify-release.mjs) |
| How is the user journey checked? | [Browser tests](tests/app.spec.js) |

For a focused review, compare a supported skill with a skill absent from the same synthetic career story. Then follow the asynchronous result to its source evidence.

## Development and checks

```sh
npm install
npm run dev
```

The frontend expects the configured Worker API. Full analysis additionally needs the Cloudflare bindings and remote Browser Run setup described in the operating guide.

```sh
npm run build
npm test
npm run lint
npm run test:e2e
```

Use synthetic career stories and an isolated database for evaluation. Browser and provider-dependent checks need their documented environment.

## Scope

Job matches and generated application materials are decision support. A source-backed statement is not independent verification of a person's experience. Missing evidence and analysis failures should remain visible instead of being filled with plausible claims.

[Detailed setup and operating guide](https://github.com/martinlepage26-bit/rated-n/blob/bdcc80f2a4166c1be2f6043a9cd4ac285787e10b/README.md)
