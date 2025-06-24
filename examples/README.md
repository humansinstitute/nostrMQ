# NostrMQ Examples

This directory contains practical examples demonstrating how to use the NostrMQ library for encrypted messaging over Nostr.

## Prerequisites

Before running any examples, make sure you have:

1. **Environment Variables Set:**

   ```bash
   export NOSTRMQ_PRIVKEY="your_private_key_in_hex"
   export NOSTRMQ_RELAYS="wss://relay1.com,wss://relay2.com"
   export NOSTRMQ_POW_DIFFICULTY="8"  # Optional, default PoW difficulty
   export NOSTRMQ_POW_THREADS="4"     # Optional, worker threads for PoW
   ```

2. **Built Library:**
   ```bash
   npm run build
   ```

## Examples

### 1. Basic Usage (`basic-usage.js`)

Demonstrates fundamental send and receive functionality without proof-of-work.

**Features:**

- Simple message sending
- Message receiving with callbacks
- Async iterator interface
- Structured data transmission
- Custom response addresses

**Run:**

```bash
node examples/basic-usage.js
```

### 2. Proof-of-Work Usage (`pow-usage.js`)

Shows how to use proof-of-work mining for spam prevention and message prioritization.

**Features:**

- Messages with different PoW difficulties (4, 8, 12 bits)
- Performance comparison
- PoW validation
- Multi-threaded mining
- Environment configuration usage

**Run:**

```bash
node examples/pow-usage.js
```

### 3. Advanced Usage (`advanced-usage.js`)

Demonstrates advanced patterns and features for production use.

**Features:**

- Custom client class with message routing
- Type-based message handlers
- Batch message sending
- Error handling and retries
- Performance monitoring
- Rate limiting
- Graceful shutdown

**Run:**

```bash
node examples/advanced-usage.js
```

## Example Environment Setup

Create a `.env` file in the project root:

```bash
# Required
NOSTRMQ_PRIVKEY=your_64_character_hex_private_key
NOSTRMQ_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band

# Optional
NOSTRMQ_POW_DIFFICULTY=8
NOSTRMQ_POW_THREADS=4
```

## Generating a Private Key

You can generate a private key using the nostr-tools library:

```javascript
import { generateSecretKey, getPublicKey } from "nostr-tools";

const privkey = generateSecretKey();
const pubkey = getPublicKey(privkey);

console.log("Private key:", Buffer.from(privkey).toString("hex"));
console.log("Public key:", pubkey);
```

## Testing with Multiple Instances

To test message exchange:

1. **Terminal 1 (Receiver):**

   ```bash
   # Set your private key
   export NOSTRMQ_PRIVKEY="your_privkey_hex"
   export NOSTRMQ_RELAYS="wss://relay.damus.io,wss://nos.lol"

   # Run receiver
   node examples/basic-usage.js
   ```

2. **Terminal 2 (Sender):**

   ```bash
   # Set a different private key
   export NOSTRMQ_PRIVKEY="different_privkey_hex"
   export NOSTRMQ_RELAYS="wss://relay.damus.io,wss://nos.lol"

   # Modify the target pubkey in the example to match Terminal 1's pubkey
   # Then run sender
   node examples/basic-usage.js
   ```

## Common Issues

### 1. "Failed to load configuration"

- Ensure `NOSTRMQ_PRIVKEY` and `NOSTRMQ_RELAYS` are set
- Private key must be 64 hex characters
- Relay URLs must start with `wss://`

### 2. "Failed to connect to relays"

- Check your internet connection
- Try different relay URLs
- Some relays may be temporarily unavailable

### 3. "PoW mining timeout"

- Reduce the PoW difficulty
- Increase `NOSTRMQ_POW_THREADS` for faster mining
- High difficulties (>16 bits) may take very long

### 4. Messages not received

- Ensure both sender and receiver use the same relays
- Check that the target pubkey is correct
- Verify relay connections are successful

## Performance Tips

1. **PoW Difficulty:**

   - Use 4-8 bits for normal messages
   - Use 12+ bits for high-priority messages
   - Higher difficulty = more computational work

2. **Relay Selection:**

   - Use 2-3 reliable relays
   - Avoid too many relays (increases latency)
   - Test relay connectivity before production use

3. **Threading:**
   - Set `NOSTRMQ_POW_THREADS` to your CPU core count
   - More threads = faster PoW mining
   - Single-threaded is fine for low difficulties

## Next Steps

After running the examples:

1. **Integration:** Integrate NostrMQ into your application
2. **Error Handling:** Implement robust error handling
3. **Monitoring:** Add logging and metrics
4. **Security:** Secure private key storage
5. **Testing:** Write comprehensive tests

For more information, see the main project documentation.
