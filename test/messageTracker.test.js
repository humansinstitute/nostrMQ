import assert from "assert";
import { promises as fs } from "fs";
import { join } from "path";
import {
  createMessageTracker,
  MessageTracker,
} from "../dist/messageTracker.js";

// Test utilities
const TEST_CACHE_DIR = ".test-cache";
const TEST_CONFIG = {
  oldestMqSeconds: 3600,
  trackLimit: 5,
  cacheDir: TEST_CACHE_DIR,
  enablePersistence: true,
};

// Mock environment variables for testing
const originalEnv = { ...process.env };

function setTestEnv() {
  process.env.NOSTRMQ_OLDEST_MQ = "3600";
  process.env.NOSTRMQ_TRACK_LIMIT = "100";
  process.env.NOSTRMQ_CACHE_DIR = ".nostrmq";
  process.env.NOSTRMQ_DISABLE_PERSISTENCE = "false";
}

function restoreEnv() {
  process.env = { ...originalEnv };
}

async function cleanupTestCache() {
  try {
    await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Mock data generators
function createMockEvent(id, timestamp) {
  return {
    id: id || `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    created_at: timestamp || Math.floor(Date.now() / 1000),
  };
}

function createTimestampCache(lastProcessed) {
  return {
    lastProcessed,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

function createSnapshotCache(eventIds) {
  return {
    eventIds: [...eventIds],
    createdAt: Math.floor(Date.now() / 1000),
    count: eventIds.length,
  };
}

// Test suite
describe("MessageTracker", () => {
  beforeEach(async () => {
    setTestEnv();
    await cleanupTestCache();
  });

  afterEach(async () => {
    restoreEnv();
    await cleanupTestCache();
  });

  describe("initialization", () => {
    it("should initialize with default config from environment", () => {
      const tracker = new MessageTracker();
      const stats = tracker.getStats();

      assert.strictEqual(stats.persistenceEnabled, true);
      assert.strictEqual(stats.cacheDir, ".nostrmq");
      assert.strictEqual(stats.recentEventsCount, 0);
      assert(
        stats.lastProcessed > 0,
        "Should have a valid lastProcessed timestamp"
      );
    });

    it("should initialize with custom config", () => {
      const customConfig = {
        oldestMqSeconds: 1800,
        trackLimit: 50,
        cacheDir: ".custom-cache",
        enablePersistence: false,
      };

      const tracker = new MessageTracker(customConfig);
      const stats = tracker.getStats();

      assert.strictEqual(stats.persistenceEnabled, false);
      assert.strictEqual(stats.cacheDir, ".custom-cache");
    });

    it("should initialize with fallback timestamp when no cache exists", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const stats = tracker.getStats();
      const expectedMinTimestamp =
        Math.floor(Date.now() / 1000) - TEST_CONFIG.oldestMqSeconds;

      assert(
        stats.lastProcessed >= expectedMinTimestamp - 10,
        "Should use fallback timestamp"
      );
      assert(
        stats.lastProcessed <= Math.floor(Date.now() / 1000),
        "Should not be in the future"
      );
    });

    it("should load cached timestamp on initialization", async () => {
      // Create cache directory and timestamp file
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });
      const cachedTimestamp = Math.floor(Date.now() / 1000) - 1800;
      const timestampFile = join(TEST_CACHE_DIR, "timestamp.json");
      await fs.writeFile(
        timestampFile,
        JSON.stringify(createTimestampCache(cachedTimestamp))
      );

      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const stats = tracker.getStats();
      assert.strictEqual(stats.lastProcessed, cachedTimestamp);
    });

    it("should load cached event IDs on initialization", async () => {
      // Create cache directory and snapshot file
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });
      const cachedEventIds = ["event1", "event2", "event3"];
      const snapshotFile = join(TEST_CACHE_DIR, "snapshot.json");
      await fs.writeFile(
        snapshotFile,
        JSON.stringify(createSnapshotCache(cachedEventIds))
      );

      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const stats = tracker.getStats();
      assert.strictEqual(stats.recentEventsCount, 3);
    });

    it("should limit loaded event IDs to trackLimit", async () => {
      // Create cache directory and snapshot file with more events than trackLimit
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });
      const cachedEventIds = [
        "event1",
        "event2",
        "event3",
        "event4",
        "event5",
        "event6",
        "event7",
      ];
      const snapshotFile = join(TEST_CACHE_DIR, "snapshot.json");
      await fs.writeFile(
        snapshotFile,
        JSON.stringify(createSnapshotCache(cachedEventIds))
      );

      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const stats = tracker.getStats();
      assert.strictEqual(stats.recentEventsCount, TEST_CONFIG.trackLimit);
    });

    it("should fallback to memory-only mode when cache directory creation fails", async () => {
      const invalidConfig = {
        ...TEST_CONFIG,
        cacheDir: "/invalid/path/that/cannot/be/created",
      };

      const tracker = new MessageTracker(invalidConfig);
      await tracker.initialize();

      const stats = tracker.getStats();
      assert.strictEqual(stats.persistenceEnabled, false);
    });

    it("should handle disabled persistence mode", async () => {
      const noPersistenceConfig = {
        ...TEST_CONFIG,
        enablePersistence: false,
      };

      const tracker = new MessageTracker(noPersistenceConfig);
      await tracker.initialize();

      const stats = tracker.getStats();
      assert.strictEqual(stats.persistenceEnabled, false);
    });
  });

  describe("hasProcessed method", () => {
    it("should return false for new events", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const event = createMockEvent();
      const result = tracker.hasProcessed(event.id, event.created_at);

      assert.strictEqual(result, false);
    });

    it("should return true for events older than lastProcessed timestamp", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const oldTimestamp =
        Math.floor(Date.now() / 1000) - TEST_CONFIG.oldestMqSeconds - 100;
      const event = createMockEvent("old_event", oldTimestamp);

      const result = tracker.hasProcessed(event.id, event.created_at);

      assert.strictEqual(result, true);
    });

    it("should return true for duplicate event IDs", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const event = createMockEvent();

      // Mark event as processed
      await tracker.markProcessed(event.id, event.created_at);

      // Check if it's detected as duplicate
      const result = tracker.hasProcessed(event.id, event.created_at);

      assert.strictEqual(result, true);
    });

    it("should handle edge case timestamps correctly", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const stats = tracker.getStats();
      const exactBoundaryTimestamp = stats.lastProcessed;

      // Event at exact boundary should be considered old
      const boundaryResult = tracker.hasProcessed(
        "boundary_event",
        exactBoundaryTimestamp
      );
      assert.strictEqual(boundaryResult, true);

      // Event just after boundary should be new
      const newResult = tracker.hasProcessed(
        "new_event",
        exactBoundaryTimestamp + 1
      );
      assert.strictEqual(newResult, false);
    });
  });

  describe("markProcessed method", () => {
    it("should update lastProcessed timestamp for newer events", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const initialStats = tracker.getStats();
      const newerTimestamp = initialStats.lastProcessed + 100;
      const event = createMockEvent("newer_event", newerTimestamp);

      await tracker.markProcessed(event.id, event.created_at);

      const updatedStats = tracker.getStats();
      assert.strictEqual(updatedStats.lastProcessed, newerTimestamp);
    });

    it("should not update lastProcessed timestamp for older events", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const initialStats = tracker.getStats();
      const olderTimestamp = initialStats.lastProcessed - 100;
      const event = createMockEvent("older_event", olderTimestamp);

      await tracker.markProcessed(event.id, event.created_at);

      const updatedStats = tracker.getStats();
      assert.strictEqual(
        updatedStats.lastProcessed,
        initialStats.lastProcessed
      );
    });

    it("should add event ID to recent events set", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const event = createMockEvent();

      await tracker.markProcessed(event.id, event.created_at);

      const stats = tracker.getStats();
      assert.strictEqual(stats.recentEventsCount, 1);

      // Verify it's detected as duplicate
      const isDuplicate = tracker.hasProcessed(event.id, event.created_at);
      assert.strictEqual(isDuplicate, true);
    });

    it("should trim recent events when exceeding trackLimit", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      // Add events up to the limit
      for (let i = 0; i < TEST_CONFIG.trackLimit; i++) {
        const event = createMockEvent(`event_${i}`);
        await tracker.markProcessed(event.id, event.created_at);
      }

      let stats = tracker.getStats();
      assert.strictEqual(stats.recentEventsCount, TEST_CONFIG.trackLimit);

      // Add one more event to trigger trimming
      const extraEvent = createMockEvent("extra_event");
      await tracker.markProcessed(extraEvent.id, extraEvent.created_at);

      stats = tracker.getStats();
      assert.strictEqual(stats.recentEventsCount, TEST_CONFIG.trackLimit);

      // The extra event should still be tracked
      const isExtraTracked = tracker.hasProcessed(
        extraEvent.id,
        extraEvent.created_at
      );
      assert.strictEqual(isExtraTracked, true);
    });

    it("should persist timestamp when persistence is enabled", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const newTimestamp = Math.floor(Date.now() / 1000);
      const event = createMockEvent("persist_test", newTimestamp);

      await tracker.markProcessed(event.id, event.created_at);

      // Check if timestamp was persisted
      const timestampFile = join(TEST_CACHE_DIR, "timestamp.json");
      const content = await fs.readFile(timestampFile, "utf-8");
      const cache = JSON.parse(content);

      assert.strictEqual(cache.lastProcessed, newTimestamp);
    });

    it("should persist snapshot when trimming occurs", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      // Add events to trigger trimming
      for (let i = 0; i <= TEST_CONFIG.trackLimit; i++) {
        const event = createMockEvent(`trim_test_${i}`);
        await tracker.markProcessed(event.id, event.created_at);
      }

      // Check if snapshot was persisted
      const snapshotFile = join(TEST_CACHE_DIR, "snapshot.json");
      const content = await fs.readFile(snapshotFile, "utf-8");
      const cache = JSON.parse(content);

      assert.strictEqual(cache.eventIds.length, TEST_CONFIG.trackLimit);
      assert.strictEqual(cache.count, TEST_CONFIG.trackLimit);
    });
  });

  describe("getSubscriptionSince method", () => {
    it("should return current lastProcessed timestamp", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const stats = tracker.getStats();
      const since = tracker.getSubscriptionSince();

      assert.strictEqual(since, stats.lastProcessed);
    });

    it("should return updated timestamp after processing newer events", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const newTimestamp = Math.floor(Date.now() / 1000);
      const event = createMockEvent("since_test", newTimestamp);

      await tracker.markProcessed(event.id, event.created_at);

      const since = tracker.getSubscriptionSince();
      assert.strictEqual(since, newTimestamp);
    });
  });

  describe("getStats method", () => {
    it("should return comprehensive tracking statistics", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      const stats = tracker.getStats();

      assert(typeof stats.lastProcessed === "number");
      assert(typeof stats.lastProcessedDate === "string");
      assert(typeof stats.recentEventsCount === "number");
      assert(typeof stats.persistenceEnabled === "boolean");
      assert(typeof stats.cacheDir === "string");

      // Verify date formatting
      const parsedDate = new Date(stats.lastProcessedDate);
      assert(
        !isNaN(parsedDate.getTime()),
        "lastProcessedDate should be valid ISO string"
      );
    });

    it("should reflect current state accurately", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      // Add some events
      for (let i = 0; i < 3; i++) {
        const event = createMockEvent(`stats_test_${i}`);
        await tracker.markProcessed(event.id, event.created_at);
      }

      const stats = tracker.getStats();
      assert.strictEqual(stats.recentEventsCount, 3);
      assert.strictEqual(stats.cacheDir, TEST_CACHE_DIR);
      assert.strictEqual(stats.persistenceEnabled, true);
    });
  });

  describe("clear method", () => {
    it("should reset tracking state to initial values", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      // Add some events
      for (let i = 0; i < 3; i++) {
        const event = createMockEvent(`clear_test_${i}`);
        await tracker.markProcessed(event.id, event.created_at);
      }

      const beforeClear = tracker.getStats();
      assert.strictEqual(beforeClear.recentEventsCount, 3);

      tracker.clear();

      const afterClear = tracker.getStats();
      assert.strictEqual(afterClear.recentEventsCount, 0);

      // lastProcessed should be reset to fallback value
      const expectedFallback =
        Math.floor(Date.now() / 1000) - TEST_CONFIG.oldestMqSeconds;
      assert(afterClear.lastProcessed >= expectedFallback - 10);
      assert(afterClear.lastProcessed <= Math.floor(Date.now() / 1000));
    });

    it("should not affect persistent cache files", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      // Add an event to create cache files
      const event = createMockEvent();
      await tracker.markProcessed(event.id, event.created_at);

      // Verify cache files exist
      const timestampFile = join(TEST_CACHE_DIR, "timestamp.json");
      const snapshotFile = join(TEST_CACHE_DIR, "snapshot.json");

      await fs.access(timestampFile); // Should not throw
      await fs.access(snapshotFile); // Should not throw

      tracker.clear();

      // Cache files should still exist
      await fs.access(timestampFile); // Should not throw
      await fs.access(snapshotFile); // Should not throw
    });
  });

  describe("error handling", () => {
    it("should handle file system errors gracefully during initialization", async () => {
      // Create a file where directory should be
      await fs.writeFile(TEST_CACHE_DIR, "not a directory");

      const tracker = new MessageTracker(TEST_CONFIG);

      // Should not throw, but fall back to memory-only mode
      await tracker.initialize();

      const stats = tracker.getStats();
      assert.strictEqual(stats.persistenceEnabled, false);

      // Cleanup
      await fs.unlink(TEST_CACHE_DIR);
    });

    it("should handle corrupted timestamp cache gracefully", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });
      const timestampFile = join(TEST_CACHE_DIR, "timestamp.json");
      await fs.writeFile(timestampFile, "invalid json");

      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      // Should use fallback timestamp
      const stats = tracker.getStats();
      const expectedFallback =
        Math.floor(Date.now() / 1000) - TEST_CONFIG.oldestMqSeconds;
      assert(stats.lastProcessed >= expectedFallback - 10);
    });

    it("should handle corrupted snapshot cache gracefully", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });
      const snapshotFile = join(TEST_CACHE_DIR, "snapshot.json");
      await fs.writeFile(snapshotFile, "invalid json");

      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      // Should start with empty recent events
      const stats = tracker.getStats();
      assert.strictEqual(stats.recentEventsCount, 0);
    });

    it("should continue processing even if persistence fails", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      // Remove cache directory to cause persistence failures
      await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });

      const event = createMockEvent();

      // Should not throw even though persistence will fail
      await tracker.markProcessed(event.id, event.created_at);

      // Event should still be tracked in memory
      const isDuplicate = tracker.hasProcessed(event.id, event.created_at);
      assert.strictEqual(isDuplicate, true);
    });
  });

  describe("createMessageTracker factory function", () => {
    it("should create MessageTracker instance with default config", () => {
      const tracker = createMessageTracker();

      assert(tracker instanceof MessageTracker);

      const stats = tracker.getStats();
      assert(typeof stats.lastProcessed === "number");
      assert(typeof stats.persistenceEnabled === "boolean");
    });

    it("should create MessageTracker instance with custom config", () => {
      const customConfig = {
        trackLimit: 25,
        enablePersistence: false,
      };

      const tracker = createMessageTracker(customConfig);

      assert(tracker instanceof MessageTracker);

      const stats = tracker.getStats();
      assert.strictEqual(stats.persistenceEnabled, false);
    });
  });

  describe("performance characteristics", () => {
    it("should handle large number of events efficiently", async () => {
      const tracker = new MessageTracker({
        ...TEST_CONFIG,
        trackLimit: 1000,
      });
      await tracker.initialize();

      const startTime = Date.now();

      // Process 1000 events
      for (let i = 0; i < 1000; i++) {
        const event = createMockEvent(`perf_test_${i}`);
        await tracker.markProcessed(event.id, event.created_at);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      assert(
        duration < 5000,
        `Processing 1000 events took ${duration}ms, expected < 5000ms`
      );

      const stats = tracker.getStats();
      assert.strictEqual(stats.recentEventsCount, 1000);
    });

    it("should maintain constant memory usage with trimming", async () => {
      const tracker = new MessageTracker(TEST_CONFIG);
      await tracker.initialize();

      // Process many more events than trackLimit
      for (let i = 0; i < TEST_CONFIG.trackLimit * 3; i++) {
        const event = createMockEvent(`memory_test_${i}`);
        await tracker.markProcessed(event.id, event.created_at);
      }

      const stats = tracker.getStats();
      assert.strictEqual(stats.recentEventsCount, TEST_CONFIG.trackLimit);
    });
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Running MessageTracker tests...");

  // Simple test runner
  const tests = [];
  let currentSuite = "";

  global.describe = (name, fn) => {
    currentSuite = name;
    fn();
  };

  global.it = (name, fn) => {
    tests.push({ suite: currentSuite, name, fn });
  };

  global.beforeEach = () => {}; // Simplified for this runner
  global.afterEach = () => {};

  // Import and run tests
  try {
    // Tests are already defined above

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await test.fn();
        console.log(`✓ ${test.suite}: ${test.name}`);
        passed++;
      } catch (error) {
        console.log(`✗ ${test.suite}: ${test.name}`);
        console.log(`  Error: ${error.message}`);
        failed++;
      }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("Test runner error:", error);
    process.exit(1);
  }
}
