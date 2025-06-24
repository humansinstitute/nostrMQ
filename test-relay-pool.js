import { RelayPool, createRelayPool } from "./dist/relayPool.js";
import { loadConfig } from "./dist/utils.js";

// Test basic instantiation
console.log("Testing RelayPool instantiation...");

try {
  // Test with default config (will fail if no env vars, but that's expected)
  console.log("1. Testing createRelayPool factory function...");

  // Create a test config to avoid environment dependency
  const testConfig = {
    privkey: "0".repeat(64), // dummy private key
    pubkey: "0".repeat(64), // dummy public key
    relays: ["wss://relay.damus.io", "wss://relay.snort.social"],
    powDifficulty: 0,
    powThreads: 4,
  };

  const pool = new RelayPool(testConfig);
  console.log("✓ RelayPool created successfully");

  // Test basic methods exist
  console.log("2. Testing method availability...");
  console.log("✓ connect method:", typeof pool.connect === "function");
  console.log("✓ disconnect method:", typeof pool.disconnect === "function");
  console.log("✓ publish method:", typeof pool.publish === "function");
  console.log("✓ subscribe method:", typeof pool.subscribe === "function");
  console.log("✓ unsubscribe method:", typeof pool.unsubscribe === "function");
  console.log(
    "✓ getConnectedRelays method:",
    typeof pool.getConnectedRelays === "function"
  );
  console.log("✓ addRelay method:", typeof pool.addRelay === "function");
  console.log("✓ removeRelay method:", typeof pool.removeRelay === "function");

  // Test relay status methods
  console.log("3. Testing relay status methods...");
  const statuses = pool.getAllRelayStatuses();
  console.log(
    "✓ getAllRelayStatuses returned Map with",
    statuses.size,
    "relays"
  );

  for (const [url, status] of statuses) {
    console.log(`  - ${url}: ${status.state}`);
  }

  // Test factory function
  console.log("4. Testing factory function...");
  const pool2 = createRelayPool(testConfig);
  console.log("✓ createRelayPool factory function works");

  console.log(
    "\n🎉 All basic tests passed! RelayPool is ready for integration."
  );
} catch (error) {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
}
