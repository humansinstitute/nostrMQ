import { getEventHash } from "nostr-tools";
import type { EventTemplate } from "nostr-tools";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import type { PowResult, PowWorkerData } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Count the number of leading zero bits in a hex string
 */
function countLeadingZeroBits(hex: string): number {
  let count = 0;
  for (let i = 0; i < hex.length; i++) {
    const char = hex[i];
    const value = parseInt(char, 16);

    if (value === 0) {
      count += 4;
    } else {
      // Count leading zeros in the nibble
      if (value < 8) count += 1;
      if (value < 4) count += 1;
      if (value < 2) count += 1;
      break;
    }
  }
  return count;
}

/**
 * Validate that an event ID has the required number of leading zero bits
 */
export function validatePowDifficulty(eventId: string, bits: number): boolean {
  if (bits <= 0) return true;
  return countLeadingZeroBits(eventId) >= bits;
}

/**
 * Single-threaded PoW mining implementation
 */
function mineSingleThreaded(
  evt: EventTemplate & { pubkey: string },
  bits: number
): PowResult {
  const startTime = Date.now();
  let nonce = 0;
  let iterations = 0;

  while (true) {
    iterations++;

    // Create event with nonce tag
    const eventWithNonce = {
      ...evt,
      tags: [...evt.tags, ["nonce", nonce.toString(), bits.toString()]],
    };

    // Calculate event hash
    const eventId = getEventHash(eventWithNonce);

    // Check if we've achieved the target difficulty
    if (validatePowDifficulty(eventId, bits)) {
      const timeMs = Date.now() - startTime;
      return {
        event: { ...eventWithNonce, id: eventId },
        iterations,
        timeMs,
      };
    }

    nonce++;

    // Prevent infinite loops in case of very high difficulty
    if (iterations % 100000 === 0) {
      console.log(
        `PoW mining progress: ${iterations} iterations, current nonce: ${nonce}`
      );
    }
  }
}

/**
 * Multi-threaded PoW mining using worker threads
 */
async function mineMultiThreaded(
  evt: EventTemplate & { pubkey: string },
  bits: number,
  threads: number
): Promise<PowResult> {
  return new Promise((resolve, reject) => {
    const workers: Worker[] = [];
    const startTime = Date.now();
    let resolved = false;

    // Create worker threads
    for (let i = 0; i < threads; i++) {
      const workerData: PowWorkerData = {
        evt,
        bits,
        offset: i,
        stride: threads,
      };

      const worker = new Worker(join(__dirname, "pow.worker.js"), {
        workerData,
      });

      worker.on("message", (result: PowResult) => {
        if (!resolved) {
          resolved = true;

          // Terminate all workers
          workers.forEach((w) => w.terminate());

          // Update timing
          result.timeMs = Date.now() - startTime;
          resolve(result);
        }
      });

      worker.on("error", (error) => {
        if (!resolved) {
          resolved = true;
          workers.forEach((w) => w.terminate());
          reject(new Error(`Worker error: ${error.message}`));
        }
      });

      workers.push(worker);
    }

    // Set a reasonable timeout for very high difficulties
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        workers.forEach((w) => w.terminate());
        reject(new Error("PoW mining timeout - difficulty may be too high"));
      }
    }, 300000); // 5 minutes timeout

    // Clear timeout if resolved
    const originalResolve = resolve;
    resolve = (result) => {
      clearTimeout(timeout);
      originalResolve(result);
    };
  });
}

/**
 * Mine proof-of-work for an event template
 *
 * @param evt - Event template to mine
 * @param bits - Target difficulty in leading zero bits
 * @param threads - Number of worker threads (default: 1 for single-threaded)
 * @returns Promise resolving to event template with nonce tag
 */
export async function mineEventPow(
  evt: EventTemplate & { pubkey: string },
  bits: number,
  threads = 1
): Promise<EventTemplate & { pubkey: string }> {
  // Validate inputs
  if (bits < 0) {
    throw new Error("Difficulty bits must be non-negative");
  }

  if (bits === 0) {
    // No PoW required, return original event
    return evt;
  }

  if (threads < 1) {
    throw new Error("Thread count must be at least 1");
  }

  console.log(
    `Starting PoW mining: ${bits} bits difficulty, ${threads} thread(s)`
  );

  let result: PowResult;

  if (threads === 1) {
    // Use single-threaded mining
    result = mineSingleThreaded(evt, bits);
  } else {
    // Use multi-threaded mining
    result = await mineMultiThreaded(evt, bits, threads);
  }

  console.log(
    `PoW mining completed: ${result.iterations} iterations in ${result.timeMs}ms ` +
      `(${Math.round(
        result.iterations / (result.timeMs / 1000)
      )} iterations/sec)`
  );

  return result.event as EventTemplate & { pubkey: string };
}

/**
 * Check if an event has a valid nonce tag for the specified difficulty
 */
export function hasValidPow(
  evt: EventTemplate | { tags: string[][]; id?: string },
  bits: number
): boolean {
  if (bits <= 0) return true;

  // Find nonce tag
  const nonceTag = evt.tags.find((tag) => tag[0] === "nonce");
  if (!nonceTag || nonceTag.length < 3) {
    return false;
  }

  const declaredBits = parseInt(nonceTag[2], 10);
  if (isNaN(declaredBits) || declaredBits < bits) {
    return false;
  }

  // If event has an ID, validate it directly
  if ("id" in evt && evt.id) {
    return validatePowDifficulty(evt.id, bits);
  }

  // Otherwise, calculate the hash
  const eventId = getEventHash(evt as EventTemplate & { pubkey: string });
  return validatePowDifficulty(eventId, bits);
}
