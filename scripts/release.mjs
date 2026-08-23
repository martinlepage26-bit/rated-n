#!/usr/bin/env node
/**
 * Ships Rated N as one release instead of two independent deployments.
 *
 * The Worker and the Pages site are separate deployments that must agree on the
 * same protocol, so shipping one without the other silently breaks the app
 * while both halves still report healthy. This runs the gates, deploys both
 * from one commit, stamps that commit into each, and refuses to finish unless
 * the live site and the live API report it back.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { verifyRelease } from './verify-release.mjs';

const WRANGLER = path.join('node_modules', '.bin', 'wrangler');
const PRODUCTION_BRANCH = 'main';
const PRODUCTION_ORIGIN = 'https://rated-n.pages.dev';

const args = process.argv.slice(2);
const target = args.find((arg) => arg.startsWith('--target='))?.slice(9) || 'production';
const allowDirty = args.includes('--allow-dirty');
const skipGates = args.includes('--skip-gates');

if (!['production', 'preview'].includes(target)) {
  fail(`Unknown target "${target}". Use --target=production or --target=preview.`);
}

function fail(message) {
  console.error(`\nrelease: ${message}`);
  process.exit(1);
}

function run(command, commandArgs, label) {
  console.log(`\n── ${label}`);
  execFileSync(command, commandArgs, { stdio: 'inherit' });
}

function capture(command, commandArgs) {
  return execFileSync(command, commandArgs, { encoding: 'utf8' }).trim();
}

const commit = capture('git', ['rev-parse', '--short', 'HEAD']);
const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const dirty = capture('git', ['status', '--porcelain']).length > 0;

if (dirty && !allowDirty) {
  fail('the working tree has uncommitted changes.\n' +
    '  A release must be reproducible from a commit. Commit first, or pass --allow-dirty\n' +
    '  if you knowingly want to ship an untracked state.');
}

// The Pages branch decides production vs preview. Inferring it from the current
// git branch is what let fourteen hours of frontend work sit in preview while
// production served a stale build, so the target is explicit and the branch is
// derived from it.
const pagesBranch = target === 'production' ? PRODUCTION_BRANCH : branch;

console.log(`Releasing ${commit}${dirty ? ' (dirty)' : ''} from ${branch} to ${target} (Pages branch: ${pagesBranch})`);

if (!skipGates) {
  run('npm', ['run', 'typecheck'], 'typecheck');
  run('npm', ['test', '--silent'], 'tests');
  run('npm', ['run', 'lint'], 'lint');
}

run('npx', ['vite', 'build'], 'build frontend');

// Written after the build because vite empties dist.
writeFileSync(path.join('dist', 'release.json'), `${JSON.stringify({
  commit,
  branch,
  target,
  builtAt: new Date().toISOString()
}, null, 2)}\n`);
console.log(`   stamped dist/release.json with ${commit}`);

// API first: the Pages Function resolves its service binding against the Worker.
run(WRANGLER, ['deploy', '--config', 'worker/wrangler.jsonc', '--var', `RELEASE_COMMIT:${commit}`], 'deploy API');
run(WRANGLER, ['pages', 'deploy', 'dist', '--project-name', 'rated-n', '--branch', pagesBranch, '--commit-dirty=true'], `deploy site (${pagesBranch})`);

if (target !== 'production') {
  console.log(`\nPreview released. Production was not touched; verify the preview URL printed above.`);
  process.exit(0);
}

console.log('\n── verify both halves report the same release');
const result = await verifyRelease({ origin: PRODUCTION_ORIGIN, expected: commit });
console.log(`  site  release.json   ${result.site || '(not reported)'}`);
console.log(`  api   /health        ${result.api || '(not reported)'}`);
if (result.config) console.log(`  api config            google=${result.config.google_auth_enabled} email=${result.config.email_delivery_enabled}`);
if (!result.ok) {
  fail(`the deployed halves do not both report ${commit}.\n` +
    '  The app may be serving a frontend and an API that disagree. Re-run, or\n' +
    '  investigate with `npm run verify:release`.');
}
console.log(`\nReleased ${commit} to ${PRODUCTION_ORIGIN} — site and API agree.`);
