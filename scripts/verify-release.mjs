#!/usr/bin/env node
/**
 * Confirms the deployed site and the deployed Worker came from the same commit.
 *
 * They are two independent deployments, so nothing stops one from shipping
 * without the other. That is not hypothetical: the API moved to an asynchronous
 * analysis while production Pages kept serving a frontend that expected the
 * result inline, and the mismatch stayed invisible for fourteen hours because
 * both halves were individually healthy.
 */

const DEFAULT_ORIGIN = 'https://rated-n.pages.dev';

async function readJson(url, init) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_rc=${Date.now()}`, init);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

// Probed independently and never short-circuited: the whole value of this check
// is naming which half is stale, which is lost if one unreadable endpoint hides
// the other's answer.
async function probe(origin) {
  const [site, api, config] = await Promise.allSettled([
    readJson(`${origin}/release.json`),
    readJson(`${origin}/api/health`, { headers: { Origin: origin } }),
    readJson(`${origin}/api/config`, { headers: { Origin: origin } })
  ]);
  const siteValue = site.status === 'fulfilled' ? site.value : null;
  const apiValue = api.status === 'fulfilled' ? api.value : null;
  return {
    site: siteValue?.commit || null,
    api: apiValue?.release && apiValue.release !== 'unknown' ? apiValue.release : null,
    builtAt: siteValue?.builtAt || null,
    config: config.status === 'fulfilled' ? config.value : null,
    siteError: site.status === 'rejected' ? site.reason.message : null,
    apiError: api.status === 'rejected' ? api.reason.message : null
  };
}

export async function verifyRelease({ origin = DEFAULT_ORIGIN, expected, attempts = 8, delayMs = 4_000 } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      last = await probe(origin);
      const agree = last.site && last.api && last.site === last.api;
      const matchesExpected = !expected || last.site === expected;
      if (agree && matchesExpected) return { ok: true, ...last };
    } catch (caught) {
      last = { siteError: caught.message, apiError: caught.message };
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { ok: false, ...last };
}

function describe(result, expected) {
  const lines = [
    `  site  release.json   ${result.site || `(not reported${result.siteError ? `: ${result.siteError}` : ''})`}`,
    `  api   /health        ${result.api || `(not reported${result.apiError ? `: ${result.apiError}` : ''})`}`
  ];
  if (expected) lines.push(`  expected              ${expected}`);
  if (result.builtAt) lines.push(`  site built at         ${result.builtAt}`);
  if (result.config) lines.push(`  api config            google=${result.config.google_auth_enabled} email=${result.config.email_delivery_enabled}`);
  return lines.join('\n');
}

if (import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2);
  const origin = args.find((arg) => arg.startsWith('--origin='))?.slice(9) || DEFAULT_ORIGIN;
  const expected = args.find((arg) => arg.startsWith('--commit='))?.slice(9);
  const result = await verifyRelease({ origin, expected, attempts: 1 });
  console.log(`Release check for ${origin}`);
  console.log(describe(result, expected));
  if (!result.ok) {
    if (result.site && result.api) console.error(`\nFAIL: the site is on ${result.site} but the API is on ${result.api}.`);
    else if (result.site) console.error('\nFAIL: the site reports a release but the API does not.');
    else if (result.api) console.error('\nFAIL: the API reports a release but the site does not.');
    else console.error('\nFAIL: neither half reports a release.');
    console.error('Run `npm run release` to ship both halves together.');
    process.exit(1);
  }
  console.log('\nOK: site and API are on the same release.');
}
