import { mineEventPow, validatePowDifficulty } from "./dist/pow.js";

/**
 * Simple PoW test with low difficulty
 */
async function testSimplePow() {
  console.log("🔨 Testing Simple PoW (4 bits)...\n");

  const testEvent = {
    kind: 30072,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["p", "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f"],
      ["d", "test-simple"],
    ],
    content: "test content",
    pubkey: "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f",
  };

  try {
    console.log("Mining with 4 bits difficulty (single-threaded)...");
    const startTime = Date.now();
    const minedEvent = await mineEventPow(testEvent, 4, 1);
    const endTime = Date.now();

    console.log(`✅ Mining completed in ${endTime - startTime}ms`);

    // Find nonce tag
    const nonceTag = minedEvent.tags.find((tag) => tag[0] === "nonce");
    if (nonceTag) {
      console.log(`Nonce: ${nonceTag[1]}, Declared bits: ${nonceTag[2]}`);
    }

    // Validate
    const eventId = minedEvent.id;
    if (eventId) {
      console.log(`Event ID: ${eventId}`);
      const isValid = validatePowDifficulty(eventId, 4);
      console.log(`PoW validation: ${isValid ? "✅ Valid" : "❌ Invalid"}`);

      // Count actual leading zero bits
      let leadingZeros = 0;
      for (let i = 0; i < eventId.length; i++) {
        const char = eventId[i];
        if (char === "0") {
          leadingZeros += 4;
        } else {
          const value = parseInt(char, 16);
          if (value < 8) leadingZeros += 1;
          if (value < 4) leadingZeros += 1;
          if (value < 2) leadingZeros += 1;
          break;
        }
      }
      console.log(`Actual leading zero bits: ${leadingZeros}`);
    }
  } catch (error) {
    console.error("❌ Simple PoW test failed:", error.message);
    console.error(error.stack);
  }
}

testSimplePow().catch(console.error);
