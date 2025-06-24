import { nip04, getEventHash, finalizeEvent, getPublicKey } from "nostr-tools";
import type { Event as NostrEvent, EventTemplate } from "nostr-tools";
import type { SendOpts, NostrMQConfig, EncryptedPayload } from "./types.js";
import { RelayPool, createRelayPool } from "./relayPool.js";
import {
  loadConfig,
  generateUniqueId,
  isValidPubkey,
  withTimeout,
  safeJsonStringify,
} from "./utils.js";
import { mineEventPow } from "./pow.js";

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Determine PoW difficulty based on options and configuration
 */
function determinePowDifficulty(
  powOpt: boolean | number | undefined,
  configDifficulty: number
): number {
  if (powOpt === false || powOpt === 0) {
    return 0; // Explicitly disabled
  }

  if (typeof powOpt === "number") {
    return Math.max(0, powOpt); // Use explicit difficulty
  }

  if (powOpt === true) {
    return Math.max(0, configDifficulty); // Use config difficulty
  }

  // Default: no PoW unless explicitly enabled
  return 0;
}

/**
 * Send a message via NostrMQ
 *
 * @param opts - Send options containing payload, target, and configuration
 * @returns Promise resolving to the event ID of the published message
 */
export async function send(opts: SendOpts): Promise<string> {
  // 1. Load and validate configuration
  const config = loadConfig();

  // Merge configuration with options
  const relays = opts.relays || config.relays;
  const timeout = opts.timeoutMs || 2000;
  const responsePubkey = opts.response || config.pubkey;

  // Validate required parameters
  if (!opts.payload) {
    throw new Error("Payload is required");
  }

  if (!opts.target) {
    throw new Error("Target pubkey is required");
  }

  if (!isValidPubkey(opts.target)) {
    throw new Error("Invalid target pubkey format");
  }

  if (!isValidPubkey(responsePubkey)) {
    throw new Error("Invalid response pubkey format");
  }

  // 2. Generate unique ID for the message
  const uniqueId = generateUniqueId();

  // 3. Create encrypted payload structure
  const encryptedPayload: EncryptedPayload = {
    target: opts.target,
    response: responsePubkey,
    payload: opts.payload,
  };

  let encryptedContent: string;
  try {
    // Encrypt payload using NIP-04
    const payloadJson = safeJsonStringify(encryptedPayload);

    encryptedContent = await nip04.encrypt(
      config.privkey,
      opts.target,
      payloadJson
    );
  } catch (error) {
    throw new Error(
      `Failed to encrypt payload: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // 4. Build kind 30072 event template
  let eventTemplate: EventTemplate & { pubkey: string } = {
    kind: 30072,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["p", opts.target],
      ["d", uniqueId],
    ],
    content: encryptedContent,
    pubkey: config.pubkey,
  };

  // Add optional response tag if different from sender
  if (responsePubkey !== config.pubkey) {
    eventTemplate.tags.push(["response", responsePubkey]);
  }

  // 5. Apply Proof-of-Work mining if enabled
  const powBits = determinePowDifficulty(opts.pow, config.powDifficulty);
  if (powBits > 0) {
    console.log(`Mining PoW with ${powBits} bits difficulty...`);
    try {
      eventTemplate = await mineEventPow(
        eventTemplate,
        powBits,
        config.powThreads
      );
    } catch (error) {
      throw new Error(
        `Failed to mine PoW: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // 6. Sign the event
  let signedEvent: NostrEvent;
  try {
    signedEvent = finalizeEvent(eventTemplate, hexToBytes(config.privkey));
  } catch (error) {
    throw new Error(
      `Failed to sign event: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  // 6. Publish to relays using RelayPool
  const relayPool = createRelayPool(config);

  try {
    // Connect to relays
    await withTimeout(
      relayPool.connect(),
      timeout,
      "Failed to connect to relays within timeout"
    );

    // Publish the event
    const publishResults = await withTimeout(
      relayPool.publish(signedEvent, relays),
      timeout,
      "Failed to publish event within timeout"
    );

    // Check if at least one relay accepted the event
    const successfulPublishes = Array.from(publishResults.entries()).filter(
      ([_, accepted]) => accepted
    );

    if (successfulPublishes.length === 0) {
      const failedRelays = Array.from(publishResults.entries())
        .filter(([_, accepted]) => !accepted)
        .map(([url, _]) => url);

      throw new Error(
        `Event was rejected by all relays: ${failedRelays.join(", ")}`
      );
    }

    // Log successful publishes
    console.log(
      `Event ${signedEvent.id} published successfully to ${successfulPublishes.length} relay(s):`,
      successfulPublishes.map(([url, _]) => url)
    );

    return signedEvent.id;
  } catch (error) {
    throw new Error(
      `Failed to publish event: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    // Clean up relay connections
    try {
      await relayPool.disconnect();
    } catch (error) {
      console.warn("Failed to disconnect from relays:", error);
    }
  }
}
