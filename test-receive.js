import { receive } from "./dist/receive.js";

// Test the receive functionality
async function testReceive() {
  console.log("Starting receive test...");

  try {
    // Create a subscription to receive messages
    const subscription = receive({
      onMessage: (payload, sender, rawEvent) => {
        console.log("\n📨 Received message:");
        console.log("  Payload:", payload);
        console.log("  Sender:", sender);
        console.log("  Event ID:", rawEvent.id);
        console.log(
          "  Created at:",
          new Date(rawEvent.created_at * 1000).toISOString()
        );
      },
      autoAck: false, // Don't auto-acknowledge for now
    });

    console.log("✅ Subscription created successfully");
    console.log("🔄 Listening for messages...");
    console.log("💡 Send a message using test-send.js to see it received here");
    console.log("⏹️  Press Ctrl+C to stop");

    // Test async iterator functionality
    setTimeout(async () => {
      console.log("\n🔄 Testing async iterator...");
      let messageCount = 0;

      try {
        for await (const message of subscription) {
          messageCount++;
          console.log(`📨 Iterator message ${messageCount}:`, {
            payload: message.payload,
            sender: message.sender,
            eventId: message.rawEvent.id,
          });

          // Stop after 3 messages to avoid infinite loop in test
          if (messageCount >= 3) {
            console.log("🛑 Stopping iterator test after 3 messages");
            break;
          }
        }
      } catch (error) {
        console.error("❌ Iterator error:", error);
      }
    }, 5000); // Start iterator test after 5 seconds

    // Keep the process running
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down...");
      subscription.close();
      console.log("✅ Subscription closed");
      process.exit(0);
    });

    // Keep alive
    setInterval(() => {
      // Just keep the process running
    }, 1000);
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testReceive();
