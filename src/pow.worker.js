import { parentPort, workerData } from "worker_threads";
import { getEventHash } from "nostr-tools";

/**
 * Count the number of leading zero bits in a hex string
 */
function countLeadingZeroBits(hex) {
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
function validatePowDifficulty(eventId, bits) {
  if (bits <= 0) return true;
  return countLeadingZeroBits(eventId) >= bits;
}

/**
 * Worker thread PoW mining implementation
 */
function mineWorker() {
  const { evt, bits, offset, stride } = workerData;
  const startTime = Date.now();
  let nonce = offset;
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

      // Send result back to main thread
      parentPort.postMessage({
        event: { ...eventWithNonce, id: eventId },
        iterations,
        timeMs,
      });
      return;
    }

    // Increment nonce by stride to avoid collision with other workers
    nonce += stride;

    // Prevent infinite loops and provide progress updates
    if (iterations % 50000 === 0) {
      // Optional: could send progress updates to main thread
      // parentPort.postMessage({ type: 'progress', iterations, nonce });
    }
  }
}

// Handle worker termination gracefully
process.on("SIGTERM", () => {
  process.exit(0);
});

process.on("SIGINT", () => {
  process.exit(0);
});

// Start mining
if (parentPort) {
  try {
    mineWorker();
  } catch (error) {
    parentPort.postMessage({
      error: error.message,
    });
  }
} else {
  console.error("Worker must be run in a worker thread context");
  process.exit(1);
}
