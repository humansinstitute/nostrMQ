/**
 * NostrMQ Pipeline Trigger Example
 *
 * This example demonstrates triggering a remote AI agent in the pipeliner service.
 * It sends a pipeline-trigger message and handles both acknowledgment and final responses.
 *
 * Prerequisites:
 * 1. Set environment variables:
 *    - NOSTRMQ_PRIVKEY=your_private_key_hex
 *    - NOSTRMQ_RELAYS=wss://relay1.com,wss://relay2.com
 * 2. Ensure sender npub is whitelisted on the pipeliner service
 * 3. Run: node examples/sendToPipe.js
 */

import { send, receive } from "../dist/index.js";
import { getPublicKey } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { config } from "dotenv";

// Load environment variables
config();

class PipelineTriggerClient {
  constructor() {
    this.subscription = null;
    this.responses = {
      acknowledgment: null,
      final: null,
    };
    this.requestId = "dialogue-request-001";
    this.targetNpub =
      "npub1qjldns0md8kputcf05aumas9zy44hv3vnxn969r5ky4ur9e6s9esh2509k";
    this.senderNpub = null;
    this.targetPubkeyHex = null;
  }

  // Initialize client and convert keys
  async initialize() {
    console.log("🚀 NostrMQ Pipeline Trigger Example\n");

    try {
      // Get private key from environment
      const privKeyHex = process.env.NOSTRMQ_PRIVKEY;
      if (!privKeyHex) {
        throw new Error("NOSTRMQ_PRIVKEY not found in environment variables");
      }

      // Validate private key format
      if (!/^[0-9a-fA-F]{64}$/.test(privKeyHex)) {
        throw new Error("NOSTRMQ_PRIVKEY must be 64 hex characters");
      }

      // Convert private key to public key and npub
      const privKeyBytes = new Uint8Array(
        privKeyHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
      );
      const pubKey = getPublicKey(privKeyBytes);
      this.senderNpub = nip19.npubEncode(pubKey);

      // Convert target npub to hex format
      const { type, data } = nip19.decode(this.targetNpub);
      if (type !== "npub") {
        throw new Error("Invalid target npub format");
      }
      this.targetPubkeyHex = data;

      console.log("🔑 Key Information:");
      console.log(`   Sender npub (for whitelisting): ${this.senderNpub}`);
      console.log(`   Target npub: ${this.targetNpub}`);
      console.log(`   Target pubkey (hex): ${this.targetPubkeyHex}`);
      console.log("");

      return true;
    } catch (error) {
      console.error("❌ Initialization failed:", error.message);
      return false;
    }
  }

  // Set up message receiver for pipeline responses
  setupReceiver() {
    console.log("📡 Setting up message receiver for pipeline responses...");

    this.subscription = receive({
      onMessage: async (payload, sender, rawEvent) => {
        try {
          await this.handleResponse(payload, sender, rawEvent);
        } catch (error) {
          console.error("❌ Error handling response:", error.message);
        }
      },
    });

    console.log("✅ Receiver started, listening for pipeline responses...\n");
    return this.subscription;
  }

  // Handle incoming responses
  async handleResponse(payload, sender, rawEvent) {
    const messageType = payload?.type || "unknown";
    const requestId = payload?.requestId;

    console.log(`📨 Received response:`);
    console.log(`   Type: ${messageType}`);
    console.log(`   From: ${sender.substring(0, 16)}...`);
    console.log(`   Event ID: ${rawEvent.id}`);
    console.log(
      `   Timestamp: ${new Date(rawEvent.created_at * 1000).toISOString()}`
    );

    // Check if this response is for our request
    if (requestId !== this.requestId) {
      console.log(
        `   ⚠️  Request ID mismatch (expected: ${this.requestId}, got: ${requestId})`
      );
      return;
    }

    if (messageType === "pipeline-ack") {
      await this.handleAcknowledgment(payload);
    } else if (messageType === "pipeline-response") {
      await this.handleFinalResponse(payload);
    } else {
      console.log(`   ❓ Unknown response type: ${messageType}`);
      console.log(`   📄 Payload:`, JSON.stringify(payload, null, 4));
    }

    console.log("");
  }

  // Handle acknowledgment response
  async handleAcknowledgment(payload) {
    this.responses.acknowledgment = payload;

    console.log("✅ Pipeline Acknowledgment Received:");
    console.log(`   Job ID: ${payload.jobId}`);
    console.log(`   Status: ${payload.status}`);
    console.log(`   Message: ${payload.message}`);
    console.log(`   Request ID: ${payload.requestId}`);

    if (payload.status === "accepted") {
      console.log("🎯 Pipeline execution started successfully!");
      console.log("⏳ Waiting for final response...");
    } else {
      console.log("⚠️  Pipeline execution may have issues");
    }
  }

  // Handle final pipeline response
  async handleFinalResponse(payload) {
    this.responses.final = payload;

    console.log("🎉 Final Pipeline Response Received:");
    console.log(`   Job ID: ${payload.jobId}`);
    console.log(`   Status: ${payload.status}`);
    console.log(`   Request ID: ${payload.requestId}`);
    console.log(`   Execution Time: ${payload.executionTime}s`);

    if (payload.result) {
      console.log("📊 Pipeline Results:");
      console.log(`   Run ID: ${payload.result.runId}`);

      if (payload.result.conversation) {
        console.log(
          `   Conversation entries: ${payload.result.conversation.length}`
        );
      }

      if (payload.result.summary) {
        console.log("   📝 Summary available");
      }

      if (payload.result.files) {
        console.log("   📁 Files generated");
      }

      console.log(
        "   📄 Full Result:",
        JSON.stringify(payload.result, null, 4)
      );
    }

    console.log("✅ Pipeline execution completed!");
  }

  // Create the pipeline trigger payload
  createPipelinePayload() {
    return {
      type: "pipeline-trigger",
      pipeline: "dialogue",
      parameters: {
        sourceText:
          "Artificial Intelligence is rapidly transforming various industries, from healthcare to finance. While AI offers tremendous potential for improving efficiency and solving complex problems, it also raises concerns about job displacement, privacy, and ethical decision-making.",
        discussionPrompt:
          "What are the most significant opportunities and challenges that AI presents for society, and how should we approach AI development responsibly?",
        iterations: 3,
        summaryFocus:
          "Summarize the key opportunities and challenges discussed, along with any recommendations for responsible AI development.",
      },
      requestId: this.requestId,
      options: {
        priority: "normal",
      },
    };
  }

  // Send the pipeline trigger message
  async sendPipelineTrigger() {
    console.log("📤 Sending pipeline trigger message...");

    const payload = this.createPipelinePayload();

    console.log("📋 Pipeline Payload:");
    console.log(JSON.stringify(payload, null, 2));
    console.log("");

    try {
      const eventId = await send({
        target: this.targetPubkeyHex,
        payload: payload,
      });

      console.log("✅ Pipeline trigger sent successfully!");
      console.log(`   Event ID: ${eventId}`);
      console.log(`   Target: ${this.targetNpub}`);
      console.log(`   Request ID: ${this.requestId}`);
      console.log("");

      return eventId;
    } catch (error) {
      console.error("❌ Failed to send pipeline trigger:", error.message);
      throw error;
    }
  }

  // Wait for responses with timeout
  async waitForResponses(timeoutMs = 300000) {
    // 5 minutes default
    console.log(`⏳ Waiting for responses (timeout: ${timeoutMs / 1000}s)...`);

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;

        // Check if we have both responses
        if (this.responses.acknowledgment && this.responses.final) {
          clearInterval(checkInterval);
          console.log("✅ All responses received!");
          resolve(this.responses);
          return;
        }

        // Check timeout
        if (elapsed >= timeoutMs) {
          clearInterval(checkInterval);
          const missing = [];
          if (!this.responses.acknowledgment) missing.push("acknowledgment");
          if (!this.responses.final) missing.push("final response");

          reject(new Error(`Timeout waiting for: ${missing.join(", ")}`));
          return;
        }

        // Log progress every 30 seconds
        if (elapsed % 30000 < 1000) {
          const received = [];
          if (this.responses.acknowledgment) received.push("acknowledgment");
          if (this.responses.final) received.push("final response");

          console.log(
            `⏳ Still waiting... (${Math.round(elapsed / 1000)}s elapsed)`
          );
          if (received.length > 0) {
            console.log(`   Received: ${received.join(", ")}`);
          }
        }
      }, 1000);
    });
  }

  // Print summary of the interaction
  printSummary() {
    console.log("\n📊 Pipeline Interaction Summary:");
    console.log("=".repeat(50));

    console.log(`Sender npub: ${this.senderNpub}`);
    console.log(`Target npub: ${this.targetNpub}`);
    console.log(`Request ID: ${this.requestId}`);

    if (this.responses.acknowledgment) {
      console.log(
        `✅ Acknowledgment: ${this.responses.acknowledgment.status} (Job: ${this.responses.acknowledgment.jobId})`
      );
    } else {
      console.log("❌ Acknowledgment: Not received");
    }

    if (this.responses.final) {
      console.log(
        `✅ Final Response: ${this.responses.final.status} (${this.responses.final.executionTime}s)`
      );
    } else {
      console.log("❌ Final Response: Not received");
    }

    console.log("=".repeat(50));
  }

  // Graceful shutdown
  async shutdown() {
    console.log("\n🧹 Shutting down pipeline client...");

    if (this.subscription) {
      this.subscription.close();
      console.log("✅ Subscription closed");
    }

    this.printSummary();
    console.log("✅ Pipeline client shutdown complete");
  }
}

async function runPipelineExample() {
  const client = new PipelineTriggerClient();

  try {
    // Initialize client
    const initialized = await client.initialize();
    if (!initialized) {
      throw new Error("Failed to initialize pipeline client");
    }

    // Set up receiver
    client.setupReceiver();

    // Send pipeline trigger
    await client.sendPipelineTrigger();

    // Wait for responses
    await client.waitForResponses();

    // Shutdown
    await client.shutdown();
  } catch (error) {
    console.error("❌ Pipeline example failed:", error.message);
    await client.shutdown();
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Run the example
runPipelineExample().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
