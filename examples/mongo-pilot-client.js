/**
 * MongoDB Pilot Client using NostrMQ
 *
 * Demonstrates sending a request to the pilot server and reading the response
 * using an ephemeral key pair.
 *
 * Expected environment variables:
 *   TARGET_PUBKEY      - server pubkey in hex
 *   NOSTRMQ_RELAYS     - comma separated relay URLs
 *
 * Usage: node examples/mongo-pilot-client.js
 */
import { send, receive } from '../dist/index.js';
import { generatePrivateKey, getPublicKey } from 'nostr-tools';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const TARGET = process.env.TARGET_PUBKEY;
const RELAYS = process.env.NOSTRMQ_RELAYS?.split(',');
if (!TARGET || !RELAYS?.length) {
  console.error('Missing TARGET_PUBKEY or NOSTRMQ_RELAYS');
  process.exit(1);
}


async function run() {
  const rl = readline.createInterface({ input, output });

  const choice = await rl.question('Choose action:\n  a) insert sample\n  b) read sample\n  c) delete sample\n> ');
  rl.close();

  // create ephemeral keys for reply
  const replyPriv = generatePrivateKey();
  const replyPub = getPublicKey(replyPriv);

  const sub = receive({
    onMessage: (payload) => {
      console.log('Response:', payload);
      sub.close();
      process.exit(0);
    },
    privkey: replyPriv,
    relays: RELAYS,
    pow: false,
  });

  const payload = {
    dbNpub: 'exampledbnpub',
    collection: 'users',
    replyPubkey: replyPub,
    action: 'find',
    query: { id: 1 },
  };

  if (choice.trim().toLowerCase().startsWith('a')) {
    payload.action = 'insert';
    payload.query = { id: 1, name: 'Alice' };
  } else if (choice.trim().toLowerCase().startsWith('b')) {
    payload.action = 'find';
    payload.query = { id: 1 };
  } else if (choice.trim().toLowerCase().startsWith('c')) {
    payload.action = 'delete';
    payload.query = { id: 1 };
  } else {
    console.log('Unknown choice');
    await sub.close();
    process.exit(1);
  }

  await send({ target: TARGET, payload, relays: RELAYS, pow: false });

  console.log('Request sent. Waiting for reply...');
}

run().catch((err) => {
  console.error('Client error:', err);
  process.exit(1);
});
