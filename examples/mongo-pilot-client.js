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
import { send, receive } from "../dist/index.js";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const TARGET = process.env.TARGET_PUBKEY;
const RELAYS = process.env.NOSTRMQ_RELAYS?.split(",");
const CLIENT_PRIVKEY = process.env.NOSTRMQ_PRIVKEY; // Use the whitelisted key for sending
if (!TARGET || !RELAYS?.length || !CLIENT_PRIVKEY) {
  console.error("Missing TARGET_PUBKEY, NOSTRMQ_RELAYS, or NOSTRMQ_PRIVKEY");
  console.error(
    "Make sure to run with: node --env-file=.env examples/mongo-pilot-client.js"
  );
  process.exit(1);
}

console.log("CLIENT_PRIVKEY pubkey:", getPublicKey(CLIENT_PRIVKEY));
console.log("TARGET pubkey:", TARGET);

async function run() {
  const rl = readline.createInterface({ input, output });

  const choice = await rl.question(
    "Choose action:\n  a) insert sample\n  b) read sample\n  c) delete sample\n> "
  );
  rl.close();

  // create ephemeral keys for reply
  const replyPrivBytes = generateSecretKey();
  const replyPriv = Array.from(replyPrivBytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  const replyPub = getPublicKey(replyPrivBytes);

  const sub = receive({
    onMessage: (payload) => {
      console.log("Response received:", payload);
      sub.close();
      process.exit(0);
    },
    privkey: replyPriv,
    relays: RELAYS,
    pow: false,
  });

  const payload = {
    dbNpub: "exampledbnpub",
    collection: "users",
    replyPubkey: replyPub,
    action: "find",
    query: { id: 1 },
  };

  if (choice.trim().toLowerCase().startsWith("a")) {
    payload.action = "insert";
    payload.document = { userId: 1, name: "Alice" }; // Use userId instead of id
  } else if (choice.trim().toLowerCase().startsWith("b")) {
    payload.action = "find";
    payload.query = { userId: 1 }; // Query for userId instead of id
  } else if (choice.trim().toLowerCase().startsWith("c")) {
    payload.action = "delete";
    payload.query = { userId: 1 };
  } else {
    console.log("Unknown choice");
    await sub.close();
    process.exit(1);
  }

  await send({
    target: TARGET,
    payload,
    relays: RELAYS,
    pow: false,
    privkey: CLIENT_PRIVKEY, // Use whitelisted key for sending
  });

  console.log("Request sent. Waiting for reply...");
}

run().catch((err) => {
  console.error("Client error:", err);
  process.exit(1);
});
