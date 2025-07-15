import { Event as NostrEvent, EventTemplate } from "nostr-tools";
import type { WebSocket } from "ws";

/**
 * Options for sending a message via nostrMQ
 */
export interface SendOpts {
  /** Data to transmit (JSON-serializable) */
  payload: unknown;
  /** Hex pubkey of recipient */
  target: string;
  /** Where the reply should go (default = sender) */
  response?: string;
  /** Override default relays */
  relays?: string[];
  /** PoW mining: false = none, true = env bits, number = explicit bits */
  pow?: boolean | number;
  /** Timeout in milliseconds (default 2000) */
  timeoutMs?: number;
}

/**
 * Options for receiving messages via nostrMQ
 */
export interface ReceiveOpts {
  /** Callback for incoming messages */
  onMessage: (
    payload: unknown,
    sender: string,
    rawEvent: NostrEvent
  ) => void | Promise<void>;
  /** Override default relays */
  relays?: string[];
  /** Auto-reply "OK" back to sender */
  autoAck?: boolean;
  /** Override default private key */
  privkey?: string;
  /** PoW mining: false = none, true = env bits, number = explicit bits */
  pow?: boolean | number;
}

/**
 * Handle for managing subscriptions
 */
export interface SubscriptionHandle {
  /** Close the subscription */
  close(): void;
  /** Async iterator for messages */
  [Symbol.asyncIterator](): AsyncIterableIterator<{
    payload: unknown;
    sender: string;
    rawEvent: NostrEvent;
  }>;
}

/**
 * Configuration loaded from environment variables
 */
export interface NostrMQConfig {
  /** Private key for signing events */
  privkey: string;
  /** Public key derived from private key */
  pubkey: string;
  /** List of relay URLs */
  relays: string[];
  /** PoW difficulty in bits (0 = disabled) */
  powDifficulty: number;
  /** Number of worker threads for PoW mining */
  powThreads: number;
  /** Optional tracking configuration */
  tracking?: TrackingConfig;
}

/**
 * Encrypted payload structure
 */
export interface EncryptedPayload {
  /** Target recipient pubkey */
  target: string;
  /** Response destination pubkey */
  response: string;
  /** Actual message payload */
  payload: unknown;
}

/**
 * Relay connection state
 */
export interface RelayConnection {
  /** WebSocket URL */
  url: string;
  /** WebSocket instance */
  ws: WebSocket | null;
  /** Connection state */
  state: "connecting" | "connected" | "disconnected" | "error";
  /** Last error if any */
  lastError?: Error;
  /** Reconnection attempts */
  reconnectAttempts: number;
}

/**
 * Relay message types
 */
export type RelayMessage =
  | ["EVENT", string, NostrEvent]
  | ["OK", string, boolean, string]
  | ["EOSE", string]
  | ["CLOSED", string, string]
  | ["NOTICE", string];

/**
 * Event template with optional PoW nonce
 */
export interface EventTemplateWithPow extends EventTemplate {
  /** Event ID after PoW mining */
  id?: string;
}

/**
 * PoW mining result
 */
export interface PowResult {
  /** Mined event template */
  event: EventTemplateWithPow;
  /** Number of iterations performed */
  iterations: number;
  /** Time taken in milliseconds */
  timeMs: number;
}

/**
 * Worker thread data for PoW mining
 */
export interface PowWorkerData {
  /** Event template to mine */
  evt: EventTemplate;
  /** Target difficulty in bits */
  bits: number;
  /** Starting nonce offset */
  offset: number;
  /** Nonce increment stride */
  stride: number;
}

/**
 * Received message data structure
 */
export interface ReceivedMessage {
  /** The decrypted message payload */
  payload: unknown;
  /** Hex pubkey of the message sender */
  sender: string;
  /** The raw Nostr event that contained the message */
  rawEvent: NostrEvent;
}

/**
 * Configuration for message tracking to prevent replay attacks
 */
export interface TrackingConfig {
  /** How far back to look for messages in seconds (default: 3600) */
  oldestMqSeconds: number;
  /** Maximum number of recent event IDs to track in memory (default: 100) */
  trackLimit: number;
  /** Directory for persistent cache storage (default: ".nostrmq") */
  cacheDir: string;
  /** Whether to enable persistent caching to disk (default: true) */
  enablePersistence: boolean;
}

/**
 * Structure for timestamp cache file
 */
export interface TimestampCache {
  /** Last processed timestamp in seconds since epoch */
  lastProcessed: number;
  /** When this cache was last updated */
  updatedAt: number;
}

/**
 * Structure for event ID snapshot cache file
 */
export interface SnapshotCache {
  /** Array of recently processed event IDs */
  eventIds: string[];
  /** When this snapshot was created */
  createdAt: number;
  /** Number of events in this snapshot */
  count: number;
}
