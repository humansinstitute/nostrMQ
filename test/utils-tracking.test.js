import assert from "assert";
import { promises as fs } from "fs";
import { join } from "path";
import {
  ensureCacheDir,
  saveTimestamp,
  loadTimestamp,
  saveSnapshot,
  loadSnapshot,
  getTrackingConfig,
} from "../dist/utils.js";

// Test utilities
const TEST_CACHE_DIR = ".test-utils-cache";
const INVALID_CACHE_DIR = "/invalid/path/that/cannot/be/created";

// Mock environment variables
const originalEnv = { ...process.env };

function setTestEnv(overrides = {}) {
  process.env.NOSTRMQ_OLDEST_MQ = overrides.oldestMq || "3600";
  process.env.NOSTRMQ_TRACK_LIMIT = overrides.trackLimit || "100";
  process.env.NOSTRMQ_CACHE_DIR = overrides.cacheDir || ".nostrmq";
  process.env.NOSTRMQ_DISABLE_PERSISTENCE =
    overrides.disablePersistence || "false";
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

// Test data generators
function createValidTimestampCache(
  lastProcessed = Math.floor(Date.now() / 1000)
) {
  return {
    lastProcessed,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

function createValidSnapshotCache(eventIds = ["event1", "event2", "event3"]) {
  return {
    eventIds: [...eventIds],
    createdAt: Math.floor(Date.now() / 1000),
    count: eventIds.length,
  };
}

// Test suite
describe("Tracking Utilities", () => {
  beforeEach(async () => {
    setTestEnv();
    await cleanupTestCache();
  });

  afterEach(async () => {
    restoreEnv();
    await cleanupTestCache();
  });

  describe("ensureCacheDir", () => {
    it("should create cache directory successfully", async () => {
      const result = await ensureCacheDir(TEST_CACHE_DIR);

      assert.strictEqual(result, true);

      // Verify directory exists
      const stats = await fs.stat(TEST_CACHE_DIR);
      assert(stats.isDirectory(), "Should create a directory");
    });

    it("should succeed if directory already exists", async () => {
      // Create directory first
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const result = await ensureCacheDir(TEST_CACHE_DIR);

      assert.strictEqual(result, true);
    });

    it("should create nested directories recursively", async () => {
      const nestedDir = join(TEST_CACHE_DIR, "nested", "deep");

      const result = await ensureCacheDir(nestedDir);

      assert.strictEqual(result, true);

      // Verify nested directory exists
      const stats = await fs.stat(nestedDir);
      assert(stats.isDirectory(), "Should create nested directories");
    });

    it("should return false for invalid paths", async () => {
      const result = await ensureCacheDir(INVALID_CACHE_DIR);

      assert.strictEqual(result, false);
    });

    it("should handle permission errors gracefully", async () => {
      // Try to create directory in a location that requires elevated permissions
      const restrictedPath = "/root/test-cache";

      const result = await ensureCacheDir(restrictedPath);

      // Should return false instead of throwing
      assert.strictEqual(result, false);
    });

    it("should handle file conflicts gracefully", async () => {
      // Create a file where we want to create a directory
      await fs.writeFile(TEST_CACHE_DIR, "not a directory");

      const result = await ensureCacheDir(TEST_CACHE_DIR);

      assert.strictEqual(result, false);

      // Cleanup
      await fs.unlink(TEST_CACHE_DIR);
    });
  });

  describe("saveTimestamp and loadTimestamp", () => {
    it("should save and load timestamp successfully", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const timestamp = Math.floor(Date.now() / 1000);

      // Save timestamp
      const saveResult = await saveTimestamp(TEST_CACHE_DIR, timestamp);
      assert.strictEqual(saveResult, true);

      // Load timestamp
      const loadedTimestamp = await loadTimestamp(TEST_CACHE_DIR);
      assert.strictEqual(loadedTimestamp, timestamp);
    });

    it("should create valid timestamp cache structure", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const timestamp = 1234567890;
      await saveTimestamp(TEST_CACHE_DIR, timestamp);

      // Verify file structure
      const timestampFile = join(TEST_CACHE_DIR, "timestamp.json");
      const content = await fs.readFile(timestampFile, "utf-8");
      const cache = JSON.parse(content);

      assert.strictEqual(cache.lastProcessed, timestamp);
      assert(typeof cache.updatedAt === "number");
      assert(cache.updatedAt > 0);
    });

    it("should return null when timestamp file does not exist", async () => {
      const result = await loadTimestamp(TEST_CACHE_DIR);

      assert.strictEqual(result, null);
    });

    it("should return null for corrupted timestamp file", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      // Create corrupted file
      const timestampFile = join(TEST_CACHE_DIR, "timestamp.json");
      await fs.writeFile(timestampFile, "invalid json");

      const result = await loadTimestamp(TEST_CACHE_DIR);

      assert.strictEqual(result, null);
    });

    it("should return null for invalid timestamp cache structure", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      // Create file with invalid structure
      const timestampFile = join(TEST_CACHE_DIR, "timestamp.json");
      await fs.writeFile(
        timestampFile,
        JSON.stringify({
          lastProcessed: "not a number",
          updatedAt: Math.floor(Date.now() / 1000),
        })
      );

      const result = await loadTimestamp(TEST_CACHE_DIR);

      assert.strictEqual(result, null);
    });

    it("should return null for negative timestamps", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const timestampFile = join(TEST_CACHE_DIR, "timestamp.json");
      await fs.writeFile(
        timestampFile,
        JSON.stringify({
          lastProcessed: -123,
          updatedAt: Math.floor(Date.now() / 1000),
        })
      );

      const result = await loadTimestamp(TEST_CACHE_DIR);

      assert.strictEqual(result, null);
    });

    it("should handle save failures gracefully", async () => {
      // Try to save to non-existent directory
      const result = await saveTimestamp("/non/existent/path", 123456);

      assert.strictEqual(result, false);
    });

    it("should handle permission errors during save", async () => {
      // Create read-only directory
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });
      await fs.chmod(TEST_CACHE_DIR, 0o444); // Read-only

      const result = await saveTimestamp(TEST_CACHE_DIR, 123456);

      assert.strictEqual(result, false);

      // Restore permissions for cleanup
      await fs.chmod(TEST_CACHE_DIR, 0o755);
    });
  });

  describe("saveSnapshot and loadSnapshot", () => {
    it("should save and load snapshot successfully", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const eventIds = ["event1", "event2", "event3", "event4"];

      // Save snapshot
      const saveResult = await saveSnapshot(TEST_CACHE_DIR, eventIds);
      assert.strictEqual(saveResult, true);

      // Load snapshot
      const loadedEventIds = await loadSnapshot(TEST_CACHE_DIR);
      assert.deepStrictEqual(loadedEventIds, eventIds);
    });

    it("should create valid snapshot cache structure", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const eventIds = ["event1", "event2"];
      await saveSnapshot(TEST_CACHE_DIR, eventIds);

      // Verify file structure
      const snapshotFile = join(TEST_CACHE_DIR, "snapshot.json");
      const content = await fs.readFile(snapshotFile, "utf-8");
      const cache = JSON.parse(content);

      assert.deepStrictEqual(cache.eventIds, eventIds);
      assert.strictEqual(cache.count, eventIds.length);
      assert(typeof cache.createdAt === "number");
      assert(cache.createdAt > 0);
    });

    it("should handle empty event ID arrays", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const eventIds = [];

      const saveResult = await saveSnapshot(TEST_CACHE_DIR, eventIds);
      assert.strictEqual(saveResult, true);

      const loadedEventIds = await loadSnapshot(TEST_CACHE_DIR);
      assert.deepStrictEqual(loadedEventIds, []);
    });

    it("should return empty array when snapshot file does not exist", async () => {
      const result = await loadSnapshot(TEST_CACHE_DIR);

      assert.deepStrictEqual(result, []);
    });

    it("should return empty array for corrupted snapshot file", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      // Create corrupted file
      const snapshotFile = join(TEST_CACHE_DIR, "snapshot.json");
      await fs.writeFile(snapshotFile, "invalid json");

      const result = await loadSnapshot(TEST_CACHE_DIR);

      assert.deepStrictEqual(result, []);
    });

    it("should return empty array for invalid snapshot cache structure", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      // Create file with invalid structure
      const snapshotFile = join(TEST_CACHE_DIR, "snapshot.json");
      await fs.writeFile(
        snapshotFile,
        JSON.stringify({
          eventIds: "not an array",
          createdAt: Math.floor(Date.now() / 1000),
          count: 0,
        })
      );

      const result = await loadSnapshot(TEST_CACHE_DIR);

      assert.deepStrictEqual(result, []);
    });

    it("should handle large event ID arrays", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      // Create large array of event IDs
      const eventIds = Array.from({ length: 1000 }, (_, i) => `event_${i}`);

      const saveResult = await saveSnapshot(TEST_CACHE_DIR, eventIds);
      assert.strictEqual(saveResult, true);

      const loadedEventIds = await loadSnapshot(TEST_CACHE_DIR);
      assert.deepStrictEqual(loadedEventIds, eventIds);
      assert.strictEqual(loadedEventIds.length, 1000);
    });

    it("should handle save failures gracefully", async () => {
      // Try to save to non-existent directory
      const result = await saveSnapshot("/non/existent/path", ["event1"]);

      assert.strictEqual(result, false);
    });

    it("should preserve event ID order", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const eventIds = ["z_event", "a_event", "m_event", "1_event"];

      await saveSnapshot(TEST_CACHE_DIR, eventIds);
      const loadedEventIds = await loadSnapshot(TEST_CACHE_DIR);

      assert.deepStrictEqual(loadedEventIds, eventIds);
    });

    it("should handle duplicate event IDs", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const eventIds = ["event1", "event2", "event1", "event3"];

      await saveSnapshot(TEST_CACHE_DIR, eventIds);
      const loadedEventIds = await loadSnapshot(TEST_CACHE_DIR);

      // Should preserve duplicates as-is
      assert.deepStrictEqual(loadedEventIds, eventIds);
    });
  });

  describe("getTrackingConfig", () => {
    it("should return default configuration", () => {
      setTestEnv();

      const config = getTrackingConfig();

      assert.strictEqual(config.oldestMqSeconds, 3600);
      assert.strictEqual(config.trackLimit, 100);
      assert.strictEqual(config.cacheDir, ".nostrmq");
      assert.strictEqual(config.enablePersistence, true);
    });

    it("should load configuration from environment variables", () => {
      setTestEnv({
        oldestMq: "7200",
        trackLimit: "50",
        cacheDir: ".custom-cache",
        disablePersistence: "false",
      });

      const config = getTrackingConfig();

      assert.strictEqual(config.oldestMqSeconds, 7200);
      assert.strictEqual(config.trackLimit, 50);
      assert.strictEqual(config.cacheDir, ".custom-cache");
      assert.strictEqual(config.enablePersistence, true);
    });

    it("should handle disabled persistence", () => {
      setTestEnv({
        disablePersistence: "true",
      });

      const config = getTrackingConfig();

      assert.strictEqual(config.enablePersistence, false);
    });

    it("should enforce minimum values", () => {
      setTestEnv({
        oldestMq: "30", // Below minimum
        trackLimit: "5", // Below minimum
      });

      const config = getTrackingConfig();

      assert.strictEqual(config.oldestMqSeconds, 60); // Minimum 1 minute
      assert.strictEqual(config.trackLimit, 10); // Minimum 10
    });

    it("should enforce maximum values", () => {
      setTestEnv({
        trackLimit: "2000", // Above maximum
      });

      const config = getTrackingConfig();

      assert.strictEqual(config.trackLimit, 1000); // Maximum 1000
    });

    it("should handle invalid numeric values", () => {
      setTestEnv({
        oldestMq: "not_a_number",
        trackLimit: "also_not_a_number",
      });

      const config = getTrackingConfig();

      // Should use defaults when parsing fails
      assert.strictEqual(config.oldestMqSeconds, 60); // Minimum applied to NaN
      assert.strictEqual(config.trackLimit, 10); // Minimum applied to NaN
    });

    it("should handle missing environment variables", () => {
      // Clear all tracking-related env vars
      delete process.env.NOSTRMQ_OLDEST_MQ;
      delete process.env.NOSTRMQ_TRACK_LIMIT;
      delete process.env.NOSTRMQ_CACHE_DIR;
      delete process.env.NOSTRMQ_DISABLE_PERSISTENCE;

      const config = getTrackingConfig();

      assert.strictEqual(config.oldestMqSeconds, 3600);
      assert.strictEqual(config.trackLimit, 100);
      assert.strictEqual(config.cacheDir, ".nostrmq");
      assert.strictEqual(config.enablePersistence, true);
    });

    it("should handle edge case values", () => {
      setTestEnv({
        oldestMq: "0",
        trackLimit: "0",
      });

      const config = getTrackingConfig();

      assert.strictEqual(config.oldestMqSeconds, 60); // Minimum enforced
      assert.strictEqual(config.trackLimit, 10); // Minimum enforced
    });

    it("should handle negative values", () => {
      setTestEnv({
        oldestMq: "-100",
        trackLimit: "-50",
      });

      const config = getTrackingConfig();

      assert.strictEqual(config.oldestMqSeconds, 60); // Minimum enforced
      assert.strictEqual(config.trackLimit, 10); // Minimum enforced
    });

    it("should handle floating point values", () => {
      setTestEnv({
        oldestMq: "3600.5",
        trackLimit: "100.7",
      });

      const config = getTrackingConfig();

      assert.strictEqual(config.oldestMqSeconds, 3600); // parseInt truncates
      assert.strictEqual(config.trackLimit, 100); // parseInt truncates
    });
  });

  describe("file system integration", () => {
    it("should handle concurrent file operations", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      // Perform multiple concurrent operations
      const operations = [
        saveTimestamp(TEST_CACHE_DIR, 1000),
        saveTimestamp(TEST_CACHE_DIR, 2000),
        saveSnapshot(TEST_CACHE_DIR, ["event1", "event2"]),
        saveSnapshot(TEST_CACHE_DIR, ["event3", "event4"]),
        loadTimestamp(TEST_CACHE_DIR),
        loadSnapshot(TEST_CACHE_DIR),
      ];

      const results = await Promise.allSettled(operations);

      // All operations should complete without throwing
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.log(`Operation ${index} failed:`, result.reason);
        }
      });

      // At least some operations should succeed
      const successCount = results.filter(
        (r) => r.status === "fulfilled"
      ).length;
      assert(successCount > 0, "At least some operations should succeed");
    });

    it("should handle file system race conditions gracefully", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      // Start multiple save operations simultaneously
      const promises = [
        saveTimestamp(TEST_CACHE_DIR, 1000),
        saveTimestamp(TEST_CACHE_DIR, 2000),
        saveTimestamp(TEST_CACHE_DIR, 3000),
      ];

      const results = await Promise.all(promises);

      // All should succeed (last write wins)
      results.forEach((result) => {
        assert.strictEqual(result, true);
      });

      // Final value should be one of the written values
      const finalTimestamp = await loadTimestamp(TEST_CACHE_DIR);
      assert(
        [1000, 2000, 3000].includes(finalTimestamp),
        `Final timestamp ${finalTimestamp} should be one of the written values`
      );
    });

    it("should handle disk space issues gracefully", async () => {
      // This test is difficult to simulate reliably, but we can test the error handling path
      // by trying to write to a location that will fail

      const result = await saveTimestamp("/dev/null/invalid", 123456);
      assert.strictEqual(result, false);

      const snapshotResult = await saveSnapshot("/dev/null/invalid", [
        "event1",
      ]);
      assert.strictEqual(snapshotResult, false);
    });
  });

  describe("data integrity", () => {
    it("should maintain data consistency across save/load cycles", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const originalTimestamp = 1234567890;
      const originalEventIds = ["event1", "event2", "event3"];

      // Save data
      await saveTimestamp(TEST_CACHE_DIR, originalTimestamp);
      await saveSnapshot(TEST_CACHE_DIR, originalEventIds);

      // Load and verify
      const loadedTimestamp = await loadTimestamp(TEST_CACHE_DIR);
      const loadedEventIds = await loadSnapshot(TEST_CACHE_DIR);

      assert.strictEqual(loadedTimestamp, originalTimestamp);
      assert.deepStrictEqual(loadedEventIds, originalEventIds);

      // Repeat cycle
      const newTimestamp = originalTimestamp + 100;
      const newEventIds = [...originalEventIds, "event4", "event5"];

      await saveTimestamp(TEST_CACHE_DIR, newTimestamp);
      await saveSnapshot(TEST_CACHE_DIR, newEventIds);

      const finalTimestamp = await loadTimestamp(TEST_CACHE_DIR);
      const finalEventIds = await loadSnapshot(TEST_CACHE_DIR);

      assert.strictEqual(finalTimestamp, newTimestamp);
      assert.deepStrictEqual(finalEventIds, newEventIds);
    });

    it("should handle special characters in event IDs", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const specialEventIds = [
        "event_with_underscore",
        "event-with-dash",
        "event.with.dots",
        "event:with:colons",
        "event/with/slashes",
        "event with spaces",
        'event"with"quotes',
        "event'with'apostrophes",
        "event\\with\\backslashes",
        "event\nwith\nnewlines",
        "event\twith\ttabs",
        "event🚀with🚀emojis",
      ];

      await saveSnapshot(TEST_CACHE_DIR, specialEventIds);
      const loadedEventIds = await loadSnapshot(TEST_CACHE_DIR);

      assert.deepStrictEqual(loadedEventIds, specialEventIds);
    });

    it("should handle very long event IDs", async () => {
      await fs.mkdir(TEST_CACHE_DIR, { recursive: true });

      const longEventId = "a".repeat(10000); // Very long event ID
      const eventIds = [longEventId, "normal_event"];

      await saveSnapshot(TEST_CACHE_DIR, eventIds);
      const loadedEventIds = await loadSnapshot(TEST_CACHE_DIR);

      assert.deepStrictEqual(loadedEventIds, eventIds);
      assert.strictEqual(loadedEventIds[0].length, 10000);
    });
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Running utils-tracking tests...");

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

  global.beforeEach = () => {};
  global.afterEach = () => {};

  try {
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
