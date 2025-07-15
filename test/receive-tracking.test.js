import assert from "assert";
import { promises as fs } from "fs";
import { EventEmitter } from "events";
import { receive } from "../dist/receive.js";
import { createMessageTracker } from "../dist/messageTracker.js";

// Test utilities and mocks
const TEST_CACHE_DIR = ".test-receive-cache";
const TEST_PRIVKEY = "a".repeat(64); // Valid 64-char hex string
const TEST_PUBKEY = "b".repeat(64); // Mock pubkey

// Mock environment variables
const originalEnv = { ...process.env };

function setTestEnv() {
  process.env.NOSTR_PRIVKEY = TEST_PRIVKEY;
  process.env.NOSTR_RELAYS = "wss://test-relay.com";
  process.env.NOSTRMQ_CACHE_DIR = TEST_CACHE_DIR;
  process.env.NOSTRMQ_TRACK_LIMIT = "5";
  process.env.NOSTRMQ_OLDEST_MQ = "3600";
}

function restoreEnv() {
  process.env = { ...originalEnv };
}

async function cleanupTestCache() {
  try {
    await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Mock RelayPool
class MockRelayPool extends EventEmitter {
  constructor() {
    super();
    this.subscriptions = new Map();
    this.connected = false;
    this.connectionPromise = null;
  }

  async connect() {
    this.connected = true;
    this.connectionPromise = Promise.resolve();
    // Simulate connection delay
    setTimeout(() => {
      this.emit("relay:connected", "wss://test-relay.com");
    }, 10);
    return this.connectionPromise;
  }

  subscribe(subId, filters, relays) {
    this.subscriptions.set(subId, { filters, relays });
    return subId;
  }

  unsubscribe(subId) {
    this.subscriptions.delete(subId);
  }

  async disconnect() {
    this.connected = false;
    this.emit("relay:disconnected", "wss://test-relay.com");
  }

  // Test helper to simulate receiving events
  simulateEvent(subId, event) {
    this.emit("event", "wss://test-relay.com", subId, event);
  }

  // Test helper to get subscription details
  getSubscription(subId) {
    return this.subscriptions.get(subId);
  }
}

// Mock the RelayPool module
let mockRelayPool;
const originalCreateRelayPool = await import("../dist/relayPool.js").then(
  (m) => m.createRelayPool
);

// Mock nostr-tools functions
const mockNip04 = {
  decrypt: async (privkey, pubkey, content) => {
    // Simple mock decryption - just return the content
    if (content === "invalid_content") {
      throw new Error("Decryption failed");
    }
    return content;
  },
};

const mockGetPublicKey = (privkey) => {
  return TEST_PUBKEY;
};

// Mock data generators
function createMockNostrEvent(id, timestamp, content, pubkey = "sender123") {
  return {
    id: id || `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    kind: 30072,
    pubkey: pubkey,
    created_at: timestamp || Math.floor(Date.now() / 1000),
    content:
      content ||
      JSON.stringify({
        target: TEST_PUBKEY,
        response: pubkey,
        payload: { message: "test message" },
      }),
    tags: [["p", TEST_PUBKEY]],
    sig: "mock_signature",
  };
}

function createValidEncryptedPayload(payload = { message: "test" }) {
  return JSON.stringify({
    target: TEST_PUBKEY,
    response: "sender123",
    payload: payload,
  });
}

// Test suite
describe("Receive with MessageTracker Integration", () => {
  beforeEach(async () => {
    setTestEnv();
    await cleanupTestCache();

    // Create fresh mock relay pool for each test
    mockRelayPool = new MockRelayPool();

    // Mock the createRelayPool function
    const relayPoolModule = await import("../dist/relayPool.js");
    relayPoolModule.createRelayPool = () => mockRelayPool;
  });

  afterEach(async () => {
    restoreEnv();
    await cleanupTestCache();

    // Restore original function
    const relayPoolModule = await import("../dist/relayPool.js");
    relayPoolModule.createRelayPool = originalCreateRelayPool;
  });

  describe("MessageTracker initialization", () => {
    it("should initialize MessageTracker successfully", (done) => {
      const receivedMessages = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
      });

      // Wait for connection and MessageTracker initialization
      setTimeout(() => {
        // Check that subscription was created
        const subscriptions = Array.from(mockRelayPool.subscriptions.values());
        assert.strictEqual(subscriptions.length, 1);

        const subscription = subscriptions[0];
        const filter = subscription.filters[0];

        // Should have kinds and #p filters
        assert.deepStrictEqual(filter.kinds, [30072]);
        assert.deepStrictEqual(filter["#p"], [TEST_PUBKEY]);

        handle.close();
        done();
      }, 100);
    });

    it("should add since parameter to subscription filter when MessageTracker is available", (done) => {
      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {},
      });

      setTimeout(() => {
        const subscriptions = Array.from(mockRelayPool.subscriptions.values());
        const filter = subscriptions[0].filters[0];

        // Should have since parameter
        assert(
          typeof filter.since === "number",
          "Filter should include since timestamp"
        );
        assert(filter.since > 0, "Since timestamp should be positive");

        handle.close();
        done();
      }, 100);
    });

    it("should continue without tracking if MessageTracker initialization fails", (done) => {
      // Set invalid cache directory to force initialization failure
      process.env.NOSTRMQ_CACHE_DIR = "/invalid/path/that/cannot/be/created";

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {},
      });

      setTimeout(() => {
        const subscriptions = Array.from(mockRelayPool.subscriptions.values());
        assert.strictEqual(subscriptions.length, 1);

        const filter = subscriptions[0].filters[0];

        // Should still have basic filters even without tracking
        assert.deepStrictEqual(filter.kinds, [30072]);
        assert.deepStrictEqual(filter["#p"], [TEST_PUBKEY]);

        handle.close();
        done();
      }, 100);
    });
  });

  describe("duplicate event detection", () => {
    it("should process new events normally", (done) => {
      const receivedMessages = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
      });

      setTimeout(() => {
        const event = createMockNostrEvent(
          "new_event_123",
          Math.floor(Date.now() / 1000),
          createValidEncryptedPayload({ message: "new message" })
        );

        // Get subscription ID
        const subId = Array.from(mockRelayPool.subscriptions.keys())[0];

        // Simulate receiving the event
        mockRelayPool.simulateEvent(subId, event);

        setTimeout(() => {
          assert.strictEqual(receivedMessages.length, 1);
          assert.deepStrictEqual(receivedMessages[0].payload, {
            message: "new message",
          });
          assert.strictEqual(receivedMessages[0].sender, "sender123");

          handle.close();
          done();
        }, 50);
      }, 100);
    });

    it("should skip duplicate events", (done) => {
      const receivedMessages = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
      });

      setTimeout(() => {
        const event = createMockNostrEvent(
          "duplicate_event_123",
          Math.floor(Date.now() / 1000),
          createValidEncryptedPayload({ message: "duplicate test" })
        );

        const subId = Array.from(mockRelayPool.subscriptions.keys())[0];

        // Send the same event twice
        mockRelayPool.simulateEvent(subId, event);

        setTimeout(() => {
          mockRelayPool.simulateEvent(subId, event);

          setTimeout(() => {
            // Should only process the event once
            assert.strictEqual(receivedMessages.length, 1);
            assert.deepStrictEqual(receivedMessages[0].payload, {
              message: "duplicate test",
            });

            handle.close();
            done();
          }, 50);
        }, 50);
      }, 100);
    });

    it("should skip events older than tracking window", (done) => {
      const receivedMessages = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
      });

      setTimeout(() => {
        // Create an old event (older than default 1 hour window)
        const oldTimestamp = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
        const oldEvent = createMockNostrEvent(
          "old_event_123",
          oldTimestamp,
          createValidEncryptedPayload({ message: "old message" })
        );

        const subId = Array.from(mockRelayPool.subscriptions.keys())[0];
        mockRelayPool.simulateEvent(subId, oldEvent);

        setTimeout(() => {
          // Old event should be skipped
          assert.strictEqual(receivedMessages.length, 0);

          handle.close();
          done();
        }, 50);
      }, 100);
    });

    it("should continue processing even if tracking fails", (done) => {
      const receivedMessages = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
      });

      setTimeout(() => {
        // Remove cache directory to cause tracking failures
        fs.rm(TEST_CACHE_DIR, { recursive: true, force: true }).then(() => {
          const event = createMockNostrEvent(
            "tracking_fail_event",
            Math.floor(Date.now() / 1000),
            createValidEncryptedPayload({ message: "tracking fail test" })
          );

          const subId = Array.from(mockRelayPool.subscriptions.keys())[0];
          mockRelayPool.simulateEvent(subId, event);

          setTimeout(() => {
            // Should still process the event even if tracking fails
            assert.strictEqual(receivedMessages.length, 1);
            assert.deepStrictEqual(receivedMessages[0].payload, {
              message: "tracking fail test",
            });

            handle.close();
            done();
          }, 50);
        });
      }, 100);
    });
  });

  describe("event processing with tracking", () => {
    it("should mark successfully processed events as processed", (done) => {
      const receivedMessages = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
      });

      setTimeout(() => {
        const event1 = createMockNostrEvent(
          "mark_processed_1",
          Math.floor(Date.now() / 1000),
          createValidEncryptedPayload({ message: "first message" })
        );

        const event2 = createMockNostrEvent(
          "mark_processed_2",
          Math.floor(Date.now() / 1000) + 1,
          createValidEncryptedPayload({ message: "second message" })
        );

        const subId = Array.from(mockRelayPool.subscriptions.keys())[0];

        // Send first event
        mockRelayPool.simulateEvent(subId, event1);

        setTimeout(() => {
          // Send second event
          mockRelayPool.simulateEvent(subId, event2);

          setTimeout(() => {
            // Try to send first event again (should be skipped as duplicate)
            mockRelayPool.simulateEvent(subId, event1);

            setTimeout(() => {
              // Should have processed both unique events, but not the duplicate
              assert.strictEqual(receivedMessages.length, 2);
              assert.deepStrictEqual(receivedMessages[0].payload, {
                message: "first message",
              });
              assert.deepStrictEqual(receivedMessages[1].payload, {
                message: "second message",
              });

              handle.close();
              done();
            }, 50);
          }, 50);
        }, 50);
      }, 100);
    });

    it("should handle onMessage callback errors gracefully", (done) => {
      const receivedMessages = [];
      let callbackErrors = 0;

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
          callbackErrors++;
          throw new Error("Callback error");
        },
      });

      setTimeout(() => {
        const event = createMockNostrEvent(
          "callback_error_event",
          Math.floor(Date.now() / 1000),
          createValidEncryptedPayload({ message: "callback error test" })
        );

        const subId = Array.from(mockRelayPool.subscriptions.keys())[0];
        mockRelayPool.simulateEvent(subId, event);

        setTimeout(() => {
          // Should still process the event and mark it as processed despite callback error
          assert.strictEqual(receivedMessages.length, 1);
          assert.strictEqual(callbackErrors, 1);

          // Send the same event again - should be skipped as duplicate
          mockRelayPool.simulateEvent(subId, event);

          setTimeout(() => {
            // Should not process duplicate
            assert.strictEqual(receivedMessages.length, 1);
            assert.strictEqual(callbackErrors, 1);

            handle.close();
            done();
          }, 50);
        }, 50);
      }, 100);
    });
  });

  describe("subscription filter behavior", () => {
    it("should include correct filter parameters", (done) => {
      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {},
      });

      setTimeout(() => {
        const subscriptions = Array.from(mockRelayPool.subscriptions.values());
        assert.strictEqual(subscriptions.length, 1);

        const subscription = subscriptions[0];
        const filter = subscription.filters[0];

        // Verify filter structure
        assert.deepStrictEqual(filter.kinds, [30072]);
        assert.deepStrictEqual(filter["#p"], [TEST_PUBKEY]);
        assert(typeof filter.since === "number");
        assert(filter.since > 0);

        // Verify relay list
        assert.deepStrictEqual(subscription.relays, ["wss://test-relay.com"]);

        handle.close();
        done();
      }, 100);
    });

    it("should use MessageTracker timestamp for since parameter", (done) => {
      // Pre-create a MessageTracker with known timestamp
      const tracker = createMessageTracker({ cacheDir: TEST_CACHE_DIR });

      tracker.initialize().then(() => {
        const expectedSince = tracker.getSubscriptionSince();

        const handle = receive({
          onMessage: async (payload, sender, rawEvent) => {},
        });

        setTimeout(() => {
          const subscriptions = Array.from(
            mockRelayPool.subscriptions.values()
          );
          const filter = subscriptions[0].filters[0];

          // Since timestamp should be close to what MessageTracker provides
          // (allowing for small timing differences)
          assert(
            Math.abs(filter.since - expectedSince) <= 2,
            `Expected since ${expectedSince}, got ${filter.since}`
          );

          handle.close();
          done();
        }, 100);
      });
    });
  });

  describe("performance impact", () => {
    it("should have minimal performance impact on message processing", (done) => {
      const receivedMessages = [];
      const processingTimes = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
      });

      setTimeout(() => {
        const subId = Array.from(mockRelayPool.subscriptions.keys())[0];

        // Process multiple events and measure timing
        const numEvents = 10;
        let processedCount = 0;

        for (let i = 0; i < numEvents; i++) {
          const startTime = Date.now();

          const event = createMockNostrEvent(
            `perf_test_${i}`,
            Math.floor(Date.now() / 1000) + i,
            createValidEncryptedPayload({ message: `message ${i}` })
          );

          mockRelayPool.simulateEvent(subId, event);

          // Check processing completion
          const checkCompletion = () => {
            if (receivedMessages.length > processedCount) {
              processingTimes.push(Date.now() - startTime);
              processedCount++;

              if (processedCount === numEvents) {
                // Verify all events were processed
                assert.strictEqual(receivedMessages.length, numEvents);

                // Check that processing times are reasonable (< 100ms per event)
                const maxTime = Math.max(...processingTimes);
                assert(
                  maxTime < 100,
                  `Max processing time ${maxTime}ms exceeded threshold`
                );

                const avgTime =
                  processingTimes.reduce((a, b) => a + b, 0) /
                  processingTimes.length;
                assert(
                  avgTime < 50,
                  `Average processing time ${avgTime}ms exceeded threshold`
                );

                handle.close();
                done();
              }
            } else {
              setTimeout(checkCompletion, 10);
            }
          };

          setTimeout(checkCompletion, 10);
        }
      }, 100);
    });
  });

  describe("graceful degradation", () => {
    it("should work without MessageTracker when initialization fails", (done) => {
      // Force MessageTracker initialization to fail
      process.env.NOSTRMQ_CACHE_DIR = "/invalid/path";

      const receivedMessages = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
      });

      setTimeout(() => {
        const event = createMockNostrEvent(
          "no_tracker_event",
          Math.floor(Date.now() / 1000),
          createValidEncryptedPayload({ message: "no tracker test" })
        );

        const subId = Array.from(mockRelayPool.subscriptions.keys())[0];
        mockRelayPool.simulateEvent(subId, event);

        setTimeout(() => {
          // Should still process events normally
          assert.strictEqual(receivedMessages.length, 1);
          assert.deepStrictEqual(receivedMessages[0].payload, {
            message: "no tracker test",
          });

          // Send the same event again - without tracking, it should be processed again
          mockRelayPool.simulateEvent(subId, event);

          setTimeout(() => {
            assert.strictEqual(receivedMessages.length, 2);

            handle.close();
            done();
          }, 50);
        }, 50);
      }, 100);
    });

    it("should maintain existing receive functionality", (done) => {
      const receivedMessages = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
        relays: ["wss://custom-relay.com"],
      });

      setTimeout(() => {
        // Verify custom relay is used
        const subscriptions = Array.from(mockRelayPool.subscriptions.values());
        const subscription = subscriptions[0];
        assert.deepStrictEqual(subscription.relays, ["wss://custom-relay.com"]);

        // Verify basic message processing still works
        const event = createMockNostrEvent(
          "functionality_test",
          Math.floor(Date.now() / 1000),
          createValidEncryptedPayload({ message: "functionality test" })
        );

        const subId = Array.from(mockRelayPool.subscriptions.keys())[0];
        mockRelayPool.simulateEvent(subId, event);

        setTimeout(() => {
          assert.strictEqual(receivedMessages.length, 1);
          assert.deepStrictEqual(receivedMessages[0].payload, {
            message: "functionality test",
          });
          assert.strictEqual(receivedMessages[0].sender, "sender123");
          assert.strictEqual(
            receivedMessages[0].rawEvent.id,
            "functionality_test"
          );

          handle.close();
          done();
        }, 50);
      }, 100);
    });
  });

  describe("error scenarios", () => {
    it("should handle invalid events gracefully", (done) => {
      const receivedMessages = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
      });

      setTimeout(() => {
        // Send invalid event (wrong kind)
        const invalidEvent = {
          ...createMockNostrEvent(),
          kind: 1, // Wrong kind
          content: createValidEncryptedPayload(),
        };

        const subId = Array.from(mockRelayPool.subscriptions.keys())[0];
        mockRelayPool.simulateEvent(subId, invalidEvent);

        setTimeout(() => {
          // Invalid event should be ignored
          assert.strictEqual(receivedMessages.length, 0);

          handle.close();
          done();
        }, 50);
      }, 100);
    });

    it("should handle decryption failures gracefully", (done) => {
      const receivedMessages = [];

      const handle = receive({
        onMessage: async (payload, sender, rawEvent) => {
          receivedMessages.push({ payload, sender, rawEvent });
        },
      });

      setTimeout(() => {
        const eventWithBadContent = createMockNostrEvent(
          "bad_content_event",
          Math.floor(Date.now() / 1000),
          "invalid_content" // This will trigger decryption failure in mock
        );

        const subId = Array.from(mockRelayPool.subscriptions.keys())[0];
        mockRelayPool.simulateEvent(subId, eventWithBadContent);

        setTimeout(() => {
          // Event with decryption failure should be ignored
          assert.strictEqual(receivedMessages.length, 0);

          handle.close();
          done();
        }, 50);
      }, 100);
    });
  });
});

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Running receive-tracking integration tests...");

  // Simple test runner (similar to messageTracker.test.js)
  const tests = [];
  let currentSuite = "";

  global.describe = (name, fn) => {
    currentSuite = name;
    fn();
  };

  global.it = (name, fn) => {
    tests.push({ suite: currentSuite, name, fn });
  };

  global.beforeEach = () => {};
  global.afterEach = () => {};

  try {
    let passed = 0;
    let failed = 0;

    for (const test of tests) {
      try {
        await test.fn();
        console.log(`✓ ${test.suite}: ${test.name}`);
        passed++;
      } catch (error) {
        console.log(`✗ ${test.suite}: ${test.name}`);
        console.log(`  Error: ${error.message}`);
        failed++;
      }
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("Test runner error:", error);
    process.exit(1);
  }
}
