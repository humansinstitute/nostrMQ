/**
 * MongoDB Pilot Server using NostrMQ
 *
 * Run a local MongoDB instance and listen for requests over Nostr.
 * The server expects environment variables:
 *   NOSTRMQ_PRIVKEY  - hex private key used to decrypt and send messages
 *   NOSTRMQ_RELAYS   - comma separated relay URLs
 *   ALLOWED_SENDERS  - comma separated pubkeys allowed to send requests
 *
 * Usage: node examples/mongo-pilot-server.js
 */
import { send, receive } from '../dist/index.js';
import { MongoClient } from 'mongodb';

const PRIVKEY = process.env.NOSTRMQ_PRIVKEY;
const RELAYS = process.env.NOSTRMQ_RELAYS?.split(',');
const ALLOWED = process.env.ALLOWED_SENDERS?.split(',') || [];

if (!PRIVKEY || !RELAYS?.length) {
  console.error('Missing NOSTRMQ_PRIVKEY or NOSTRMQ_RELAYS');
  process.exit(1);
}

const DB_MAP = {
  // map npub hex -> database name
  // example: 'npub1example...': 'testdb'
};

async function start() {
  const mongo = new MongoClient('mongodb://localhost:27017');
  await mongo.connect();
  console.log('Connected to MongoDB');

  const subscription = receive({
    onMessage: async (payload, sender) => {
      if (!ALLOWED.includes(sender)) {
        console.log('Ignored message from', sender);
        return;
      }
      const { dbNpub, collection, action, query, update, replyPubkey } = payload;
      if (!dbNpub || !collection || !action || !replyPubkey) return;
      const dbName = DB_MAP[dbNpub];
      if (!dbName) return;
      const db = mongo.db(dbName).collection(collection);
      let result;
      try {
        if (action === 'find') {
          result = await db.find(query || {}).toArray();
        } else if (action === 'update') {
          result = await db.updateMany(query || {}, update || {});
        } else if (action === 'delete') {
          result = await db.deleteMany(query || {});
        } else {
          throw new Error('Invalid action');
        }
        await send({
          target: replyPubkey,
          payload: { status: 'ok', data: result },
          pow: false,
        });
      } catch (err) {
        await send({
          target: replyPubkey,
          payload: { status: 'error', error: err.message },
          pow: false,
        });
      }
    },
    relays: RELAYS,
    privkey: PRIVKEY,
    pow: false,
  });

  console.log('Server listening for NostrMQ messages');
  process.on('SIGINT', async () => {
    await subscription.close();
    await mongo.close();
    process.exit();
  });
}

start().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
