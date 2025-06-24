import { send } from "./dist/send.js";
import { receive } from "./dist/receive.js";

// Integration test for send/receive round-trip
async function testIntegration() {
  console.log("🧪 Starting NostrMQ integration test...");

  let messageReceived = false;
  let receivedPayload = null;

  try {
    // Set up receiver first
    console.log("📡 Setting up receiver...");
    const subscription = receive({
      onMessage: (payload, sender, rawEvent) => {
        console.log("✅ Message received successfully!");
        console.log("  Payload:", JSON.stringify(payload, null, 2));
        console.log("  Sender:", sender);
        console.log("  Event ID:", rawEvent.id);

        messageReceived = true;
        receivedPayload = payload;
      },
      autoAck: false,
    });

    // Wait a moment for connection
    console.log("⏳ Waiting for relay connections...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Send a test message
    console.log("📤 Sending test message...");
    const testPayload = {
      message: "Integration test message",
      timestamp: Date.now(),
      testId: Math.random().toString(36).substr(2, 9),
    };

    // Get our own pubkey from config
    const config = JSON.parse(process.env.NOSTR_CONFIG || "{}");
    const pubkey =
      process.env.NOSTR_PUBKEY ||
      "33a031daebc507ed8bde52a1ee6a3b470e793dcaa23bca740fb363472978d997";

    const eventId = await send({
      payload: testPayload,
      target: pubkey, // Send to ourselves
    });

    console.log("📤 Message sent with event ID:", eventId);

    // Wait for message to be received
    console.log("⏳ Waiting for message reception...");
    let attempts = 0;
    while (!messageReceived && attempts < 30) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
      if (attempts % 5 === 0) {
        console.log(`⏳ Still waiting... (${attempts}/30 seconds)`);
      }
    }

    // Check results
    if (messageReceived) {
      console.log("🎉 Integration test PASSED!");
      console.log("✅ Round-trip communication successful");

      // Verify payload integrity
      if (JSON.stringify(receivedPayload) === JSON.stringify(testPayload)) {
        console.log("✅ Payload integrity verified");
      } else {
        console.log("⚠️  Payload mismatch detected");
        console.log("  Sent:", JSON.stringify(testPayload));
        console.log("  Received:", JSON.stringify(receivedPayload));
      }
    } else {
      console.log(
        "❌ Integration test FAILED - message not received within timeout"
      );
    }

    // Cleanup
    subscription.close();
    console.log("🧹 Cleanup completed");
  } catch (error) {
    console.error("❌ Integration test failed with error:", error);
    process.exit(1);
  }
}

testIntegration();
