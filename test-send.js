import { send } from "./dist/send.js";
import { loadConfig } from "./dist/utils.js";

async function testSend() {
  try {
    console.log("Testing NostrMQ send functionality...");

    // Load config to get our pubkey for testing
    const config = loadConfig();
    console.log("Loaded config with pubkey:", config.pubkey);

    // Test sending a message to ourselves
    const testPayload = {
      message: "Hello NostrMQ!",
      timestamp: Date.now(),
      test: true,
    };

    console.log("Sending test message...");
    const eventId = await send({
      payload: testPayload,
      target: config.pubkey, // Send to ourselves for testing
      timeoutMs: 5000,
    });

    console.log("✅ Message sent successfully!");
    console.log("Event ID:", eventId);
  } catch (error) {
    console.error("❌ Send test failed:", error.message);
    process.exit(1);
  }
}

// Run the test
testSend();
