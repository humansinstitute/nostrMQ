import { getPublicKey } from "nostr-tools";
import type { NostrMQConfig } from "./types.js";

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
 * Load configuration from environment variables
 */
export function loadConfig(): NostrMQConfig {
  const privkey = process.env.NOSTR_PRIVKEY;
  if (!privkey) {
    throw new Error("NOSTR_PRIVKEY environment variable is required");
  }

  // Validate private key format (64 hex characters)
  if (!/^[a-fA-F0-9]{64}$/.test(privkey)) {
    throw new Error("NOSTR_PRIVKEY must be a 64-character hex string");
  }

  const pubkey = getPublicKey(hexToBytes(privkey));

  const relaysEnv =
    process.env.NOSTR_RELAYS || "wss://relay.damus.io,wss://relay.snort.social";
  const relays = relaysEnv
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  const powDifficulty = parseInt(process.env.NOSTR_POW_DIFFICULTY || "0", 10);
  const powThreads = parseInt(process.env.NOSTR_POW_THREADS || "4", 10);

  return {
    privkey,
    pubkey,
    relays,
    powDifficulty: Math.max(0, powDifficulty),
    powThreads: Math.max(1, powThreads),
  };
}

/**
 * Generate a unique identifier for replaceable events
 */
export function generateUniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Validate a hex string
 */
export function isValidHex(str: string, expectedLength?: number): boolean {
  if (typeof str !== "string") return false;
  if (expectedLength && str.length !== expectedLength) return false;
  return /^[a-fA-F0-9]+$/.test(str);
}

/**
 * Validate a pubkey (64 hex characters)
 */
export function isValidPubkey(pubkey: string): boolean {
  return isValidHex(pubkey, 64);
}

/**
 * Validate a relay URL
 */
export function isValidRelayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a promise that rejects after a timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Retry an operation with exponential backoff
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts) {
        throw lastError;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Safely parse JSON with error handling
 */
export function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    throw new Error("Invalid JSON format");
  }
}

/**
 * Safely stringify JSON with error handling
 */
export function safeJsonStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    throw new Error("Unable to serialize object to JSON");
  }
}
