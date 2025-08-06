/**
 * MongoDB Pilot Server using NostrMQ
 *
 * Run a local MongoDB instance and listen for requests over Nostr.
 * The server expects environment variables:
 *   NOSTRMQ_PRIVKEY  - hex private key used to decrypt and send messages
 *   NOSTR_RELAYS     - comma separated relay URLs (required; no fallback)
 *   ALLOWED_SENDERS  - comma separated pubkeys allowed to send requests
 *
 * Usage: node examples/mongo-pilot-server.js
 */
import { send, receive } from "../dist/index.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

import { getPublicKey } from "nostr-tools";

const PRIVKEY = process.env.NOSTRMQ_PRIVKEY;
const RELAYS = process.env.NOSTR_RELAYS?.split(",");
const ALLOWED = process.env.ALLOWED_SENDERS?.split(",") || [];

if (!PRIVKEY || !RELAYS?.length) {
  console.error("Missing NOSTRMQ_PRIVKEY or NOSTR_RELAYS");
  process.exit(1);
}

console.log("SERVER_PRIVKEY pubkey:", getPublicKey(PRIVKEY));
console.log("ALLOWED_SENDERS:", ALLOWED);

const DB_MAP = {
  // map npub hex -> database name
  // example: 'npub1example...': 'testdb'
  exampledbnpub: "testdb",
};

async function start() {
  await mongoose.connect("mongodb://localhost:27017");
  console.log("Connected to MongoDB");

  const subscription = receive({
    onMessage: async (payload, sender) => {
      console.log("Received message from:", sender);

      if (!ALLOWED.includes(sender)) {
        console.log("Rejected: sender not whitelisted");
        return;
      }

      const {
        dbNpub,
        collection,
        action,
        query,
        update,
        document,
        replyPubkey,
      } = payload;

      if (!dbNpub || !collection || !action || !replyPubkey) {
        console.log("Rejected: missing required fields");
        return;
      }

      const dbName = DB_MAP[dbNpub];
      if (!dbName) {
        console.log("Rejected: no database mapping for", dbNpub);
        return;
      }

      console.log(`Processing ${action} on ${dbName}.${collection}`);
      console.log("Payload data:", { query, document, update });
      const conn = mongoose.connection.useDb(dbName);
      const Model = conn.model(
        collection,
        new mongoose.Schema({}, { strict: false }),
        collection
      );

      let result;
      try {
        if (action === "find") {
          result = await Model.find(query || {}).lean();
        } else if (action === "update") {
          result = await Model.updateMany(query || {}, update || {});
        } else if (action === "insert") {
          result = await Model.create(document || query || {});
        } else if (action === "delete") {
          result = await Model.deleteMany(query || {});
        } else {
          throw new Error("Invalid action");
        }
        await send({
          target: replyPubkey,
          payload: { status: "ok", data: result },
          relays: RELAYS,
          pow: false,
        });
      } catch (err) {
        await send({
          target: replyPubkey,
          payload: { status: "error", error: err.message },
          relays: RELAYS,
          pow: false,
        });
      }
    },
    relays: RELAYS,
    privkey: PRIVKEY,
    pow: false,
  });

  console.log("Server listening for NostrMQ messages");
  process.on("SIGINT", async () => {
    await subscription.close();
    await mongoose.disconnect();
    process.exit();
  });
}

start().catch((err) => {
  console.error("Startup error:", err);
  process.exit(1);
});
