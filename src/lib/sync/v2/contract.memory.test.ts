// Runs the contract suite against the in-memory server, so the spec and the suite are checked in normal CI.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe } from 'vitest';

import { type ContractEnv, contractSuite } from './contract';
import { createMemoryServer } from './memory-server';

const handle = createMemoryServer({
  tokens: { 'token-a': 'account-a', 'token-b': 'account-b' },
  clubs: { 'club-1': { name: 'Test club', members: ['account-a', 'account-b'] } }
});

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body
    });
    void handle(request).then(async (r) => {
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    });
  });
});

const env: ContractEnv = { url: '', token: 'token-a', token2: 'token-b', club: 'club-1' };

describe('memory server', () => {
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    env.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  contractSuite(env);
});
