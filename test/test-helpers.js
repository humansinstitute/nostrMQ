import { promises as fs } from "fs";
import { join } from "path";

/**
 * Test helper utilities for NostrMQ tracking tests
 */

// Common test constants
export const TEST_CONSTANTS = {
  PRIVKEY: "a".repeat(64),
  PUBKEY: "b".repeat(64),
  SENDER_PUBKEY: "c".repeat(64),
  TEST_CACHE_DIR: ".test-cache",
  INVALID_CACHE_DIR: "/invalid/path/that/cannot/be/created",
};

// Environment management
export class TestEnvironment {
  constructor() {
    this.originalEnv = { ...process.env };
  }

  setTrackingEnv(overrides = {}) {
    process.env.NOSTRMQ_OLDEST_MQ = overrides.oldestMq || "3600";
    process.env.NOSTRMQ_TRACK_LIMIT = overrides.trackLimit || "100";
    process.env.NOSTRMQ_CACHE_DIR = overrides.cacheDir || ".nostrmq";
    process.env.NOSTRMQ_DISABLE_PERSISTENCE =
      overrides.disablePersistence || "false";
  }

  setNostrEnv(overrides = {}) {
    process.env.NOSTR_PRIVKEY = overrides.privkey || TEST_CONSTANTS.PRIVKEY;
    process.env.NOSTR_RELAYS = overrides.relays || "wss://test-relay.com";
    process.env.NOSTR_POW_DIFFICULTY = overrides.powDifficulty || "0";
    process.env.NOSTR_POW_THREADS = overrides.powThreads || "4";
  }

  restore() {
    process.env = { ...this.originalEnv };
  }
}

// Cache management
export class TestCacheManager {
  constructor(cacheDir = TEST_CONSTANTS.TEST_CACHE_DIR) {
    this.cacheDir = cacheDir;
  }

  async cleanup() {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async createTimestampCache(
    lastProcessed,
    updatedAt = Math.floor(Date.now() / 1000)
  ) {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const timestampFile = join(this.cacheDir, "timestamp.json");
    const cache = {
      lastProcessed,
      updatedAt,
    };
    await fs.writeFile(timestampFile, JSON.stringify(cache, null, 2));
    return cache;
  }

  async createSnapshotCache(
    eventIds,
    createdAt = Math.floor(Date.now() / 1000)
  ) {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const snapshotFile = join(this.cacheDir, "snapshot.json");
    const cache = {
      eventIds: [...eventIds],
      createdAt,
      count: eventIds.length,
    };
    await fs.writeFile(snapshotFile, JSON.stringify(cache, null, 2));
    return cache;
  }

  async createCorruptedTimestampCache() {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const timestampFile = join(this.cacheDir, "timestamp.json");
    await fs.writeFile(timestampFile, "invalid json");
  }

  async createCorruptedSnapshotCache() {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const snapshotFile = join(this.cacheDir, "snapshot.json");
    await fs.writeFile(snapshotFile, "invalid json");
  }

  async createInvalidTimestampCache() {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const timestampFile = join(this.cacheDir, "timestamp.json");
    const invalidCache = {
      lastProcessed: "not a number",
      updatedAt: Math.floor(Date.now() / 1000),
    };
    await fs.writeFile(timestampFile, JSON.stringify(invalidCache));
  }

  async createInvalidSnapshotCache() {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const snapshotFile = join(this.cacheDir, "snapshot.json");
    const invalidCache = {
      eventIds: "not an array",
      createdAt: Math.floor(Date.now() / 1000),
      count: 0,
    };
    await fs.writeFile(snapshotFile, JSON.stringify(invalidCache));
  }
}

// Mock data generators
export class MockDataGenerator {
  static createNostrEvent(overrides = {}) {
    const timestamp = overrides.timestamp || Math.floor(Date.now() / 1000);
    const id =
      overrides.id ||
      `event_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      id,
      kind: overrides.kind || 30072,
      pubkey: overrides.pubkey || TEST_CONSTANTS.SENDER_PUBKEY,
      created_at: timestamp,
      content: overrides.content || this.createValidEncryptedPayload(),
      tags: overrides.tags || [["p", TEST_CONSTANTS.PUBKEY]],
      sig: overrides.sig || "mock_signature",
    };
  }

  static createValidEncryptedPayload(payload = { message: "test message" }) {
    return JSON.stringify({
      target: TEST_CONSTANTS.PUBKEY,
      response: TEST_CONSTANTS.SENDER_PUBKEY,
      payload,
    });
  }

  static createInvalidEncryptedPayload() {
    return "invalid json content";
  }

  static createEventBatch(
    count,
    baseTimestamp = Math.floor(Date.now() / 1000)
  ) {
    return Array.from({ length: count }, (_, i) =>
      this.createNostrEvent({
        id: `batch_event_${i}`,
        timestamp: baseTimestamp + i,
        content: this.createValidEncryptedPayload({
          message: `batch message ${i}`,
        }),
      })
    );
  }

  static createOldEvent(ageInSeconds = 7200) {
    const oldTimestamp = Math.floor(Date.now() / 1000) - ageInSeconds;
    return this.createNostrEvent({
      id: `old_event_${oldTimestamp}`,
      timestamp: oldTimestamp,
      content: this.createValidEncryptedPayload({ message: "old message" }),
    });
  }

  static createEventWithInvalidKind() {
    return this.createNostrEvent({
      kind: 1, // Wrong kind for NostrMQ
      content: this.createValidEncryptedPayload(),
    });
  }

  static createEventWithWrongTarget() {
    return this.createNostrEvent({
      content: JSON.stringify({
        target: "wrong_target_pubkey",
        response: TEST_CONSTANTS.SENDER_PUBKEY,
        payload: { message: "wrong target" },
      }),
    });
  }
}

// Performance testing utilities
export class PerformanceHelper {
  static async measureAsync(fn, iterations = 1) {
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await fn();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1000000); // Convert to milliseconds
    }

    return {
      times,
      average: times.reduce((a, b) => a + b, 0) / times.length,
      min: Math.min(...times),
      max: Math.max(...times),
      total: times.reduce((a, b) => a + b, 0),
    };
  }

  static async measureMemoryUsage(fn) {
    const before = process.memoryUsage();
    await fn();
    const after = process.memoryUsage();

    return {
      heapUsedDelta: after.heapUsed - before.heapUsed,
      heapTotalDelta: after.heapTotal - before.heapTotal,
      externalDelta: after.external - before.external,
      arrayBuffersDelta: after.arrayBuffers - before.arrayBuffers,
      before,
      after,
    };
  }

  static createLoadTest(operations, concurrency = 10) {
    return async () => {
      const batches = [];
      for (let i = 0; i < operations.length; i += concurrency) {
        const batch = operations.slice(i, i + concurrency);
        batches.push(batch);
      }

      const results = [];
      for (const batch of batches) {
        const batchResults = await Promise.allSettled(batch.map((op) => op()));
        results.push(...batchResults);
      }

      return results;
    };
  }
}

// Assertion helpers
export class AssertionHelpers {
  static assertTimestampRecent(timestamp, maxAgeSeconds = 10) {
    const now = Math.floor(Date.now() / 1000);
    const age = now - timestamp;
    if (age > maxAgeSeconds || age < 0) {
      throw new Error(
        `Timestamp ${timestamp} is not recent (age: ${age}s, max: ${maxAgeSeconds}s)`
      );
    }
  }

  static assertValidEventId(eventId) {
    if (typeof eventId !== "string" || eventId.length === 0) {
      throw new Error(`Invalid event ID: ${eventId}`);
    }
  }

  static assertValidTimestamp(timestamp) {
    if (
      typeof timestamp !== "number" ||
      timestamp <= 0 ||
      !Number.isInteger(timestamp)
    ) {
      throw new Error(`Invalid timestamp: ${timestamp}`);
    }
  }

  static assertArrayContainsOnly(
    array,
    predicate,
    message = "Array contains invalid items"
  ) {
    if (!Array.isArray(array)) {
      throw new Error("Expected an array");
    }

    for (let i = 0; i < array.length; i++) {
      if (!predicate(array[i], i)) {
        throw new Error(`${message} at index ${i}: ${array[i]}`);
      }
    }
  }

  static assertPerformanceWithinBounds(
    measurement,
    maxTimeMs,
    message = "Performance exceeded bounds"
  ) {
    if (measurement.average > maxTimeMs) {
      throw new Error(
        `${message}: average ${measurement.average}ms > ${maxTimeMs}ms`
      );
    }
    if (measurement.max > maxTimeMs * 2) {
      throw new Error(
        `${message}: max ${measurement.max}ms > ${maxTimeMs * 2}ms`
      );
    }
  }
}

// Test runner utilities
export class SimpleTestRunner {
  constructor() {
    this.tests = [];
    this.currentSuite = "";
    this.beforeEachFn = null;
    this.afterEachFn = null;
  }

  describe(name, fn) {
    this.currentSuite = name;
    fn();
  }

  it(name, fn) {
    this.tests.push({
      suite: this.currentSuite,
      name,
      fn,
    });
  }

  beforeEach(fn) {
    this.beforeEachFn = fn;
  }

  afterEach(fn) {
    this.afterEachFn = fn;
  }

  async run() {
    let passed = 0;
    let failed = 0;
    const failures = [];

    console.log(`Running ${this.tests.length} tests...\n`);

    for (const test of this.tests) {
      try {
        if (this.beforeEachFn) {
          await this.beforeEachFn();
        }

        await test.fn();

        if (this.afterEachFn) {
          await this.afterEachFn();
        }

        console.log(`✓ ${test.suite}: ${test.name}`);
        passed++;
      } catch (error) {
        console.log(`✗ ${test.suite}: ${test.name}`);
        console.log(`  Error: ${error.message}`);
        failures.push({ test, error });
        failed++;
      }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);

    if (failures.length > 0) {
      console.log("\nFailure details:");
      failures.forEach(({ test, error }, index) => {
        console.log(`\n${index + 1}. ${test.suite}: ${test.name}`);
        console.log(`   ${error.message}`);
        if (error.stack) {
          console.log(`   ${error.stack.split("\n").slice(1, 3).join("\n")}`);
        }
      });
    }

    return { passed, failed, failures };
  }
}

// Timeout utilities
export class TimeoutHelper {
  static withTimeout(promise, timeoutMs, errorMessage = "Operation timed out") {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      ),
    ]);
  }

  static delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async waitFor(condition, timeoutMs = 5000, intervalMs = 100) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (await condition()) {
        return true;
      }
      await this.delay(intervalMs);
    }

    throw new Error(`Condition not met within ${timeoutMs}ms`);
  }
}

// File system test utilities
export class FileSystemHelper {
  static async createReadOnlyDirectory(path) {
    await fs.mkdir(path, { recursive: true });
    await fs.chmod(path, 0o444); // Read-only
  }

  static async createFileConflict(path) {
    // Create a file where a directory should be
    await fs.writeFile(path, "file content");
  }

  static async getFileStats(path) {
    try {
      const stats = await fs.stat(path);
      return {
        exists: true,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message,
      };
    }
  }

  static async ensureCleanDirectory(path) {
    try {
      await fs.rm(path, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors
    }
    await fs.mkdir(path, { recursive: true });
  }
}

// Export all utilities
export {
  TEST_CONSTANTS,
  TestEnvironment,
  TestCacheManager,
  MockDataGenerator,
  PerformanceHelper,
  AssertionHelpers,
  SimpleTestRunner,
  TimeoutHelper,
  FileSystemHelper,
};
