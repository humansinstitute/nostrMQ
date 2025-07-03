import { nip04, getPublicKey } from "nostr-tools";
import type { Event as NostrEvent } from "nostr-tools";
import type {
  ReceiveOpts,
  SubscriptionHandle,
  NostrMQConfig,
  EncryptedPayload,
} from "./types.js";
import { RelayPool, createRelayPool } from "./relayPool.js";
import {
  loadConfig,
  generateUniqueId,
  isValidPubkey,
  safeJsonParse,
} from "./utils.js";

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
 * Message data for async iteration
 */
interface MessageData {
  payload: unknown;
  sender: string;
  rawEvent: NostrEvent;
}

/**
 * Implementation of SubscriptionHandle
 */
class SubscriptionHandleImpl implements SubscriptionHandle {
  private subscriptionId: string;
  private relayPool: RelayPool;
  private messageQueue: MessageData[] = [];
  private messageResolvers: Array<
    (value: IteratorResult<MessageData>) => void
  > = [];
  private closed = false;

  constructor(subscriptionId: string, relayPool: RelayPool) {
    this.subscriptionId = subscriptionId;
    this.relayPool = relayPool;
  }

  /**
   * Close the subscription and cleanup
   */
  close(): void {
    if (this.closed) return;

    this.closed = true;

    // Unsubscribe from relays
    this.relayPool.unsubscribe(this.subscriptionId);

    // Resolve any pending iterators with done: true
    for (const resolver of this.messageResolvers) {
      resolver({ done: true, value: undefined });
    }
    this.messageResolvers = [];

    // Disconnect from relays
    this.relayPool.disconnect().catch((error) => {
      console.warn("Failed to disconnect from relays:", error);
    });
  }

  /**
   * Add a message to the queue for async iteration
   */
  addMessage(message: MessageData): void {
    if (this.closed) return;

    if (this.messageResolvers.length > 0) {
      // Resolve waiting iterator
      const resolver = this.messageResolvers.shift()!;
      resolver({ done: false, value: message });
    } else {
      // Queue message for later
      this.messageQueue.push(message);
    }
  }

  /**
   * Async iterator implementation
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<MessageData> {
    while (!this.closed) {
      if (this.messageQueue.length > 0) {
        yield this.messageQueue.shift()!;
      } else {
        // Wait for next message
        const result = await new Promise<IteratorResult<MessageData>>(
          (resolve) => {
            if (this.closed) {
              resolve({ done: true, value: undefined });
              return;
            }
            this.messageResolvers.push(resolve);
          }
        );

        if (result.done) {
          break;
        }
        yield result.value;
      }
    }
  }
}

/**
 * Receive messages via NostrMQ
 *
 * @param opts - Receive options containing callback and configuration
 * @returns SubscriptionHandle for managing the subscription
 */
export function receive(opts: ReceiveOpts): SubscriptionHandle {
  // 1. Load and validate configuration
  const config = loadConfig();

  // Override config with provided privkey if specified
  if (opts.privkey) {
    // Validate private key format (64 hex characters)
    if (!/^[a-fA-F0-9]{64}$/.test(opts.privkey)) {
      throw new Error("privkey must be a 64-character hex string");
    }
    config.privkey = opts.privkey;
    config.pubkey = getPublicKey(hexToBytes(opts.privkey));
  }

  // Merge configuration with options
  const relays = opts.relays || config.relays;

  // Validate required parameters
  if (!opts.onMessage) {
    throw new Error("onMessage callback is required");
  }

  if (typeof opts.onMessage !== "function") {
    throw new Error("onMessage must be a function");
  }

  // 2. Create RelayPool and generate subscription ID
  const relayPool = createRelayPool(config);
  const subscriptionId = generateUniqueId();
  const handle = new SubscriptionHandleImpl(subscriptionId, relayPool);

  // 3. Set up event handlers for processing messages
  relayPool.on(
    "event",
    async (url: string, subId: string, event: NostrEvent) => {
      if (subId !== subscriptionId) return;

      try {
        // Process the received event
        const messageData = await processEvent(event, config);
        if (messageData) {
          // Call the onMessage callback
          try {
            await opts.onMessage(
              messageData.payload,
              messageData.sender,
              messageData.rawEvent
            );
          } catch (error) {
            console.error("Error in onMessage callback:", error);
          }

          // Add to async iterator queue
          handle.addMessage(messageData);

          // Handle auto-acknowledgment if enabled
          if (opts.autoAck) {
            // TODO: Implement auto-acknowledgment in future stage
            console.log(
              "Auto-acknowledgment requested but not yet implemented"
            );
          }
        }
      } catch (error) {
        console.error(`Failed to process event from ${url}:`, error);
      }
    }
  );

  // Handle relay connection events
  relayPool.on("relay:connected", (url: string) => {
    console.log(`Connected to relay: ${url}`);
  });

  relayPool.on("relay:disconnected", (url: string, error?: Error) => {
    console.warn(`Disconnected from relay ${url}:`, error?.message);
  });

  relayPool.on("relay:error", (url: string, error: Error) => {
    console.error(`Relay error from ${url}:`, error.message);
  });

  // 4. Connect to relays and subscribe
  relayPool
    .connect()
    .then(() => {
      // Subscribe to kind 30072 events targeting the user's pubkey
      const filter = {
        kinds: [30072],
        "#p": [config.pubkey],
      };

      relayPool.subscribe(subscriptionId, [filter], relays);
      console.log(`Subscribed to messages for pubkey: ${config.pubkey}`);
    })
    .catch((error) => {
      console.error("Failed to connect to relays:", error);
      handle.close();
    });

  return handle;
}

/**
 * Process a received event and extract message data
 */
async function processEvent(
  event: NostrEvent,
  config: NostrMQConfig
): Promise<MessageData | null> {
  try {
    // 1. Validate event structure
    if (event.kind !== 30072) {
      return null; // Not a NostrMQ message
    }

    // Check if event targets our pubkey
    const pTags = event.tags.filter((tag) => tag[0] === "p");
    const targetsUs = pTags.some((tag) => tag[1] === config.pubkey);
    if (!targetsUs) {
      return null; // Not targeting us
    }

    // 2. Decrypt the content using NIP-04
    let decryptedContent: string;
    try {
      decryptedContent = await nip04.decrypt(
        config.privkey,
        event.pubkey,
        event.content
      );
    } catch (error) {
      console.warn(`Failed to decrypt message from ${event.pubkey}:`, error);
      return null; // Skip undecryptable events
    }

    // 3. Parse the decrypted JSON payload
    let encryptedPayload: EncryptedPayload;
    try {
      const parsed = safeJsonParse(decryptedContent);
      encryptedPayload = parsed as EncryptedPayload;
    } catch (error) {
      console.warn(
        `Failed to parse decrypted content from ${event.pubkey}:`,
        error
      );
      return null; // Skip invalid JSON
    }

    // 4. Validate payload structure
    if (!encryptedPayload || typeof encryptedPayload !== "object") {
      console.warn(`Invalid payload structure from ${event.pubkey}`);
      return null;
    }

    if (
      !encryptedPayload.target ||
      !encryptedPayload.response ||
      encryptedPayload.payload === undefined
    ) {
      console.warn(`Missing required fields in payload from ${event.pubkey}`);
      return null;
    }

    // 5. Verify that the target matches our pubkey
    if (encryptedPayload.target !== config.pubkey) {
      console.warn(
        `Target mismatch: expected ${config.pubkey}, got ${encryptedPayload.target}`
      );
      return null;
    }

    // 6. Validate pubkey formats
    if (
      !isValidPubkey(encryptedPayload.target) ||
      !isValidPubkey(encryptedPayload.response)
    ) {
      console.warn(`Invalid pubkey format in payload from ${event.pubkey}`);
      return null;
    }

    // 7. Return processed message data
    return {
      payload: encryptedPayload.payload,
      sender: event.pubkey,
      rawEvent: event,
    };
  } catch (error) {
    console.error(
      `Unexpected error processing event from ${event.pubkey}:`,
      error
    );
    return null;
  }
}
