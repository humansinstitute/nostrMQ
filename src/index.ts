/**
 * NostrMQ - Encrypted RPC messaging over Nostr
 *
 * A minimal Node.js library for secure, encrypted message passing using the Nostr protocol.
 * Supports proof-of-work mining, relay pool management, and async message handling.
 *
 * @example Basic Usage
 * ```typescript
 * import { send, receive } from 'nostrmq';
 *
 * // Send a message
 * const eventId = await send({
 *   target: 'target_pubkey_hex',
 *   payload: { message: 'Hello!' }
 * });
 *
 * // Receive messages
 * const subscription = receive({
 *   onMessage: (payload, sender, rawEvent) => {
 *     console.log('Received:', payload, 'from:', sender);
 *   }
 * });
 *
 * // Clean up when done
 * subscription.close();
 * ```
 *
 * @example With Proof-of-Work
 * ```typescript
 * import { send, mineEventPow } from 'nostrmq';
 *
 * // Send with PoW mining (8 bits difficulty)
 * const eventId = await send({
 *   target: 'target_pubkey_hex',
 *   payload: { message: 'Important message!' },
 *   pow: 8
 * });
 * ```
 *
 * @example Environment Configuration
 * Set these environment variables:
 * - `NOSTRMQ_PRIVKEY`: Your private key (hex)
 * - `NOSTRMQ_RELAYS`: Comma-separated relay URLs
 * - `NOSTRMQ_POW_DIFFICULTY`: Default PoW bits (optional)
 * - `NOSTRMQ_POW_THREADS`: Worker threads for PoW (optional)
 *
 * @since 1.0.0
 */

/**
 * Send an encrypted message via NostrMQ
 *
 * Encrypts and publishes a message to the specified recipient using NIP-04 encryption
 * and Nostr kind 30072 events. Supports optional proof-of-work mining for spam prevention.
 *
 * @param opts - Send options containing payload, target, and configuration
 * @param opts.payload - Data to transmit (must be JSON-serializable)
 * @param opts.target - Hex-encoded public key of the recipient
 * @param opts.response - Where replies should go (defaults to sender's pubkey)
 * @param opts.relays - Override default relay URLs
 * @param opts.pow - PoW mining: false=none, true=use env config, number=explicit bits
 * @param opts.timeoutMs - Connection/publish timeout in milliseconds (default: 2000)
 * @returns Promise resolving to the event ID of the published message
 *
 * @throws {Error} When payload is missing or invalid
 * @throws {Error} When target pubkey is missing or invalid format
 * @throws {Error} When encryption fails
 * @throws {Error} When PoW mining fails or times out
 * @throws {Error} When publishing to relays fails
 *
 * @example Simple message
 * ```typescript
 * const eventId = await send({
 *   target: '02a1b2c3d4e5f6...',
 *   payload: { type: 'greeting', message: 'Hello!' }
 * });
 * ```
 *
 * @example With proof-of-work
 * ```typescript
 * const eventId = await send({
 *   target: '02a1b2c3d4e5f6...',
 *   payload: { urgent: true, data: 'Important!' },
 *   pow: 12 // 12 bits difficulty
 * });
 * ```
 *
 * @since 1.0.0
 */
export { send } from "./send.js";

/**
 * Receive encrypted messages via NostrMQ
 *
 * Subscribes to incoming messages targeting your public key. Automatically decrypts
 * NIP-04 encrypted content and provides both callback and async iterator interfaces.
 *
 * @param opts - Receive options containing callback and configuration
 * @param opts.onMessage - Callback function for incoming messages
 * @param opts.relays - Override default relay URLs
 * @param opts.autoAck - Automatically reply "OK" to sender (not yet implemented)
 * @returns SubscriptionHandle for managing the subscription and async iteration
 *
 * @throws {Error} When onMessage callback is missing or not a function
 * @throws {Error} When relay connection fails
 *
 * @example Callback interface
 * ```typescript
 * const subscription = receive({
 *   onMessage: async (payload, sender, rawEvent) => {
 *     console.log('Message from', sender, ':', payload);
 *     // Process the message...
 *   }
 * });
 *
 * // Stop receiving
 * subscription.close();
 * ```
 *
 * @example Async iterator interface
 * ```typescript
 * const subscription = receive({
 *   onMessage: () => {} // Still required but can be empty
 * });
 *
 * for await (const { payload, sender, rawEvent } of subscription) {
 *   console.log('Received:', payload, 'from:', sender);
 *   if (shouldStop) break;
 * }
 *
 * subscription.close();
 * ```
 *
 * @since 1.0.0
 */
export { receive } from "./receive.js";

/**
 * Mine proof-of-work for an event template
 *
 * Performs computational work to find a nonce that makes the event ID have the
 * specified number of leading zero bits. Supports both single-threaded and
 * multi-threaded mining using worker threads.
 *
 * @param evt - Event template to mine (must include pubkey)
 * @param bits - Target difficulty in leading zero bits (0 = no PoW)
 * @param threads - Number of worker threads (default: 1 for single-threaded)
 * @returns Promise resolving to event template with nonce tag added
 *
 * @throws {Error} When difficulty bits is negative
 * @throws {Error} When thread count is less than 1
 * @throws {Error} When mining times out (5 minute limit)
 * @throws {Error} When worker thread encounters an error
 *
 * @example Single-threaded mining
 * ```typescript
 * const minedEvent = await mineEventPow(eventTemplate, 8);
 * console.log('Mined with nonce:', minedEvent.tags.find(t => t[0] === 'nonce'));
 * ```
 *
 * @example Multi-threaded mining
 * ```typescript
 * const minedEvent = await mineEventPow(eventTemplate, 12, 4);
 * // Uses 4 worker threads for faster mining
 * ```
 *
 * @since 1.0.0
 */
export { mineEventPow } from "./pow.js";

/**
 * Validate that an event ID meets the required proof-of-work difficulty
 *
 * Counts the number of leading zero bits in the event ID and compares
 * against the required difficulty threshold.
 *
 * @param eventId - Hex-encoded event ID to validate
 * @param bits - Required number of leading zero bits
 * @returns True if the event ID has sufficient leading zero bits
 *
 * @example
 * ```typescript
 * const isValid = validatePowDifficulty('000abc123...', 12);
 * console.log('Has 12+ leading zero bits:', isValid);
 * ```
 *
 * @since 1.0.0
 */
export { validatePowDifficulty } from "./pow.js";

/**
 * Check if an event has a valid nonce tag for the specified difficulty
 *
 * Examines the event's nonce tag and validates that the event ID meets
 * the declared proof-of-work difficulty. More comprehensive than validatePowDifficulty
 * as it also checks the nonce tag structure.
 *
 * @param evt - Event template or event with tags and optional ID
 * @param bits - Required difficulty in leading zero bits
 * @returns True if the event has a valid nonce tag and meets difficulty
 *
 * @example
 * ```typescript
 * const hasValidPoW = hasValidPow(signedEvent, 8);
 * if (hasValidPoW) {
 *   console.log('Event has valid 8-bit proof-of-work');
 * }
 * ```
 *
 * @since 1.0.0
 */
export { hasValidPow } from "./pow.js";

/**
 * Load NostrMQ configuration from environment variables
 *
 * Reads and validates configuration from environment variables with sensible defaults.
 * Derives the public key from the private key and validates relay URLs.
 *
 * @returns Configuration object with all required settings
 *
 * @throws {Error} When NOSTRMQ_PRIVKEY is missing or invalid
 * @throws {Error} When NOSTRMQ_RELAYS is missing or contains invalid URLs
 *
 * @example
 * ```typescript
 * // Set environment variables first:
 * // NOSTRMQ_PRIVKEY=abc123...
 * // NOSTRMQ_RELAYS=wss://relay1.com,wss://relay2.com
 *
 * const config = loadConfig();
 * console.log('Using pubkey:', config.pubkey);
 * console.log('Connected to relays:', config.relays);
 * ```
 *
 * Environment variables:
 * - `NOSTRMQ_PRIVKEY` (required): Your private key in hex format
 * - `NOSTRMQ_RELAYS` (required): Comma-separated list of relay WebSocket URLs
 * - `NOSTRMQ_POW_DIFFICULTY` (optional): Default PoW difficulty in bits (default: 0)
 * - `NOSTRMQ_POW_THREADS` (optional): Number of worker threads for PoW (default: 1)
 *
 * @since 1.0.0
 */
export { loadConfig } from "./utils.js";

/**
 * Advanced relay pool management and utility functions
 *
 * These exports provide lower-level access to relay management and utility functions
 * for advanced use cases. Most users should use the high-level send() and receive() functions.
 */

/**
 * RelayPool class for managing multiple relay connections
 * @since 1.0.0
 */
export { RelayPool } from "./relayPool.js";

/**
 * Create a new RelayPool instance with the given configuration
 * @since 1.0.0
 */
export { createRelayPool } from "./relayPool.js";

/**
 * Generate a unique identifier for messages and subscriptions
 * @since 1.0.0
 */
export { generateUniqueId } from "./utils.js";

/**
 * Validate that a string is a valid hex-encoded public key
 * @since 1.0.0
 */
export { isValidPubkey } from "./utils.js";

/**
 * Validate that a string is a valid WebSocket relay URL
 * @since 1.0.0
 */
export { isValidRelayUrl } from "./utils.js";

// Export TypeScript types for library consumers
export type {
  /**
   * Options for sending a message via NostrMQ
   * @since 1.0.0
   */
  SendOpts,

  /**
   * Options for receiving messages via NostrMQ
   * @since 1.0.0
   */
  ReceiveOpts,

  /**
   * Handle for managing message subscriptions
   * @since 1.0.0
   */
  SubscriptionHandle,

  /**
   * NostrMQ configuration loaded from environment variables
   * @since 1.0.0
   */
  NostrMQConfig,

  /**
   * Structure of received message data
   * @since 1.0.0
   */
  ReceivedMessage,

  /**
   * Internal encrypted payload structure
   * @since 1.0.0
   */
  EncryptedPayload,

  /**
   * Relay connection state information
   * @since 1.0.0
   */
  RelayConnection,

  /**
   * Relay message types for WebSocket communication
   * @since 1.0.0
   */
  RelayMessage,

  /**
   * Event template with optional PoW nonce
   * @since 1.0.0
   */
  EventTemplateWithPow,

  /**
   * Result of proof-of-work mining operation
   * @since 1.0.0
   */
  PowResult,

  /**
   * Worker thread data for PoW mining
   * @since 1.0.0
   */
  PowWorkerData,
} from "./types.js";
