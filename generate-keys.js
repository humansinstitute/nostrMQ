import { generateSecretKey, getPublicKey } from "nostr-tools";
import { nip19 } from "nostr-tools";

// Generate a new private key for the server
const serverPrivKey = generateSecretKey();
const serverPubKey = getPublicKey(serverPrivKey);

// Convert to hex strings
const serverPrivKeyHex = Buffer.from(serverPrivKey).toString("hex");
const serverPubKeyHex = serverPubKey;

// Convert public key to npub format for reference
const serverNpub = nip19.npubEncode(serverPubKey);

console.log("Generated keys for MongoDB Pilot:");
console.log("");
console.log("Server Private Key (hex):", serverPrivKeyHex);
console.log("Server Public Key (hex):", serverPubKeyHex);
console.log("Server Public Key (npub):", serverNpub);
console.log("");
console.log("Environment variables to add to .env:");
console.log("");
console.log(`NOSTRMQ_PRIVKEY=${serverPrivKeyHex}`);
console.log(`TARGET_PUBKEY=${serverPubKeyHex}`);
console.log(`ALLOWED_SENDERS=${serverPubKeyHex}`);
console.log("# You must set NOSTR_RELAYS (comma-separated). Example:");
console.log("NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band");
