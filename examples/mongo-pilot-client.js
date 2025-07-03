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

const TARGET = process.env.TARGET_PUBKEY;
const RELAYS = process.env.NOSTRMQ_RELAYS?.split(',');
if (!TARGET || !RELAYS?.length) {
  console.error('Missing TARGET_PUBKEY or NOSTRMQ_RELAYS');
  process.exit(1);
}

// create ephemeral keys for reply
const replyPriv = generatePrivateKey();
const replyPub = getPublicKey(replyPriv);

async function run() {
  // listen for the reply
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

  // send request
  await send({
    target: TARGET,
    payload: {
      dbNpub: 'exampledbnpub',
      collection: 'users',
      action: 'find',
      query: { id: 1 },
      replyPubkey: replyPub,
    },
    relays: RELAYS,
    pow: false,
  });

  console.log('Request sent. Waiting for reply...');
}

run().catch((err) => {
  console.error('Client error:', err);
  process.exit(1);
});
