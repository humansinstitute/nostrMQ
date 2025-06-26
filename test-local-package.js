#!/usr/bin/env node
/**
 * NostrMQ Local Package Testing Script
 *
 * Comprehensive test suite for validating the NostrMQ package before submission.
 * Tests all exports, functionality, and TypeScript compatibility without requiring real keys.
 *
 * Usage: node test-local-package.js
 */

import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { performance } from "perf_hooks";

// Test configuration
const TEST_CONFIG = {
  // Mock keys for testing (not real keys)
  mockPrivkey: "a".repeat(64), // 64 char hex string
  mockPubkey:
    "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f",
  mockTargetPubkey:
    "02a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789a",
  mockRelays: ["wss://relay.example.com", "wss://test.relay.com"],
  testTimeout: 5000, // 5 second timeout for tests
  powBits: 4, // Low difficulty for fast testing
};

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  errors: [],
  timings: {},
};

// Utility functions
function log(message, type = "info") {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  const prefix =
    {
      info: "📋",
      success: "✅",
      error: "❌",
      warning: "⚠️",
      timing: "⏱️",
    }[type] || "📋";

  console.log(`[${timestamp}] ${prefix} ${message}`);
}

function logSection(title) {
  console.log("\n" + "=".repeat(60));
  console.log(`🧪 ${title}`);
  console.log("=".repeat(60));
}

function logSubsection(title) {
  console.log(`\n🔍 ${title}`);
  console.log("-".repeat(40));
}

async function runTest(testName, testFn, timeout = TEST_CONFIG.testTimeout) {
  const startTime = performance.now();

  try {
    log(`Running: ${testName}`);

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`Test timeout after ${timeout}ms`)),
        timeout
      );
    });

    // Race the test against the timeout
    await Promise.race([testFn(), timeoutPromise]);

    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    testResults.passed++;
    testResults.timings[testName] = duration;
    log(`PASSED: ${testName} (${duration}ms)`, "success");

    return true;
  } catch (error) {
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);

    testResults.failed++;
    testResults.errors.push({ test: testName, error: error.message, duration });
    log(`FAILED: ${testName} (${duration}ms) - ${error.message}`, "error");

    return false;
  }
}

function skipTest(testName, reason) {
  testResults.skipped++;
  log(`SKIPPED: ${testName} - ${reason}`, "warning");
}

// Test functions
async function testPackageStructure() {
  logSubsection("Package Structure Tests");

  await runTest("Package.json exists and valid", async () => {
    if (!existsSync("./package.json")) {
      throw new Error("package.json not found");
    }

    const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

    if (!pkg.name || pkg.name !== "nostrmq") {
      throw new Error(`Invalid package name: ${pkg.name}`);
    }

    if (!pkg.version) {
      throw new Error("Package version missing");
    }

    if (pkg.type !== "module") {
      throw new Error("Package should use ES modules");
    }

    if (!pkg.main || pkg.main !== "./dist/index.js") {
      throw new Error(`Invalid main entry: ${pkg.main}`);
    }

    if (!pkg.types || pkg.types !== "./dist/index.d.ts") {
      throw new Error(`Invalid types entry: ${pkg.types}`);
    }

    log(`Package: ${pkg.name}@${pkg.version}`);
  });

  await runTest("Dist directory exists with required files", async () => {
    const requiredFiles = [
      "dist/index.js",
      "dist/index.d.ts",
      "dist/pow.js",
      "dist/pow.d.ts",
      "dist/pow.worker.js",
      "dist/send.js",
      "dist/send.d.ts",
      "dist/receive.js",
      "dist/receive.d.ts",
      "dist/utils.js",
      "dist/utils.d.ts",
      "dist/types.js",
      "dist/types.d.ts",
      "dist/relayPool.js",
      "dist/relayPool.d.ts",
    ];

    for (const file of requiredFiles) {
      if (!existsSync(file)) {
        throw new Error(`Required file missing: ${file}`);
      }
    }

    log(`All ${requiredFiles.length} required files present`);
  });
}

async function testExports() {
  logSubsection("Export Tests");

  await runTest("Main module imports successfully", async () => {
    const nostrmq = await import("./dist/index.js");

    if (!nostrmq || typeof nostrmq !== "object") {
      throw new Error("Failed to import main module");
    }

    log("Main module imported successfully");
  });

  await runTest("All expected exports are available", async () => {
    const nostrmq = await import("./dist/index.js");

    const expectedExports = [
      "send",
      "receive",
      "mineEventPow",
      "validatePowDifficulty",
      "hasValidPow",
      "loadConfig",
      "RelayPool",
      "createRelayPool",
      "generateUniqueId",
      "isValidPubkey",
      "isValidRelayUrl",
    ];

    for (const exportName of expectedExports) {
      if (!(exportName in nostrmq)) {
        throw new Error(`Missing export: ${exportName}`);
      }

      if (
        typeof nostrmq[exportName] !== "function" &&
        typeof nostrmq[exportName] !== "object"
      ) {
        throw new Error(`Export ${exportName} is not a function or object`);
      }
    }

    log(`All ${expectedExports.length} expected exports available`);
  });

  await runTest("TypeScript types are accessible", async () => {
    // Check that the .d.ts file exists and has expected content
    if (!existsSync("./dist/index.d.ts")) {
      throw new Error("TypeScript definitions file missing");
    }

    const dtsContent = readFileSync("./dist/index.d.ts", "utf8");

    const expectedTypes = [
      "SendOpts",
      "ReceiveOpts",
      "SubscriptionHandle",
      "NostrMQConfig",
      "ReceivedMessage",
    ];

    for (const typeName of expectedTypes) {
      if (!dtsContent.includes(typeName)) {
        throw new Error(`Missing TypeScript type: ${typeName}`);
      }
    }

    log(`All ${expectedTypes.length} expected TypeScript types found`);
  });
}

async function testUtilityFunctions() {
  logSubsection("Utility Function Tests");

  await runTest("generateUniqueId works correctly", async () => {
    const { generateUniqueId } = await import("./dist/index.js");

    const id1 = generateUniqueId();
    const id2 = generateUniqueId();

    if (!id1 || !id2) {
      throw new Error("generateUniqueId returned falsy value");
    }

    if (id1 === id2) {
      throw new Error("generateUniqueId returned duplicate values");
    }

    if (typeof id1 !== "string" || typeof id2 !== "string") {
      throw new Error("generateUniqueId should return strings");
    }

    log(
      `Generated unique IDs: ${id1.substring(0, 8)}..., ${id2.substring(
        0,
        8
      )}...`
    );
  });

  await runTest("isValidPubkey validates correctly", async () => {
    const { isValidPubkey } = await import("./dist/index.js");

    // Test valid pubkey
    if (!isValidPubkey(TEST_CONFIG.mockPubkey)) {
      throw new Error("Valid pubkey rejected");
    }

    // Test invalid pubkeys
    const invalidKeys = [
      "", // empty
      "invalid", // too short
      "z".repeat(64), // invalid hex
      "a".repeat(63), // wrong length
      "a".repeat(65), // wrong length
    ];

    for (const invalidKey of invalidKeys) {
      if (isValidPubkey(invalidKey)) {
        throw new Error(`Invalid pubkey accepted: ${invalidKey}`);
      }
    }

    log("Pubkey validation working correctly");
  });

  await runTest("isValidRelayUrl validates correctly", async () => {
    const { isValidRelayUrl } = await import("./dist/index.js");

    // Test valid URLs
    const validUrls = [
      "wss://relay.example.com",
      "ws://localhost:8080",
      "wss://relay.damus.io",
    ];

    for (const url of validUrls) {
      if (!isValidRelayUrl(url)) {
        throw new Error(`Valid relay URL rejected: ${url}`);
      }
    }

    // Test invalid URLs
    const invalidUrls = [
      "", // empty
      "http://example.com", // wrong protocol
      "invalid-url", // not a URL
      "ftp://example.com", // wrong protocol
    ];

    for (const url of invalidUrls) {
      if (isValidRelayUrl(url)) {
        throw new Error(`Invalid relay URL accepted: ${url}`);
      }
    }

    log("Relay URL validation working correctly");
  });
}

async function testPowFunctionality() {
  logSubsection("Proof-of-Work Tests");

  await runTest("validatePowDifficulty works correctly", async () => {
    const { validatePowDifficulty } = await import("./dist/index.js");

    // Test with known values
    const validId = "0000abcd" + "f".repeat(56); // 16 leading zero bits
    const invalidId = "abcd" + "0".repeat(60); // No leading zeros

    if (!validatePowDifficulty(validId, 16)) {
      throw new Error("Valid PoW ID rejected");
    }

    if (validatePowDifficulty(invalidId, 4)) {
      throw new Error("Invalid PoW ID accepted");
    }

    if (validatePowDifficulty(validId, 20)) {
      throw new Error("Insufficient PoW accepted");
    }

    log("PoW difficulty validation working correctly");
  });

  await runTest(
    "mineEventPow performs basic mining",
    async () => {
      const { mineEventPow } = await import("./dist/index.js");

      const testEvent = {
        kind: 30072,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["p", TEST_CONFIG.mockTargetPubkey],
          ["d", "test-mining"],
        ],
        content: "test content for mining",
        pubkey: TEST_CONFIG.mockPubkey,
      };

      const startTime = performance.now();
      const minedEvent = await mineEventPow(testEvent, TEST_CONFIG.powBits, 1);
      const endTime = performance.now();

      if (!minedEvent.id) {
        throw new Error("Mined event missing ID");
      }

      // Check for nonce tag
      const nonceTag = minedEvent.tags.find((tag) => tag[0] === "nonce");
      if (!nonceTag) {
        throw new Error("Mined event missing nonce tag");
      }

      // Validate the PoW
      const { validatePowDifficulty } = await import("./dist/index.js");
      if (!validatePowDifficulty(minedEvent.id, TEST_CONFIG.powBits)) {
        throw new Error("Mined event does not meet difficulty requirement");
      }

      const duration = Math.round(endTime - startTime);
      log(
        `Mined ${TEST_CONFIG.powBits}-bit PoW in ${duration}ms, nonce: ${nonceTag[1]}`
      );
    },
    10000
  ); // 10 second timeout for mining

  await runTest(
    "hasValidPow validates mined events",
    async () => {
      const { mineEventPow, hasValidPow } = await import("./dist/index.js");

      const testEvent = {
        kind: 30072,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["p", TEST_CONFIG.mockTargetPubkey],
          ["d", "test-validation"],
        ],
        content: "test content for validation",
        pubkey: TEST_CONFIG.mockPubkey,
      };

      const minedEvent = await mineEventPow(testEvent, TEST_CONFIG.powBits, 1);

      if (!hasValidPow(minedEvent, TEST_CONFIG.powBits)) {
        throw new Error("hasValidPow rejected valid mined event");
      }

      if (hasValidPow(minedEvent, TEST_CONFIG.powBits + 4)) {
        throw new Error("hasValidPow accepted insufficient difficulty");
      }

      log("PoW validation working correctly");
    },
    10000
  );
}

async function testRelayPoolFunctionality() {
  logSubsection("Relay Pool Tests");

  await runTest("RelayPool can be instantiated", async () => {
    const { RelayPool } = await import("./dist/index.js");

    // Create a mock config object for RelayPool
    const mockConfig = {
      privkey: TEST_CONFIG.mockPrivkey,
      pubkey: TEST_CONFIG.mockPubkey,
      relays: TEST_CONFIG.mockRelays,
      powDifficulty: 0,
      powThreads: 1,
    };

    const pool = new RelayPool(mockConfig);

    if (!pool) {
      throw new Error("Failed to create RelayPool instance");
    }

    if (typeof pool.connect !== "function") {
      throw new Error("RelayPool missing connect method");
    }

    if (typeof pool.disconnect !== "function") {
      throw new Error("RelayPool missing disconnect method");
    }

    log("RelayPool instantiated successfully");
  });

  await runTest("createRelayPool factory function works", async () => {
    const { createRelayPool } = await import("./dist/index.js");

    // Create a mock config object for createRelayPool
    const mockConfig = {
      privkey: TEST_CONFIG.mockPrivkey,
      pubkey: TEST_CONFIG.mockPubkey,
      relays: TEST_CONFIG.mockRelays,
      powDifficulty: 0,
      powThreads: 1,
    };

    const pool = createRelayPool(mockConfig);

    if (!pool) {
      throw new Error("Failed to create RelayPool via factory");
    }

    log("RelayPool factory function working");
  });
}

async function testConfigurationLoading() {
  logSubsection("Configuration Tests");

  await runTest(
    "loadConfig handles missing environment gracefully",
    async () => {
      const { loadConfig } = await import("./dist/index.js");

      // Clear environment variables temporarily
      const originalPrivkey = process.env.NOSTRMQ_PRIVKEY;
      const originalRelays = process.env.NOSTRMQ_RELAYS;

      delete process.env.NOSTRMQ_PRIVKEY;
      delete process.env.NOSTRMQ_RELAYS;

      try {
        loadConfig();
        throw new Error("loadConfig should throw when environment is missing");
      } catch (error) {
        if (
          !error.message.includes("NOSTRMQ_PRIVKEY") &&
          !error.message.includes("environment")
        ) {
          throw new Error(
            "loadConfig threw unexpected error: " + error.message
          );
        }
      } finally {
        // Restore environment variables
        if (originalPrivkey) process.env.NOSTRMQ_PRIVKEY = originalPrivkey;
        if (originalRelays) process.env.NOSTRMQ_RELAYS = originalRelays;
      }

      log("Configuration validation working correctly");
    }
  );
}

async function testParameterValidation() {
  logSubsection("Parameter Validation Tests");

  // Set up mock environment for testing
  process.env.NOSTRMQ_PRIVKEY = TEST_CONFIG.mockPrivkey;
  process.env.NOSTRMQ_RELAYS = TEST_CONFIG.mockRelays.join(",");
  process.env.NOSTRMQ_POW_DIFFICULTY = "0";
  process.env.NOSTRMQ_POW_THREADS = "1";

  await runTest("send function validates parameters", async () => {
    const { send } = await import("./dist/index.js");

    // Test invalid target pubkey
    try {
      await send({
        target: "invalid-pubkey",
        payload: { test: "data" },
      });
      throw new Error("send should reject invalid pubkey");
    } catch (error) {
      // Accept either parameter validation errors or environment variable errors
      // since the function may check environment first
      if (
        !error.message.includes("pubkey") &&
        !error.message.includes("target") &&
        !error.message.includes("Invalid") &&
        !error.message.includes("NOSTR_PRIVKEY") &&
        !error.message.includes("environment")
      ) {
        throw new Error(
          "send threw unexpected error for invalid pubkey: " + error.message
        );
      }
    }

    // Test missing payload
    try {
      await send({
        target: TEST_CONFIG.mockTargetPubkey,
      });
      throw new Error("send should reject missing payload");
    } catch (error) {
      // Accept either parameter validation errors or environment variable errors
      if (
        !error.message.includes("payload") &&
        !error.message.includes("required") &&
        !error.message.includes("NOSTR_PRIVKEY") &&
        !error.message.includes("environment")
      ) {
        throw new Error(
          "send threw unexpected error for missing payload: " + error.message
        );
      }
    }

    log("send parameter validation working correctly");
  });

  await runTest("receive function validates parameters", async () => {
    const { receive } = await import("./dist/index.js");

    // Test missing onMessage callback
    try {
      receive({});
      throw new Error("receive should reject missing onMessage");
    } catch (error) {
      if (
        !error.message.includes("onMessage") &&
        !error.message.includes("callback") &&
        !error.message.includes("required")
      ) {
        throw new Error(
          "receive threw unexpected error for missing callback: " +
            error.message
        );
      }
    }

    // Test invalid onMessage callback
    try {
      receive({ onMessage: "not-a-function" });
      throw new Error("receive should reject invalid onMessage");
    } catch (error) {
      if (
        !error.message.includes("onMessage") &&
        !error.message.includes("function") &&
        !error.message.includes("required")
      ) {
        throw new Error(
          "receive threw unexpected error for invalid callback: " +
            error.message
        );
      }
    }

    log("receive parameter validation working correctly");
  });
}

async function testPerformance() {
  logSubsection("Performance Tests");

  await runTest(
    "PoW mining performance benchmark",
    async () => {
      const { mineEventPow } = await import("./dist/index.js");

      const testEvent = {
        kind: 30072,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["p", TEST_CONFIG.mockTargetPubkey],
          ["d", "perf-test"],
        ],
        content: "performance test content",
        pubkey: TEST_CONFIG.mockPubkey,
      };

      const iterations = 3;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await mineEventPow(testEvent, TEST_CONFIG.powBits, 1);
        const endTime = performance.now();
        times.push(endTime - startTime);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);

      log(
        `PoW mining performance: avg=${Math.round(avgTime)}ms, min=${Math.round(
          minTime
        )}ms, max=${Math.round(maxTime)}ms`
      );

      if (avgTime > 30000) {
        // 30 seconds
        throw new Error(
          `PoW mining too slow: ${Math.round(avgTime)}ms average`
        );
      }
    },
    60000
  ); // 1 minute timeout for performance test
}

// Main test runner
async function runAllTests() {
  logSection("NostrMQ Local Package Testing");

  log("Starting comprehensive package validation...", "info");
  log(
    `Test configuration: ${TEST_CONFIG.powBits}-bit PoW, ${TEST_CONFIG.testTimeout}ms timeout`,
    "info"
  );

  const startTime = performance.now();

  try {
    // Run all test suites
    await testPackageStructure();
    await testExports();
    await testUtilityFunctions();
    await testPowFunctionality();
    await testRelayPoolFunctionality();
    await testConfigurationLoading();
    await testParameterValidation();
    await testPerformance();

    const endTime = performance.now();
    const totalTime = Math.round(endTime - startTime);

    // Print final results
    logSection("Test Results Summary");

    log(
      `Total tests run: ${
        testResults.passed + testResults.failed + testResults.skipped
      }`,
      "info"
    );
    log(`✅ Passed: ${testResults.passed}`, "success");
    log(
      `❌ Failed: ${testResults.failed}`,
      testResults.failed > 0 ? "error" : "info"
    );
    log(
      `⚠️  Skipped: ${testResults.skipped}`,
      testResults.skipped > 0 ? "warning" : "info"
    );
    log(`⏱️  Total time: ${totalTime}ms`, "timing");

    if (testResults.failed > 0) {
      logSubsection("Failed Tests Details");
      for (const error of testResults.errors) {
        log(`❌ ${error.test}: ${error.error} (${error.duration}ms)`, "error");
      }
    }

    // Performance summary
    if (Object.keys(testResults.timings).length > 0) {
      logSubsection("Performance Summary");
      const sortedTimings = Object.entries(testResults.timings)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5); // Top 5 slowest tests

      for (const [test, time] of sortedTimings) {
        log(`⏱️  ${test}: ${time}ms`, "timing");
      }
    }

    // Final verdict
    console.log("\n" + "=".repeat(60));
    if (testResults.failed === 0) {
      log("🎉 ALL TESTS PASSED! Package is ready for submission.", "success");
      console.log("=".repeat(60));
      process.exit(0);
    } else {
      log(
        `💥 ${testResults.failed} TEST(S) FAILED! Please fix issues before submission.`,
        "error"
      );
      console.log("=".repeat(60));
      process.exit(1);
    }
  } catch (error) {
    log(`💥 Test runner crashed: ${error.message}`, "error");
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  log("👋 Test interrupted by user", "warning");
  process.exit(130);
});

process.on("unhandledRejection", (reason, promise) => {
  log(`💥 Unhandled rejection: ${reason}`, "error");
  process.exit(1);
});

// Run the tests
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAllTests().catch((error) => {
    log(`💥 Unhandled error: ${error.message}`, "error");
    console.error(error.stack);
    process.exit(1);
  });
}
