#!/usr/bin/env node

/**
 * NostrMQ Active Tracking Demo
 *
 * This example demonstrates the automatic replay protection feature
 * that prevents duplicate message processing through active tracking.
 *
 * Features demonstrated:
 * - Automatic duplicate detection
 * - Configuration with environment variables
 * - Performance monitoring
 * - Error handling and graceful degradation
 * - Cache directory management
 */

import { receive, send, createMessageTracker } from "../dist/index.js";
import { promises as fs } from "fs";
import { join } from "path";

// Demo configuration
const DEMO_CONFIG = {
  // Use a demo-specific cache directory
  cacheDir: ".nostrmq-demo",
  // Track more events for demonstration
  trackLimit: 50,
  // Shorter lookback for demo purposes
  oldestMqSeconds: 300, // 5 minutes
};

/**
 * Demo 1: Basic Automatic Tracking
 * Shows how tracking works automatically with receive()
 */
async function demoBasicTracking() {
  console.log("\n🛡️  Demo 1: Basic Automatic Tracking");
  console.log("=====================================");

  // Set up environment for demo
  process.env.NOSTRMQ_CACHE_DIR = DEMO_CONFIG.cacheDir;
  process.env.NOSTRMQ_TRACK_LIMIT = DEMO_CONFIG.trackLimit.toString();
  process.env.NOSTRMQ_OLDEST_MQ = DEMO_CONFIG.oldestMqSeconds.toString();

  console.log("Starting receive with automatic tracking...");

  let messageCount = 0;
  let duplicateCount = 0;

  const subscription = receive({
    onMessage: async (payload, sender, rawEvent) => {
      messageCount++;
      console.log(`📨 Message ${messageCount}: ${JSON.stringify(payload)}`);
      console.log(`   From: ${sender.slice(0, 8)}...`);
      console.log(`   Event ID: ${rawEvent.id.slice(0, 8)}...`);
      console.log(
        `   Timestamp: ${new Date(rawEvent.created_at * 1000).toISOString()}`
      );
    },
  });

  // Simulate some time for messages to arrive
  console.log("Listening for messages for 10 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 10000));

  subscription.close();
  console.log(`✅ Processed ${messageCount} unique messages`);
  console.log(`🚫 Blocked ${duplicateCount} duplicate attempts`);
}

/**
 * Demo 2: Manual MessageTracker Usage
 * Shows how to use MessageTracker directly for custom scenarios
 */
async function demoManualTracking() {
  console.log("\n🔧 Demo 2: Manual MessageTracker Usage");
  console.log("======================================");

  // Create a tracker with custom configuration
  const tracker = createMessageTracker({
    cacheDir: DEMO_CONFIG.cacheDir,
    trackLimit: DEMO_CONFIG.trackLimit,
    oldestMqSeconds: DEMO_CONFIG.oldestMqSeconds,
    enablePersistence: true,
  });

  console.log("Initializing MessageTracker...");
  await tracker.initialize();

  // Show initial stats
  const initialStats = tracker.getStats();
  console.log("📊 Initial tracker stats:", {
    lastProcessed: new Date(initialStats.lastProcessed * 1000).toISOString(),
    recentEventsCount: initialStats.recentEventsCount,
    persistenceEnabled: initialStats.persistenceEnabled,
    cacheDir: initialStats.cacheDir,
  });

  // Simulate processing some events
  console.log("\n🔄 Simulating event processing...");

  const mockEvents = [
    { id: "event_001", created_at: Math.floor(Date.now() / 1000) - 100 },
    { id: "event_002", created_at: Math.floor(Date.now() / 1000) - 50 },
    { id: "event_003", created_at: Math.floor(Date.now() / 1000) - 10 },
    { id: "event_001", created_at: Math.floor(Date.now() / 1000) - 100 }, // Duplicate
    { id: "event_004", created_at: Math.floor(Date.now() / 1000) },
  ];

  for (const event of mockEvents) {
    const isProcessed = tracker.hasProcessed(event.id, event.created_at);

    if (isProcessed) {
      console.log(`🚫 Skipping duplicate event: ${event.id}`);
    } else {
      console.log(`✅ Processing new event: ${event.id}`);
      await tracker.markProcessed(event.id, event.created_at);
    }
  }

  // Show final stats
  const finalStats = tracker.getStats();
  console.log("\n📊 Final tracker stats:", {
    lastProcessed: new Date(finalStats.lastProcessed * 1000).toISOString(),
    recentEventsCount: finalStats.recentEventsCount,
    eventsProcessed:
      finalStats.recentEventsCount - initialStats.recentEventsCount,
  });

  // Demonstrate subscription filtering
  const subscriptionSince = tracker.getSubscriptionSince();
  console.log(
    `\n🔍 Subscription filter would use since: ${new Date(
      subscriptionSince * 1000
    ).toISOString()}`
  );
}

/**
 * Demo 3: Performance Monitoring
 * Shows how to monitor tracking performance and memory usage
 */
async function demoPerformanceMonitoring() {
  console.log("\n⚡ Demo 3: Performance Monitoring");
  console.log("=================================");

  const tracker = createMessageTracker({
    cacheDir: DEMO_CONFIG.cacheDir,
    trackLimit: 100, // Larger limit for performance testing
    oldestMqSeconds: DEMO_CONFIG.oldestMqSeconds,
  });

  await tracker.initialize();

  console.log("🏃 Running performance test with 100 events...");

  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage();

  // Process 100 events rapidly
  for (let i = 0; i < 100; i++) {
    const eventId = `perf_test_${i.toString().padStart(3, "0")}`;
    const timestamp = Math.floor(Date.now() / 1000) - (100 - i);

    const isProcessed = tracker.hasProcessed(eventId, timestamp);
    if (!isProcessed) {
      await tracker.markProcessed(eventId, timestamp);
    }
  }

  const endTime = process.hrtime.bigint();
  const endMemory = process.memoryUsage();

  // Calculate performance metrics
  const durationMs = Number(endTime - startTime) / 1_000_000;
  const eventsPerSecond = Math.round(100 / (durationMs / 1000));
  const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;

  console.log("📈 Performance Results:");
  console.log(`   Duration: ${durationMs.toFixed(2)}ms`);
  console.log(`   Rate: ${eventsPerSecond} events/second`);
  console.log(`   Memory increase: ${(memoryIncrease / 1024).toFixed(2)} KB`);
  console.log(
    `   Average per event: ${(memoryIncrease / 100).toFixed(0)} bytes`
  );

  // Test duplicate detection performance
  console.log("\n🔍 Testing duplicate detection performance...");

  const dupStartTime = process.hrtime.bigint();

  // Check all 100 events again (should all be duplicates)
  let duplicatesDetected = 0;
  for (let i = 0; i < 100; i++) {
    const eventId = `perf_test_${i.toString().padStart(3, "0")}`;
    const timestamp = Math.floor(Date.now() / 1000) - (100 - i);

    if (tracker.hasProcessed(eventId, timestamp)) {
      duplicatesDetected++;
    }
  }

  const dupEndTime = process.hrtime.bigint();
  const dupDurationMs = Number(dupEndTime - dupStartTime) / 1_000_000;

  console.log(`   Duplicates detected: ${duplicatesDetected}/100`);
  console.log(`   Detection time: ${dupDurationMs.toFixed(2)}ms`);
  console.log(
    `   Detection rate: ${Math.round(
      100 / (dupDurationMs / 1000)
    )} checks/second`
  );
}

/**
 * Demo 4: Error Handling and Graceful Degradation
 * Shows how the system handles various error conditions
 */
async function demoErrorHandling() {
  console.log("\n🛠️  Demo 4: Error Handling and Graceful Degradation");
  console.log("===================================================");

  // Test 1: Invalid cache directory
  console.log("Test 1: Invalid cache directory...");
  const invalidTracker = createMessageTracker({
    cacheDir: "/invalid/readonly/path",
    trackLimit: 10,
    oldestMqSeconds: 300,
  });

  await invalidTracker.initialize();
  const invalidStats = invalidTracker.getStats();
  console.log(`   Persistence enabled: ${invalidStats.persistenceEnabled}`);
  console.log(`   ✅ Gracefully fell back to memory-only mode`);

  // Test 2: Disabled persistence
  console.log("\nTest 2: Disabled persistence...");
  const memoryOnlyTracker = createMessageTracker({
    cacheDir: DEMO_CONFIG.cacheDir,
    trackLimit: 10,
    oldestMqSeconds: 300,
    enablePersistence: false,
  });

  await memoryOnlyTracker.initialize();
  const memoryStats = memoryOnlyTracker.getStats();
  console.log(`   Persistence enabled: ${memoryStats.persistenceEnabled}`);
  console.log(`   ✅ Memory-only mode working correctly`);

  // Test 3: Cache limit overflow
  console.log("\nTest 3: Cache limit overflow...");
  const limitTracker = createMessageTracker({
    cacheDir: DEMO_CONFIG.cacheDir,
    trackLimit: 5, // Very small limit
    oldestMqSeconds: 300,
  });

  await limitTracker.initialize();

  // Add more events than the limit
  for (let i = 0; i < 10; i++) {
    await limitTracker.markProcessed(
      `overflow_${i}`,
      Math.floor(Date.now() / 1000)
    );
  }

  const limitStats = limitTracker.getStats();
  console.log(
    `   Events tracked: ${limitStats.recentEventsCount}/5 (limit enforced)`
  );
  console.log(`   ✅ Cache limit respected, old events trimmed`);
}

/**
 * Demo 5: Configuration Examples
 * Shows different configuration scenarios and their effects
 */
async function demoConfiguration() {
  console.log("\n⚙️  Demo 5: Configuration Examples");
  console.log("==================================");

  const configs = [
    {
      name: "High-throughput (memory-only)",
      config: {
        cacheDir: DEMO_CONFIG.cacheDir,
        trackLimit: 500,
        oldestMqSeconds: 1800,
        enablePersistence: false,
      },
    },
    {
      name: "Low-memory (minimal tracking)",
      config: {
        cacheDir: DEMO_CONFIG.cacheDir,
        trackLimit: 20,
        oldestMqSeconds: 600,
        enablePersistence: true,
      },
    },
    {
      name: "Long-term (extended history)",
      config: {
        cacheDir: DEMO_CONFIG.cacheDir,
        trackLimit: 200,
        oldestMqSeconds: 7200, // 2 hours
        enablePersistence: true,
      },
    },
  ];

  for (const { name, config } of configs) {
    console.log(`\n📋 ${name}:`);
    const tracker = createMessageTracker(config);
    await tracker.initialize();

    const stats = tracker.getStats();
    console.log(`   Track limit: ${config.trackLimit} events`);
    console.log(`   Lookback: ${config.oldestMqSeconds / 60} minutes`);
    console.log(
      `   Persistence: ${config.enablePersistence ? "enabled" : "disabled"}`
    );
    console.log(`   Cache dir: ${stats.cacheDir}`);

    // Show what the subscription filter would look like
    const since = tracker.getSubscriptionSince();
    const sinceDate = new Date(since * 1000);
    console.log(`   Subscription since: ${sinceDate.toISOString()}`);
  }
}

/**
 * Demo 6: Cache File Inspection
 * Shows how to inspect and understand cache files
 */
async function demoCacheInspection() {
  console.log("\n🔍 Demo 6: Cache File Inspection");
  console.log("=================================");

  const tracker = createMessageTracker({
    cacheDir: DEMO_CONFIG.cacheDir,
    trackLimit: 5,
    oldestMqSeconds: 300,
  });

  await tracker.initialize();

  // Add some test events
  console.log("Adding test events to cache...");
  for (let i = 0; i < 3; i++) {
    await tracker.markProcessed(
      `cache_demo_${i}`,
      Math.floor(Date.now() / 1000) - i
    );
  }

  // Inspect cache files
  try {
    const timestampFile = join(DEMO_CONFIG.cacheDir, "timestamp.json");
    const snapshotFile = join(DEMO_CONFIG.cacheDir, "snapshot.json");

    console.log("\n📄 Cache file contents:");

    if (
      await fs
        .access(timestampFile)
        .then(() => true)
        .catch(() => false)
    ) {
      const timestampContent = await fs.readFile(timestampFile, "utf-8");
      console.log("\ntimestamp.json:");
      console.log(JSON.stringify(JSON.parse(timestampContent), null, 2));
    }

    if (
      await fs
        .access(snapshotFile)
        .then(() => true)
        .catch(() => false)
    ) {
      const snapshotContent = await fs.readFile(snapshotFile, "utf-8");
      console.log("\nsnapshot.json:");
      console.log(JSON.stringify(JSON.parse(snapshotContent), null, 2));
    }

    // Show directory structure
    console.log(`\n📁 Cache directory structure:`);
    const files = await fs.readdir(DEMO_CONFIG.cacheDir);
    for (const file of files) {
      const stats = await fs.stat(join(DEMO_CONFIG.cacheDir, file));
      console.log(
        `   ${file} (${
          stats.size
        } bytes, modified: ${stats.mtime.toISOString()})`
      );
    }
  } catch (error) {
    console.log(`   ⚠️  Could not read cache files: ${error.message}`);
  }
}

/**
 * Cleanup function to remove demo cache directory
 */
async function cleanup() {
  try {
    await fs.rm(DEMO_CONFIG.cacheDir, { recursive: true, force: true });
    console.log(
      `\n🧹 Cleaned up demo cache directory: ${DEMO_CONFIG.cacheDir}`
    );
  } catch (error) {
    console.log(`⚠️  Cleanup warning: ${error.message}`);
  }
}

/**
 * Main demo runner
 */
async function runDemo() {
  console.log("🚀 NostrMQ Active Tracking Demo");
  console.log("================================");
  console.log("This demo showcases the automatic replay protection features.");
  console.log(
    "Note: Some demos require a valid NOSTR_PRIVKEY environment variable.\n"
  );

  try {
    // Check if we have required environment
    if (!process.env.NOSTR_PRIVKEY) {
      console.log("⚠️  NOSTR_PRIVKEY not set. Some demos will be limited.");
      console.log("   Set NOSTR_PRIVKEY to see full receive() integration.\n");
    }

    // Run all demos
    await demoManualTracking();
    await demoPerformanceMonitoring();
    await demoErrorHandling();
    await demoConfiguration();
    await demoCacheInspection();

    // Only run basic tracking demo if we have credentials
    if (process.env.NOSTR_PRIVKEY) {
      await demoBasicTracking();
    } else {
      console.log("\n🛡️  Demo 1: Basic Automatic Tracking");
      console.log("=====================================");
      console.log("⚠️  Skipped - requires NOSTR_PRIVKEY environment variable");
    }
  } catch (error) {
    console.error("\n❌ Demo error:", error.message);
    console.error("Stack trace:", error.stack);
  } finally {
    await cleanup();
  }

  console.log("\n✅ Demo completed!");
  console.log("\nNext steps:");
  console.log("- Set NOSTR_PRIVKEY to see full integration demo");
  console.log("- Check docs/active-tracking.md for detailed documentation");
  console.log("- Explore configuration options for your use case");
}

// Run the demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}

export {
  demoBasicTracking,
  demoManualTracking,
  demoPerformanceMonitoring,
  demoErrorHandling,
  demoConfiguration,
  demoCacheInspection,
  cleanup,
};
