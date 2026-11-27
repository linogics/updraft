#!/usr/bin/env node
// Runs the sync contract suite against a server.
//
// Usage: npm run contract -- --url <server> --token <t> [--token2 <t>] [--club <id>]
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { url: { type: 'string' }, token: { type: 'string' }, token2: { type: 'string' }, club: { type: 'string' } }
});

if (!values.url || !values.token) {
  console.error('Usage: npm run contract -- --url <server> --token <t> [--token2 <t>] [--club <id>]');
  process.exit(1);
}

const env = {
  ...process.env,
  CONTRACT_URL: values.url,
  CONTRACT_TOKEN: values.token,
  ...(values.token2 ? { CONTRACT_TOKEN2: values.token2 } : {}),
  ...(values.club ? { CONTRACT_CLUB: values.club } : {})
};
const run = spawnSync('npx', ['vitest', 'run', 'src/lib/sync/v2/contract.test.ts'], { env, stdio: 'inherit' });
process.exit(run.status ?? 1);
