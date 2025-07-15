import { getPublicKey } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { config } from "dotenv";

// Load environment variables
config();

// Get the private key from environment
const privKeyHex = process.env.NOSTRMQ_PRIVKEY;

if (!privKeyHex) {
  console.error("Error: NOSTRMQ_PRIVKEY not found in .env file");
  process.exit(1);
}

// Validate private key format (should be 64 hex characters)
if (!/^[0-9a-fA-F]{64}$/.test(privKeyHex)) {
  console.error("Error: NOSTRMQ_PRIVKEY must be 64 hex characters");
  process.exit(1);
}

try {
  // Convert hex string to Uint8Array
  const privKeyBytes = new Uint8Array(
    privKeyHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
  );

  // Get public key from private key
  const pubKey = getPublicKey(privKeyBytes);

  // Convert public key to npub format
  const npub = nip19.npubEncode(pubKey);

  console.log("Sender npub for whitelisting:");
  console.log(npub);
  console.log("");
  console.log("Private key (hex):", privKeyHex);
  console.log("Public key (hex):", pubKey);
} catch (error) {
  console.error("Error converting private key:", error.message);
  process.exit(1);
}
