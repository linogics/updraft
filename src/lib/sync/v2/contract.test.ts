// Runs the contract suite against a real server. Skipped unless CONTRACT_URL is set, see docs/server/README.md.
import { describe } from 'vitest';

import { contractSuite } from './contract';

const { CONTRACT_URL, CONTRACT_TOKEN, CONTRACT_TOKEN2, CONTRACT_CLUB } = process.env;
const run = CONTRACT_URL && CONTRACT_TOKEN ? describe : describe.skip;

run('sync contract', () => {
  contractSuite({ url: CONTRACT_URL ?? '', token: CONTRACT_TOKEN ?? '', token2: CONTRACT_TOKEN2, club: CONTRACT_CLUB });
});
