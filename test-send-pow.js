import { send } from "./dist/index.js";

/**
 * Test send function with PoW integration
 */
async function testSendWithPow() {
  console.log("🔨 Testing Send Function with PoW Integration...\n");

  // Set environment variables for testing
  process.env.NOSTR_PRIVKEY =
    "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f";
  process.env.NOSTR_RELAYS = "wss://relay.damus.io";
  process.env.NOSTR_POW_DIFFICULTY = "8";
  process.env.NOSTR_POW_THREADS = "2";

  const testTarget =
    "b2139bfb1fc34b81f6f5477a492b544e48d48d959ca2c5902e5cd51f73601b3f";

  // Test 1: Send with PoW enabled via environment variable
  console.log("Test 1: Send with PoW enabled via environment (8 bits)...");
  try {
    const startTime = Date.now();
    const eventId = await send({
      payload: { message: "Test message with PoW from env" },
      target: testTarget,
      pow: true, // Use environment difficulty
      timeoutMs: 30000, // Longer timeout for PoW mining
    });
    const endTime = Date.now();

    console.log(`✅ Message sent with PoW in ${endTime - startTime}ms`);
    console.log(`Event ID: ${eventId}`);

    // Verify the event ID has the required difficulty
    const leadingZeros = eventId.match(/^0*/)[0].length * 4;
    console.log(`Leading zero bits: ${leadingZeros} (required: 8)`);
    console.log(
      `PoW validation: ${leadingZeros >= 8 ? "✅ Valid" : "❌ Invalid"}`
    );
  } catch (error) {
    console.error("❌ Send with env PoW failed:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 2: Send with explicit PoW difficulty
  console.log("Test 2: Send with explicit PoW difficulty (6 bits)...");
  try {
    const startTime = Date.now();
    const eventId = await send({
      payload: { message: "Test message with explicit PoW" },
      target: testTarget,
      pow: 6, // Explicit difficulty
      timeoutMs: 30000,
    });
    const endTime = Date.now();

    console.log(
      `✅ Message sent with explicit PoW in ${endTime - startTime}ms`
    );
    console.log(`Event ID: ${eventId}`);

    // Verify the event ID has the required difficulty
    const leadingZeros = eventId.match(/^0*/)[0].length * 4;
    console.log(`Leading zero bits: ${leadingZeros} (required: 6)`);
    console.log(
      `PoW validation: ${leadingZeros >= 6 ? "✅ Valid" : "❌ Invalid"}`
    );
  } catch (error) {
    console.error("❌ Send with explicit PoW failed:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 3: Send with PoW disabled
  console.log("Test 3: Send with PoW disabled...");
  try {
    const startTime = Date.now();
    const eventId = await send({
      payload: { message: "Test message without PoW" },
      target: testTarget,
      pow: false, // Explicitly disabled
      timeoutMs: 10000,
    });
    const endTime = Date.now();

    console.log(`✅ Message sent without PoW in ${endTime - startTime}ms`);
    console.log(`Event ID: ${eventId}`);

    // Should be much faster without PoW
    console.log(
      `Speed check: ${
        endTime - startTime < 5000 ? "✅ Fast (no PoW)" : "❌ Slow (unexpected)"
      }`
    );
  } catch (error) {
    console.error("❌ Send without PoW failed:", error.message);
  }

  console.log("\n" + "=".repeat(50) + "\n");

  // Test 4: Send with zero difficulty
  console.log("Test 4: Send with zero PoW difficulty...");
  try {
    const startTime = Date.now();
    const eventId = await send({
      payload: { message: "Test message with zero PoW" },
      target: testTarget,
      pow: 0, // Zero difficulty
      timeoutMs: 10000,
    });
    const endTime = Date.now();

    console.log(`✅ Message sent with zero PoW in ${endTime - startTime}ms`);
    console.log(`Event ID: ${eventId}`);

    // Should be fast like no PoW
    console.log(
      `Speed check: ${
        endTime - startTime < 5000
          ? "✅ Fast (zero PoW)"
          : "❌ Slow (unexpected)"
      }`
    );
  } catch (error) {
    console.error("❌ Send with zero PoW failed:", error.message);
  }

  console.log("\n🎉 Send function PoW integration testing completed!");
}

// Run the test
testSendWithPow().catch(console.error);
