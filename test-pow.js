import {
  mineEventPow,
  validatePowDifficulty,
  hasValidPow,
} from "./dist/pow.js";
import { getEventHash } from "nostr-tools";

/**
 * Test PoW mining functionality
 */
async function testPow() {
  console.log("🔨 Testing PoW Mining Functionality...\n");

  // Test event template
  const testEvent = {
    kind: 30072,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["p", "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f"],
      ["d", "test-message"],
    ],
    content: "test encrypted content",
    pubkey: "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f",
  };

  // Test 1: Single-threaded PoW mining with difficulty 8
  console.log("Test 1: Single-threaded PoW mining (8 bits)...");
  try {
    const startTime = Date.now();
    const minedEvent = await mineEventPow(testEvent, 8, 1);
    const endTime = Date.now();

    console.log(`✅ Mining completed in ${endTime - startTime}ms`);
    console.log(`Event ID: ${minedEvent.id || getEventHash(minedEvent)}`);

    // Find nonce tag
    const nonceTag = minedEvent.tags.find((tag) => tag[0] === "nonce");
    if (nonceTag) {
      console.log(`Nonce: ${nonceTag[1]}, Declared bits: ${nonceTag[2]}`);
    }

    // Validate the PoW
    const eventId = minedEvent.id || getEventHash(minedEvent);
    const isValid = validatePowDifficulty(eventId, 8);
    console.log(`PoW validation: ${isValid ? "✅ Valid" : "❌ Invalid"}`);

    // Test hasValidPow function
    const hasValid = hasValidPow(minedEvent, 8);
    console.log(`hasValidPow check: ${hasValid ? "✅ Valid" : "❌ Invalid"}`);
  } catch (error) {
    console.error("❌ Single-threaded mining failed:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 2: Multi-threaded PoW mining with difficulty 10
  console.log("Test 2: Multi-threaded PoW mining (10 bits, 4 threads)...");
  try {
    const startTime = Date.now();
    const minedEvent = await mineEventPow(testEvent, 10, 4);
    const endTime = Date.now();

    console.log(`✅ Mining completed in ${endTime - startTime}ms`);
    console.log(`Event ID: ${minedEvent.id || getEventHash(minedEvent)}`);

    // Find nonce tag
    const nonceTag = minedEvent.tags.find((tag) => tag[0] === "nonce");
    if (nonceTag) {
      console.log(`Nonce: ${nonceTag[1]}, Declared bits: ${nonceTag[2]}`);
    }

    // Validate the PoW
    const eventId = minedEvent.id || getEventHash(minedEvent);
    const isValid = validatePowDifficulty(eventId, 10);
    console.log(`PoW validation: ${isValid ? "✅ Valid" : "❌ Invalid"}`);
  } catch (error) {
    console.error("❌ Multi-threaded mining failed:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 3: No PoW (difficulty 0)
  console.log("Test 3: No PoW mining (0 bits)...");
  try {
    const minedEvent = await mineEventPow(testEvent, 0, 1);
    console.log("✅ No PoW mining completed (should return original event)");
    console.log(`Event has ${minedEvent.tags.length} tags`);

    // Should not have nonce tag
    const nonceTag = minedEvent.tags.find((tag) => tag[0] === "nonce");
    console.log(
      `Nonce tag present: ${
        nonceTag ? "❌ Yes (unexpected)" : "✅ No (expected)"
      }`
    );
  } catch (error) {
    console.error("❌ No PoW test failed:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 4: Validation functions
  console.log("Test 4: Testing validation functions...");

  // Test validatePowDifficulty with known values
  const testCases = [
    { hash: "000abc123", bits: 12, expected: true },
    { hash: "000abc123", bits: 16, expected: false },
    { hash: "00abc123", bits: 8, expected: true },
    { hash: "0abc123", bits: 4, expected: true },
    { hash: "abc123", bits: 4, expected: false },
  ];

  testCases.forEach(({ hash, bits, expected }, index) => {
    const result = validatePowDifficulty(hash, bits);
    const status = result === expected ? "✅" : "❌";
    console.log(
      `Test 4.${
        index + 1
      }: Hash "${hash}" with ${bits} bits -> ${status} ${result} (expected ${expected})`
    );
  });

  console.log("\n🎉 PoW testing completed!");
}

// Run the test
testPow().catch(console.error);
