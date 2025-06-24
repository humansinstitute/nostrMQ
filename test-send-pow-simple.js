import { send } from "./dist/index.js";

/**
 * Simple test of send function with PoW
 */
async function testSendPowSimple() {
  console.log("🔨 Testing Send Function with Simple PoW...\n");

  // Set environment variables
  process.env.NOSTR_PRIVKEY =
    "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f";
  process.env.NOSTR_RELAYS = "wss://relay.damus.io";
  process.env.NOSTR_POW_DIFFICULTY = "4";
  process.env.NOSTR_POW_THREADS = "1";

  const testTarget =
    "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f";

  // Test: Send with 4-bit PoW
  console.log("Testing send with 4-bit PoW...");
  try {
    const startTime = Date.now();
    const eventId = await send({
      payload: { message: "Test message with 4-bit PoW" },
      target: testTarget,
      pow: 4,
      timeoutMs: 15000,
    });
    const endTime = Date.now();

    console.log(`✅ Message sent with PoW in ${endTime - startTime}ms`);
    console.log(`Event ID: ${eventId}`);

    // Count leading zero bits
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

    console.log(`Leading zero bits: ${leadingZeros} (required: 4)`);
    console.log(
      `PoW validation: ${leadingZeros >= 4 ? "✅ Valid" : "❌ Invalid"}`
    );
  } catch (error) {
    console.error("❌ Send with PoW failed:", error.message);
    console.error(error.stack);
  }

  console.log("\n🎉 Send function PoW integration test completed!");
}

testSendPowSimple().catch(console.error);
