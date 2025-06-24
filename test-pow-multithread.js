import { mineEventPow } from "./dist/pow.js";

/**
 * Test multi-threaded PoW mining
 */
async function testMultiThreadPow() {
  console.log("🔨 Testing Multi-threaded PoW Mining...\n");

  const testEvent = {
    kind: 30072,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["p", "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f"],
      ["d", "test-multithread"],
    ],
    content: "test content for multithread",
    pubkey: "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f",
  };

  try {
    console.log("Mining with 8 bits difficulty (4 threads)...");
    const startTime = Date.now();
    const minedEvent = await mineEventPow(testEvent, 8, 4);
    const endTime = Date.now();

    console.log(
      `✅ Multi-threaded mining completed in ${endTime - startTime}ms`
    );

    // Find nonce tag
    const nonceTag = minedEvent.tags.find((tag) => tag[0] === "nonce");
    if (nonceTag) {
      console.log(`Nonce: ${nonceTag[1]}, Declared bits: ${nonceTag[2]}`);
    }

    // Validate
    const eventId = minedEvent.id;
    if (eventId) {
      console.log(`Event ID: ${eventId}`);

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
      console.log(`Actual leading zero bits: ${leadingZeros} (required: 8)`);
      console.log(
        `PoW validation: ${leadingZeros >= 8 ? "✅ Valid" : "❌ Invalid"}`
      );
    }
  } catch (error) {
    console.error("❌ Multi-threaded PoW test failed:", error.message);
    console.error(error.stack);
  }
}

testMultiThreadPow().catch(console.error);
