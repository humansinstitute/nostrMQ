/**
 * NostrMQ Basic Usage Example
 *
 * This example demonstrates simple send and receive functionality
 * without proof-of-work mining.
 *
 * Prerequisites:
 * 1. Set environment variables:
 *    - NOSTRMQ_PRIVKEY=your_private_key_hex
 *    - NOSTR_RELAYS=wss://relay1.com,wss://relay2.com
 * 2. Run: node examples/basic-usage.js
 */

import { send, receive } from "../dist/index.js";

async function basicUsageExample() {
  console.log("🚀 NostrMQ Basic Usage Example\n");

  // Example recipient pubkey (replace with actual recipient)
  const targetPubkey =
    "02a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789a";

  try {
    // 1. Set up message receiver
    console.log("📡 Setting up message receiver...");
    const subscription = receive({
      onMessage: async (payload, sender, rawEvent) => {
        console.log("\n📨 Received message:");
        console.log("  From:", sender);
        console.log("  Payload:", JSON.stringify(payload, null, 2));
        console.log("  Event ID:", rawEvent.id);
        console.log(
          "  Timestamp:",
          new Date(rawEvent.created_at * 1000).toISOString()
        );
      },
    });

    console.log("✅ Receiver started, listening for messages...\n");

    // 2. Send a simple message
    console.log("📤 Sending a simple message...");
    const eventId1 = await send({
      target: targetPubkey,
      payload: {
        type: "greeting",
        message: "Hello from NostrMQ!",
        timestamp: new Date().toISOString(),
      },
    });
    console.log("✅ Message sent with event ID:", eventId1);

    // 3. Send a structured data message
    console.log("\n📤 Sending structured data...");
    const eventId2 = await send({
      target: targetPubkey,
      payload: {
        type: "data",
        operation: "user_update",
        data: {
          userId: 12345,
          name: "Alice Smith",
          email: "alice@example.com",
          preferences: {
            notifications: true,
            theme: "dark",
          },
        },
        metadata: {
          version: "1.0",
          source: "user-service",
        },
      },
    });
    console.log("✅ Structured data sent with event ID:", eventId2);

    // 4. Send with custom response address
    console.log("\n📤 Sending with custom response address...");
    const eventId3 = await send({
      target: targetPubkey,
      payload: {
        type: "request",
        action: "get_status",
        requestId: "req_" + Date.now(),
      },
      response:
        "03b1c2d3e4f5a6789bcdef0123456789abcdef0123456789abcdef0123456789b", // Custom response pubkey
    });
    console.log(
      "✅ Message with custom response sent with event ID:",
      eventId3
    );

    // 5. Demonstrate async iteration
    console.log(
      "\n🔄 Demonstrating async iteration (will process 3 messages then stop)..."
    );
    let messageCount = 0;
    for await (const { payload, sender, rawEvent } of subscription) {
      messageCount++;
      console.log(
        `📨 Async message ${messageCount}:`,
        payload.type || "unknown"
      );

      if (messageCount >= 3) {
        console.log("✅ Processed 3 messages, stopping iteration");
        break;
      }
    }

    // 6. Clean up
    console.log("\n🧹 Cleaning up...");
    subscription.close();
    console.log("✅ Subscription closed");
  } catch (error) {
    console.error("❌ Error in basic usage example:", error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down gracefully...");
  process.exit(0);
});

// Run the example
basicUsageExample().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
