import { test } from "node:test";
import assert from "node:assert";
import { promises as fs } from "fs";
import { createMessageTracker } from "../dist/messageTracker.js";
import {
  ensureCacheDir,
  saveTimestamp,
  loadTimestamp,
  getTrackingConfig,
} from "../dist/utils.js";

const TEST_CACHE_DIR = ".test-simple";

// Cleanup function
async function cleanup() {
  try {
    await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Set test environment
process.env.NOSTRMQ_OLDEST_MQ = "3600";
process.env.NOSTRMQ_TRACK_LIMIT = "10";
process.env.NOSTRMQ_CACHE_DIR = TEST_CACHE_DIR;
process.env.NOSTRMQ_DISABLE_PERSISTENCE = "false";

test("MessageTracker - Basic functionality", async (t) => {
  await cleanup();

  await t.test("should create MessageTracker instance", () => {
    const tracker = createMessageTracker();
    assert(tracker instanceof Object, "Should create an instance");

    const stats = tracker.getStats();
    assert(
      typeof stats.lastProcessed === "number",
      "Should have lastProcessed timestamp"
    );
    assert(
      typeof stats.recentEventsCount === "number",
      "Should have recentEventsCount"
    );
    assert(
      typeof stats.persistenceEnabled === "boolean",
      "Should have persistenceEnabled flag"
    );
  });

  await t.test("should initialize with custom config", () => {
    const customConfig = {
      trackLimit: 5,
      enablePersistence: false,
    };

    const tracker = createMessageTracker(customConfig);
    const stats = tracker.getStats();

    assert.strictEqual(
      stats.persistenceEnabled,
      false,
      "Should respect custom config"
    );
  });

  await t.test("should detect new vs processed events", async () => {
    const tracker = createMessageTracker({ cacheDir: TEST_CACHE_DIR });
    await tracker.initialize();

    const eventId = "test_event_123";
    const timestamp = Math.floor(Date.now() / 1000);

    // New event should not be processed
    assert.strictEqual(
      tracker.hasProcessed(eventId, timestamp),
      false,
      "New event should not be processed"
    );

    // Mark as processed
    await tracker.markProcessed(eventId, timestamp);

    // Now should be detected as processed
    assert.strictEqual(
      tracker.hasProcessed(eventId, timestamp),
      true,
      "Processed event should be detected"
    );
  });

  await t.test("should handle old events correctly", async () => {
    const tracker = createMessageTracker({ cacheDir: TEST_CACHE_DIR });
    await tracker.initialize();

    const oldTimestamp = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
    const oldEventId = "old_event_123";

    // Old events should be considered already processed
    assert.strictEqual(
      tracker.hasProcessed(oldEventId, oldTimestamp),
      true,
      "Old events should be considered processed"
    );
  });

  await t.test("should update subscription timestamp", async () => {
    const tracker = createMessageTracker({ cacheDir: TEST_CACHE_DIR });
    await tracker.initialize();

    const initialSince = tracker.getSubscriptionSince();
    assert(typeof initialSince === "number", "Should return numeric timestamp");

    const newTimestamp = Math.floor(Date.now() / 1000);
    await tracker.markProcessed("new_event", newTimestamp);

    const updatedSince = tracker.getSubscriptionSince();
    assert(
      updatedSince >= initialSince,
      "Should update subscription timestamp"
    );
  });

  await cleanup();
});

test("Utils - Tracking utilities", async (t) => {
  await cleanup();

  await t.test("should create cache directory", async () => {
    const result = await ensureCacheDir(TEST_CACHE_DIR);
    assert.strictEqual(
      result,
      true,
      "Should successfully create cache directory"
    );

    // Verify directory exists
    const stats = await fs.stat(TEST_CACHE_DIR);
    assert(stats.isDirectory(), "Should create a directory");
  });

  await t.test("should save and load timestamp", async () => {
    await ensureCacheDir(TEST_CACHE_DIR);

    const timestamp = Math.floor(Date.now() / 1000);

    // Save timestamp
    const saveResult = await saveTimestamp(TEST_CACHE_DIR, timestamp);
    assert.strictEqual(saveResult, true, "Should save timestamp successfully");

    // Load timestamp
    const loadedTimestamp = await loadTimestamp(TEST_CACHE_DIR);
    assert.strictEqual(
      loadedTimestamp,
      timestamp,
      "Should load the same timestamp"
    );
  });

  await t.test("should handle missing timestamp file", async () => {
    const result = await loadTimestamp("/non/existent/path");
    assert.strictEqual(result, null, "Should return null for missing file");
  });

  await t.test("should load tracking configuration", () => {
    const config = getTrackingConfig();

    assert(
      typeof config.oldestMqSeconds === "number",
      "Should have oldestMqSeconds"
    );
    assert(typeof config.trackLimit === "number", "Should have trackLimit");
    assert(typeof config.cacheDir === "string", "Should have cacheDir");
    assert(
      typeof config.enablePersistence === "boolean",
      "Should have enablePersistence"
    );

    // Verify values from environment
    assert.strictEqual(
      config.oldestMqSeconds,
      3600,
      "Should load from environment"
    );
    assert.strictEqual(config.trackLimit, 10, "Should load from environment");
  });

  await cleanup();
});

test("Integration - MessageTracker with persistence", async (t) => {
  await cleanup();

  await t.test("should persist and restore state", async () => {
    // Create tracker and add some events
    const tracker1 = createMessageTracker({ cacheDir: TEST_CACHE_DIR });
    await tracker1.initialize();

    const eventId = "persistent_event";
    const timestamp = Math.floor(Date.now() / 1000);

    await tracker1.markProcessed(eventId, timestamp);

    // Create new tracker instance (simulating restart)
    const tracker2 = createMessageTracker({ cacheDir: TEST_CACHE_DIR });
    await tracker2.initialize();

    // Should remember the processed event
    assert.strictEqual(
      tracker2.hasProcessed(eventId, timestamp),
      true,
      "Should remember processed events after restart"
    );

    // Should have similar subscription timestamp
    const since1 = tracker1.getSubscriptionSince();
    const since2 = tracker2.getSubscriptionSince();
    assert(
      Math.abs(since1 - since2) <= 1,
      "Should restore similar subscription timestamp"
    );
  });

  await t.test("should handle cache limit correctly", async () => {
    const tracker = createMessageTracker({
      cacheDir: TEST_CACHE_DIR,
      trackLimit: 3,
    });
    await tracker.initialize();

    // Add events up to limit
    for (let i = 0; i < 5; i++) {
      await tracker.markProcessed(
        `event_${i}`,
        Math.floor(Date.now() / 1000) + i
      );
    }

    const stats = tracker.getStats();
    assert.strictEqual(
      stats.recentEventsCount,
      3,
      "Should respect track limit"
    );

    // Most recent events should still be tracked
    assert.strictEqual(
      tracker.hasProcessed("event_4", Math.floor(Date.now() / 1000) + 4),
      true,
      "Should track most recent events"
    );
  });

  await t.test("should work without persistence", async () => {
    const tracker = createMessageTracker({
      cacheDir: TEST_CACHE_DIR,
      enablePersistence: false,
    });
    await tracker.initialize();

    const stats = tracker.getStats();
    assert.strictEqual(
      stats.persistenceEnabled,
      false,
      "Should disable persistence"
    );

    // Should still work for duplicate detection
    const eventId = "memory_only_event";
    const timestamp = Math.floor(Date.now() / 1000);

    assert.strictEqual(
      tracker.hasProcessed(eventId, timestamp),
      false,
      "New event should not be processed"
    );
    await tracker.markProcessed(eventId, timestamp);
    assert.strictEqual(
      tracker.hasProcessed(eventId, timestamp),
      true,
      "Should detect duplicates in memory"
    );
  });

  await cleanup();
});

test("Error handling and edge cases", async (t) => {
  await cleanup();

  await t.test("should handle invalid cache directory gracefully", async () => {
    const tracker = createMessageTracker({
      cacheDir: "/invalid/path/that/cannot/be/created",
    });

    // Should not throw, but fall back to memory-only mode
    await tracker.initialize();

    const stats = tracker.getStats();
    assert.strictEqual(
      stats.persistenceEnabled,
      false,
      "Should fall back to memory-only mode"
    );
  });

  await t.test("should handle edge case timestamps", async () => {
    const tracker = createMessageTracker({ cacheDir: TEST_CACHE_DIR });
    await tracker.initialize();

    const stats = tracker.getStats();
    const boundaryTimestamp = stats.lastProcessed;

    // Event at exact boundary should be considered old
    assert.strictEqual(
      tracker.hasProcessed("boundary_event", boundaryTimestamp),
      true,
      "Boundary events should be considered old"
    );

    // Event just after boundary should be new
    assert.strictEqual(
      tracker.hasProcessed("new_event", boundaryTimestamp + 1),
      false,
      "Events after boundary should be new"
    );
  });

  await t.test("should clear state correctly", async () => {
    const tracker = createMessageTracker({ cacheDir: TEST_CACHE_DIR });
    await tracker.initialize();

    // Add some events
    await tracker.markProcessed("clear_test_1", Math.floor(Date.now() / 1000));
    await tracker.markProcessed(
      "clear_test_2",
      Math.floor(Date.now() / 1000) + 1
    );

    let stats = tracker.getStats();
    assert.strictEqual(
      stats.recentEventsCount,
      2,
      "Should have events before clear"
    );

    tracker.clear();

    stats = tracker.getStats();
    assert.strictEqual(
      stats.recentEventsCount,
      0,
      "Should have no events after clear"
    );
  });

  await cleanup();
});

// Performance test
test("Performance characteristics", async (t) => {
  await cleanup();

  await t.test("should handle many events efficiently", async () => {
    const tracker = createMessageTracker({
      cacheDir: TEST_CACHE_DIR,
      trackLimit: 1000,
    });
    await tracker.initialize();

    const startTime = Date.now();

    // Process 100 events
    for (let i = 0; i < 100; i++) {
      await tracker.markProcessed(
        `perf_event_${i}`,
        Math.floor(Date.now() / 1000) + i
      );
    }

    const duration = Date.now() - startTime;

    // Should complete within reasonable time
    assert(
      duration < 1000,
      `Processing 100 events took ${duration}ms, should be < 1000ms`
    );

    const stats = tracker.getStats();
    assert.strictEqual(stats.recentEventsCount, 100, "Should track all events");
  });

  await cleanup();
});

console.log("Running comprehensive MessageTracker tests...");
