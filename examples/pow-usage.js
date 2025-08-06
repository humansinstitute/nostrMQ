/**
 * NostrMQ Proof-of-Work Usage Example
 *
 * This example demonstrates sending messages with proof-of-work mining
 * for spam prevention and priority messaging.
 *
 * Prerequisites:
 * 1. Set environment variables:
 *    - NOSTRMQ_PRIVKEY=your_private_key_hex
 *    - NOSTR_RELAYS=wss://relay1.com,wss://relay2.com
 *    - NOSTR_POW_DIFFICULTY=8 (optional, default PoW difficulty)
 *    - NOSTRMQ_POW_THREADS=4 (optional, worker threads for mining)
 * 2. Run: node examples/pow-usage.js
 */

import {
  send,
  receive,
  mineEventPow,
  validatePowDifficulty,
  hasValidPow,
} from "../dist/index.js";

async function powUsageExample() {
  console.log("⚡ NostrMQ Proof-of-Work Usage Example\n");

  // Example recipient pubkey (replace with actual recipient)
  const targetPubkey =
    "02a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789a";

  try {
    // 1. Set up message receiver that validates PoW
    console.log("📡 Setting up PoW-aware message receiver...");
    const subscription = receive({
      onMessage: async (payload, sender, rawEvent) => {
        console.log("\n📨 Received message:");
        console.log("  From:", sender);
        console.log("  Event ID:", rawEvent.id);

        // Check if message has proof-of-work
        const has4BitPow = hasValidPow(rawEvent, 4);
        const has8BitPow = hasValidPow(rawEvent, 8);
        const has12BitPow = hasValidPow(rawEvent, 12);

        console.log("  PoW Status:");
        console.log("    4-bit PoW:", has4BitPow ? "✅" : "❌");
        console.log("    8-bit PoW:", has8BitPow ? "✅" : "❌");
        console.log("    12-bit PoW:", has12BitPow ? "✅" : "❌");

        // Find nonce tag for details
        const nonceTag = rawEvent.tags.find((tag) => tag[0] === "nonce");
        if (nonceTag) {
          console.log("    Nonce:", nonceTag[1]);
          console.log("    Declared bits:", nonceTag[2]);
        }

        console.log("  Payload:", JSON.stringify(payload, null, 2));
      },
    });

    console.log("✅ PoW-aware receiver started\n");

    // 2. Send message without PoW (default)
    console.log("📤 Sending message without PoW...");
    const startTime1 = Date.now();
    const eventId1 = await send({
      target: targetPubkey,
      payload: {
        type: "normal",
        message: "Regular message without PoW",
        priority: "low",
      },
      pow: false, // Explicitly disable PoW
    });
    const time1 = Date.now() - startTime1;
    console.log(`✅ No-PoW message sent in ${time1}ms, event ID: ${eventId1}`);

    // 3. Send message with 4-bit PoW (easy)
    console.log("\n📤 Sending message with 4-bit PoW...");
    const startTime2 = Date.now();
    const eventId2 = await send({
      target: targetPubkey,
      payload: {
        type: "priority",
        message: "Message with light PoW",
        priority: "medium",
      },
      pow: 4, // 4 bits difficulty
    });
    const time2 = Date.now() - startTime2;
    console.log(
      `✅ 4-bit PoW message sent in ${time2}ms, event ID: ${eventId2}`
    );

    // Validate the PoW
    const isValid4Bit = validatePowDifficulty(eventId2, 4);
    console.log(
      `   PoW validation (4-bit): ${isValid4Bit ? "✅ Valid" : "❌ Invalid"}`
    );

    // 4. Send message with 8-bit PoW (moderate)
    console.log("\n📤 Sending message with 8-bit PoW...");
    const startTime3 = Date.now();
    const eventId3 = await send({
      target: targetPubkey,
      payload: {
        type: "important",
        message: "Important message with moderate PoW",
        priority: "high",
        data: {
          urgency: "high",
          category: "system-alert",
        },
      },
      pow: 8, // 8 bits difficulty
    });
    const time3 = Date.now() - startTime3;
    console.log(
      `✅ 8-bit PoW message sent in ${time3}ms, event ID: ${eventId3}`
    );

    // Validate the PoW
    const isValid8Bit = validatePowDifficulty(eventId3, 8);
    console.log(
      `   PoW validation (8-bit): ${isValid8Bit ? "✅ Valid" : "❌ Invalid"}`
    );

    // 5. Send message using environment config PoW
    console.log("\n📤 Sending message with environment config PoW...");
    const startTime4 = Date.now();
    const eventId4 = await send({
      target: targetPubkey,
      payload: {
        type: "config",
        message: "Message using environment PoW config",
        priority: "default",
      },
      pow: true, // Use environment NOSTRMQ_POW_DIFFICULTY
    });
    const time4 = Date.now() - startTime4;
    console.log(
      `✅ Config PoW message sent in ${time4}ms, event ID: ${eventId4}`
    );

    // 6. Demonstrate multi-threaded PoW mining (higher difficulty)
    console.log("\n⚡ Demonstrating multi-threaded PoW mining (12-bit)...");
    const startTime5 = Date.now();
    const eventId5 = await send({
      target: targetPubkey,
      payload: {
        type: "critical",
        message: "Critical message with high PoW",
        priority: "critical",
        data: {
          alert: "system-critical",
          requires_immediate_attention: true,
        },
      },
      pow: 12, // 12 bits difficulty - will use multiple threads
    });
    const time5 = Date.now() - startTime5;
    console.log(
      `✅ 12-bit PoW message sent in ${time5}ms, event ID: ${eventId5}`
    );

    // Validate the high-difficulty PoW
    const isValid12Bit = validatePowDifficulty(eventId5, 12);
    console.log(
      `   PoW validation (12-bit): ${isValid12Bit ? "✅ Valid" : "❌ Invalid"}`
    );

    // 7. Performance comparison
    console.log("\n📊 Performance Comparison:");
    console.log(`   No PoW:    ${time1}ms`);
    console.log(
      `   4-bit PoW: ${time2}ms (${(time2 / time1).toFixed(1)}x slower)`
    );
    console.log(
      `   8-bit PoW: ${time3}ms (${(time3 / time1).toFixed(1)}x slower)`
    );
    console.log(
      `   Config PoW: ${time4}ms (${(time4 / time1).toFixed(1)}x slower)`
    );
    console.log(
      `   12-bit PoW: ${time5}ms (${(time5 / time1).toFixed(1)}x slower)`
    );

    // 8. Wait for messages to be received
    console.log("\n⏳ Waiting for messages to be received...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 9. Clean up
    console.log("\n🧹 Cleaning up...");
    subscription.close();
    console.log("✅ Subscription closed");

    console.log("\n💡 PoW Tips:");
    console.log(
      "   • Higher difficulty = more computational work = better spam protection"
    );
    console.log("   • Use 4-8 bits for normal priority messages");
    console.log("   • Use 12+ bits for critical/urgent messages");
    console.log(
      "   • Multi-threading automatically used for difficulty > 8 bits"
    );
    console.log("   • Set NOSTRMQ_POW_THREADS to control worker thread count");
  } catch (error) {
    console.error("❌ Error in PoW usage example:", error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down gracefully...");
  process.exit(0);
});

// Run the example
powUsageExample().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
