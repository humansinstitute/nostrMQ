/**
 * NostrMQ Advanced Usage Example
 *
 * This example demonstrates advanced features including:
 * - Custom configuration and error handling
 * - Relay pool management
 * - Async iteration patterns
 * - Message filtering and processing
 * - Performance monitoring
 *
 * Prerequisites:
 * 1. Set environment variables:
 *    - NOSTRMQ_PRIVKEY=your_private_key_hex
 *    - NOSTR_RELAYS=wss://relay1.com,wss://relay2.com
 * 2. Run: node examples/advanced-usage.js
 */

import {
  send,
  receive,
  loadConfig,
  RelayPool,
  createRelayPool,
  generateUniqueId,
  isValidPubkey,
  isValidRelayUrl,
  mineEventPow,
  validatePowDifficulty,
} from "../dist/index.js";

class AdvancedNostrMQClient {
  constructor() {
    this.config = null;
    this.subscription = null;
    this.messageStats = {
      sent: 0,
      received: 0,
      errors: 0,
      powMessages: 0,
    };
    this.messageHandlers = new Map();
    this.messageQueue = [];
    this.isProcessing = false;
  }

  async initialize() {
    console.log("🚀 Initializing Advanced NostrMQ Client...");

    try {
      // Load and validate configuration
      this.config = loadConfig();
      console.log("✅ Configuration loaded:");
      console.log(`   Public Key: ${this.config.pubkey}`);
      console.log(`   Relays: ${this.config.relays.join(", ")}`);
      console.log(`   PoW Difficulty: ${this.config.powDifficulty} bits`);
      console.log(`   PoW Threads: ${this.config.powThreads}`);

      // Validate relay URLs
      const invalidRelays = this.config.relays.filter(
        (url) => !isValidRelayUrl(url)
      );
      if (invalidRelays.length > 0) {
        console.warn("⚠️  Invalid relay URLs detected:", invalidRelays);
      }

      return true;
    } catch (error) {
      console.error("❌ Failed to initialize:", error.message);
      return false;
    }
  }

  // Register message handlers by type
  registerHandler(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
    console.log(`📝 Registered handler for message type: ${messageType}`);
  }

  // Start receiving messages with advanced processing
  startReceiving() {
    console.log("\n📡 Starting advanced message receiver...");

    this.subscription = receive({
      onMessage: async (payload, sender, rawEvent) => {
        this.messageStats.received++;

        try {
          // Add to processing queue
          this.messageQueue.push({ payload, sender, rawEvent });

          // Process queue if not already processing
          if (!this.isProcessing) {
            await this.processMessageQueue();
          }
        } catch (error) {
          this.messageStats.errors++;
          console.error("❌ Error processing message:", error.message);
        }
      },
      relays: this.config.relays, // Use custom relay list
    });

    console.log("✅ Advanced receiver started");
    return this.subscription;
  }

  // Process message queue with rate limiting and error handling
  async processMessageQueue() {
    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const { payload, sender, rawEvent } = this.messageQueue.shift();

      try {
        await this.processMessage(payload, sender, rawEvent);

        // Rate limiting - small delay between messages
        await new Promise((resolve) => setTimeout(resolve, 10));
      } catch (error) {
        this.messageStats.errors++;
        console.error("❌ Error in message processing:", error.message);
      }
    }

    this.isProcessing = false;
  }

  // Advanced message processing with type-based routing
  async processMessage(payload, sender, rawEvent) {
    console.log(`\n📨 Processing message from ${sender.substring(0, 8)}...`);

    // Validate sender
    if (!isValidPubkey(sender)) {
      console.warn("⚠️  Invalid sender pubkey, skipping message");
      return;
    }

    // Check for PoW
    const hasPoW = rawEvent.tags.some((tag) => tag[0] === "nonce");
    if (hasPoW) {
      this.messageStats.powMessages++;
      const nonceTag = rawEvent.tags.find((tag) => tag[0] === "nonce");
      const declaredBits = parseInt(nonceTag[2], 10);
      const isValidPoW = validatePowDifficulty(rawEvent.id, declaredBits);
      console.log(
        `   ⚡ PoW: ${declaredBits} bits ${isValidPoW ? "✅" : "❌"}`
      );
    }

    // Extract message type
    const messageType = payload?.type || "unknown";
    console.log(`   📋 Type: ${messageType}`);
    console.log(`   📄 Payload:`, JSON.stringify(payload, null, 4));

    // Route to specific handler
    const handler = this.messageHandlers.get(messageType);
    if (handler) {
      console.log(`   🎯 Routing to ${messageType} handler`);
      await handler(payload, sender, rawEvent);
    } else {
      console.log(`   ❓ No handler for type: ${messageType}`);
      await this.defaultHandler(payload, sender, rawEvent);
    }
  }

  // Default message handler
  async defaultHandler(payload, sender, rawEvent) {
    console.log("   🔄 Using default handler");

    // Auto-reply for certain message types
    if (payload?.requestReply) {
      await this.sendReply(sender, {
        type: "reply",
        originalId: rawEvent.id,
        message: "Message received and processed",
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Send message with advanced options
  async sendMessage(target, payload, options = {}) {
    const {
      pow = false,
      timeout = 5000,
      retries = 3,
      customRelays = null,
    } = options;

    console.log(
      `\n📤 Sending ${payload.type || "unknown"} message to ${target.substring(
        0,
        8
      )}...`
    );

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();

        const eventId = await send({
          target,
          payload,
          pow,
          timeoutMs: timeout,
          relays: customRelays || this.config.relays,
        });

        const duration = Date.now() - startTime;
        this.messageStats.sent++;

        console.log(`✅ Message sent in ${duration}ms (attempt ${attempt})`);
        console.log(`   Event ID: ${eventId}`);

        return eventId;
      } catch (error) {
        lastError = error;
        console.warn(`⚠️  Attempt ${attempt} failed: ${error.message}`);

        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`   ⏳ Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.messageStats.errors++;
    throw new Error(
      `Failed to send message after ${retries} attempts: ${lastError.message}`
    );
  }

  // Send reply to a specific sender
  async sendReply(target, payload, options = {}) {
    return this.sendMessage(
      target,
      {
        ...payload,
        type: payload.type || "reply",
      },
      options
    );
  }

  // Batch send multiple messages
  async sendBatch(messages, options = {}) {
    console.log(`\n📦 Sending batch of ${messages.length} messages...`);

    const results = [];
    const { concurrency = 3, delayMs = 100 } = options;

    // Process in chunks to avoid overwhelming relays
    for (let i = 0; i < messages.length; i += concurrency) {
      const chunk = messages.slice(i, i + concurrency);

      const chunkPromises = chunk.map(
        async ({ target, payload, options: msgOptions }) => {
          try {
            const eventId = await this.sendMessage(target, payload, msgOptions);
            return { success: true, eventId, target, payload };
          } catch (error) {
            return { success: false, error: error.message, target, payload };
          }
        }
      );

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      // Delay between chunks
      if (i + concurrency < messages.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const successful = results.filter((r) => r.success).length;
    console.log(
      `✅ Batch complete: ${successful}/${messages.length} messages sent`
    );

    return results;
  }

  // Get performance statistics
  getStats() {
    return {
      ...this.messageStats,
      uptime: Date.now() - this.startTime,
      queueLength: this.messageQueue.length,
      isProcessing: this.isProcessing,
    };
  }

  // Print statistics
  printStats() {
    const stats = this.getStats();
    console.log("\n📊 Client Statistics:");
    console.log(`   Messages Sent: ${stats.sent}`);
    console.log(`   Messages Received: ${stats.received}`);
    console.log(`   PoW Messages: ${stats.powMessages}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`   Queue Length: ${stats.queueLength}`);
    console.log(`   Uptime: ${Math.round(stats.uptime / 1000)}s`);
  }

  // Graceful shutdown
  async shutdown() {
    console.log("\n🧹 Shutting down client...");

    if (this.subscription) {
      this.subscription.close();
      console.log("✅ Subscription closed");
    }

    // Wait for queue to finish processing
    while (this.isProcessing && this.messageQueue.length > 0) {
      console.log("⏳ Waiting for message queue to finish...");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.printStats();
    console.log("✅ Client shutdown complete");
  }
}

async function advancedUsageExample() {
  console.log("🎯 NostrMQ Advanced Usage Example\n");

  const client = new AdvancedNostrMQClient();

  try {
    // Initialize client
    const initialized = await client.initialize();
    if (!initialized) {
      throw new Error("Failed to initialize client");
    }

    client.startTime = Date.now();

    // Register message handlers
    client.registerHandler("ping", async (payload, sender, rawEvent) => {
      console.log("   🏓 Handling ping message");
      await client.sendReply(sender, {
        type: "pong",
        originalPing: payload,
        timestamp: new Date().toISOString(),
      });
    });

    client.registerHandler(
      "data-request",
      async (payload, sender, rawEvent) => {
        console.log("   📊 Handling data request");
        await client.sendReply(
          sender,
          {
            type: "data-response",
            requestId: payload.requestId,
            data: {
              server: "nostrmq-advanced-client",
              timestamp: new Date().toISOString(),
              stats: client.getStats(),
            },
          },
          { pow: 4 }
        ); // Reply with PoW
      }
    );

    // Start receiving
    client.startReceiving();

    // Example target (replace with actual pubkey)
    const targetPubkey =
      "02a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef0123456789a";

    // Send various message types
    await client.sendMessage(targetPubkey, {
      type: "ping",
      message: "Hello from advanced client!",
      timestamp: new Date().toISOString(),
    });

    await client.sendMessage(
      targetPubkey,
      {
        type: "data-request",
        requestId: generateUniqueId(),
        query: "server-stats",
      },
      { pow: 6, timeout: 10000 }
    );

    // Batch send example
    const batchMessages = [
      {
        target: targetPubkey,
        payload: { type: "batch-test", index: 1, data: "First message" },
        options: { pow: 4 },
      },
      {
        target: targetPubkey,
        payload: { type: "batch-test", index: 2, data: "Second message" },
        options: { pow: 4 },
      },
      {
        target: targetPubkey,
        payload: { type: "batch-test", index: 3, data: "Third message" },
        options: { pow: 4 },
      },
    ];

    await client.sendBatch(batchMessages, { concurrency: 2, delayMs: 200 });

    // Monitor for a while
    console.log("\n⏳ Monitoring for 10 seconds...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Shutdown
    await client.shutdown();
  } catch (error) {
    console.error("❌ Error in advanced usage example:", error.message);
    await client.shutdown();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n👋 Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

// Run the example
advancedUsageExample().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
