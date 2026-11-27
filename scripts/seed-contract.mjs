#!/usr/bin/env node
// Prepares a fresh PocketBase server for the contract suite: two pilots that are members of one club.
// Needs signup on (UPDRAFT_SIGNUP=true) and a superuser. Prints T1, T2 and CLUB as KEY=value lines.
//
// Usage: node scripts/seed-contract.mjs --url <server> --admin <email> --password <pw>
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { url: { type: 'string' }, admin: { type: 'string' }, password: { type: 'string' } }
});

if (!values.url || !values.admin || !values.password) {
  console.error('Usage: node scripts/seed-contract.mjs --url <server> --admin <email> --password <pw>');
  process.exit(1);
}

const base = values.url.replace(/\/$/, '');

// The auth routes are rate limited, so wait and retry on 429.
async function post(path, body, token) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
      body: JSON.stringify(body)
    });

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Math.max(1, Number(res.headers.get('retry-after') ?? 1)) * 1000));
      continue;
    }

    if (!res.ok) throw new Error(`POST ${path} answered ${res.status}: ${await res.text()}`);
    return res.json();
  }

  throw new Error(`POST ${path} stayed rate limited`);
}

const pilots = [];
for (const n of [1, 2]) {
  pilots.push(
    await post('/api/updraft/v2/auth/signup', { email: `contract${n}@example.org`, password: 'contract-pass-1' })
  );
}

const admin = await post('/api/collections/_superusers/auth-with-password', {
  identity: values.admin,
  password: values.password
});
const club = await post('/api/collections/clubs/records', { name: 'Contract club' }, admin.token);
for (const p of pilots) {
  await post('/api/collections/club_members/records', { club: club.id, user: p.user.id }, admin.token);
}

console.log(`T1=${pilots[0].token}\nT2=${pilots[1].token}\nCLUB=${club.id}`);
