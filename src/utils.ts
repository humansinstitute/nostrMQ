import { getPublicKey } from "nostr-tools";
import { promises as fs } from "fs";
import { join } from "path";
import type {
  NostrMQConfig,
  TrackingConfig,
  TimestampCache,
  SnapshotCache,
} from "./types.js";

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
 
  const relaysEnv = process.env.NOSTR_RELAYS;
  if (!relaysEnv) {
    throw new Error("NOSTR_RELAYS environment variable is required");
  }
  const relays = relaysEnv
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (relays.length === 0) {
    throw new Error("NOSTR_RELAYS must contain at least one relay URL");
  }
 
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

/**
 * Ensure cache directory exists, creating it if necessary
 * Gracefully handles errors and returns success status
 */
export async function ensureCacheDir(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true });
    return true;
  } catch (error) {
    console.warn(`Failed to create cache directory ${dir}:`, error);
    return false;
  }
}

/**
 * Save timestamp to cache file
 * Gracefully handles errors and returns success status
 */
export async function saveTimestamp(dir: string, timestamp: number): Promise<boolean> {
  try {
    const timestampFile = join(dir, "timestamp.json");
    const cache: TimestampCache = {
      lastProcessed: timestamp,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    await fs.writeFile(timestampFile, JSON.stringify(cache, null, 2));
    return true;
  } catch (error) {
    console.warn(`Failed to save timestamp to ${dir}:`, error);
    return false;
  }
}

/**
 * Load timestamp from cache file with fallback
 * Returns the timestamp or null if unable to load
 */
export async function loadTimestamp(dir: string): Promise<number | null> {
  try {
    const timestampFile = join(dir, "timestamp.json");
    const content = await fs.readFile(timestampFile, "utf-8");
    const cache: TimestampCache = JSON.parse(content);
    
    // Validate cache structure
    if (typeof cache.lastProcessed === "number" && cache.lastProcessed > 0) {
      return cache.lastProcessed;
    }
    return null;
  } catch (error) {
    // File doesn't exist or is invalid - this is expected on first run
    return null;
  }
}

/**
 * Save event IDs snapshot to cache file
 * Gracefully handles errors and returns success status
 */
export async function saveSnapshot(dir: string, eventIds: string[]): Promise<boolean> {
  try {
    const snapshotFile = join(dir, "snapshot.json");
    const cache: SnapshotCache = {
      eventIds: [...eventIds],
      createdAt: Math.floor(Date.now() / 1000),
      count: eventIds.length,
    };
    await fs.writeFile(snapshotFile, JSON.stringify(cache, null, 2));
    return true;
  } catch (error) {
    console.warn(`Failed to save snapshot to ${dir}:`, error);
    return false;
  }
}

/**
 * Load event IDs snapshot from cache file
 * Returns the event IDs array or empty array if unable to load
 */
export async function loadSnapshot(dir: string): Promise<string[]> {
  try {
    const snapshotFile = join(dir, "snapshot.json");
    const content = await fs.readFile(snapshotFile, "utf-8");
    const cache: SnapshotCache = JSON.parse(content);
    
    // Validate cache structure
    if (Array.isArray(cache.eventIds)) {
      return cache.eventIds;
    }
    return [];
  } catch (error) {
    // File doesn't exist or is invalid - this is expected on first run
    return [];
  }
}

/**
 * Load tracking configuration from environment variables
 * Returns configuration with sensible defaults
 */
export function getTrackingConfig(): TrackingConfig {
  const oldestMqSeconds = parseInt(process.env.NOSTRMQ_OLDEST_MQ || "3600", 10);
  const trackLimit = parseInt(process.env.NOSTRMQ_TRACK_LIMIT || "100", 10);
  const cacheDir = process.env.NOSTRMQ_CACHE_DIR || ".nostrmq";
  const enablePersistence = process.env.NOSTRMQ_DISABLE_PERSISTENCE !== "true";

  return {
    oldestMqSeconds: Math.max(60, oldestMqSeconds), // Minimum 1 minute
    trackLimit: Math.max(10, Math.min(1000, trackLimit)), // Between 10-1000
    cacheDir,
    enablePersistence,
  };
}
