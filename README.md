# NostrMQ

A minimal Node.js library for encrypted RPC messaging over the Nostr protocol. NostrMQ provides secure, decentralized message passing with proof-of-work spam prevention and relay pool management.

## Features

- 🔐 **Encrypted Messaging**: NIP-04 encrypted direct messages
- ⚡ **Proof-of-Work**: Optional spam prevention with configurable difficulty
- 🌐 **Multi-Relay Support**: Automatic relay pool management with failover
- 🔄 **Async/Await**: Modern Promise-based API with async iteration support
- 🧵 **Multi-threaded PoW**: Worker thread support for efficient mining
- 📦 **TypeScript**: Full TypeScript support with comprehensive type definitions
- 🚀 **Zero Dependencies**: Minimal footprint with only essential dependencies

## Installation

```bash
npm install nostrmq
```

## Quick Start

### 1. Environment Setup

Create a `.env` file with your configuration:

```bash
# Required: Your Nostr private key (64 hex characters)
NOSTR_PRIVKEY=your_private_key_here

# Optional: Relay URLs (comma-separated)
NOSTR_RELAYS=wss://relay.damus.io,wss://relay.snort.social

# Optional: Proof-of-Work settings
NOSTR_POW_DIFFICULTY=0
NOSTR_POW_THREADS=4
```

### 2. Basic Usage

```javascript
import { send, receive } from "nostrmq";

// Send a message
const eventId = await send({
  target: "recipient_pubkey_hex",
  payload: { message: "Hello from NostrMQ!" },
});

// Receive messages
const subscription = receive({
  onMessage: (payload, sender, rawEvent) => {
    console.log("Received:", payload, "from:", sender);
  },
});

// Clean up when done
subscription.close();
```

## API Reference

### `send(options)`

Send an encrypted message to a recipient.

**Parameters:**

- `options.target` (string): Recipient's public key in hex format
- `options.payload` (object): Data to send (must be JSON-serializable)
- `options.response` (string, optional): Response address (defaults to sender's pubkey)
- `options.relays` (string[], optional): Override default relay URLs
- `options.pow` (boolean|number, optional): PoW mining configuration
- `options.timeoutMs` (number, optional): Connection timeout (default: 2000ms)

**Returns:** Promise<string> - Event ID of the published message

**Example:**

```javascript
const eventId = await send({
  target: "02a1b2c3d4e5f6...",
  payload: {
    type: "greeting",
    message: "Hello!",
    timestamp: new Date().toISOString(),
  },
  pow: 8, // 8-bit proof-of-work
});
```

### `receive(options)`

Subscribe to incoming encrypted messages.

**Parameters:**

- `options.onMessage` (function): Callback for incoming messages
- `options.relays` (string[], optional): Override default relay URLs
- `options.autoAck` (boolean, optional): Auto-reply acknowledgment (not implemented)

**Returns:** SubscriptionHandle with `close()` method and async iteration support

**Example:**

```javascript
// Callback interface
const subscription = receive({
  onMessage: async (payload, sender, rawEvent) => {
    console.log("Message from", sender, ":", payload);
  },
});

// Async iterator interface
for await (const { payload, sender, rawEvent } of subscription) {
  console.log("Received:", payload);
  if (shouldStop) break;
}

subscription.close();
```

### `mineEventPow(event, bits, threads?)`

Mine proof-of-work for an event template.

**Parameters:**

- `event` (object): Event template to mine
- `bits` (number): Target difficulty in leading zero bits
- `threads` (number, optional): Number of worker threads (default: 1)

**Returns:** Promise<object> - Event template with nonce tag added

**Example:**

```javascript
const minedEvent = await mineEventPow(eventTemplate, 12, 4);
console.log(
  "Mined with nonce:",
  minedEvent.tags.find((t) => t[0] === "nonce")
);
```

### `loadConfig()`

Load configuration from environment variables.

**Returns:** NostrMQConfig object with validated settings

**Example:**

```javascript
const config = loadConfig();
console.log("Using pubkey:", config.pubkey);
console.log("Connected to relays:", config.relays);
```

## Advanced Usage

### Proof-of-Work Mining

```javascript
import { send, mineEventPow } from "nostrmq";

// Send with automatic PoW mining
const eventId = await send({
  target: "recipient_pubkey",
  payload: { urgent: true, data: "Important message" },
  pow: 12, // 12-bit difficulty
});

// Manual PoW mining
const eventTemplate = {
  kind: 30072,
  pubkey: "your_pubkey",
  content: "encrypted_content",
  tags: [],
  created_at: Math.floor(Date.now() / 1000),
};

const minedEvent = await mineEventPow(eventTemplate, 8, 4);
```

### Custom Relay Configuration

```javascript
const customRelays = ["wss://relay.example.com", "wss://another-relay.com"];

// Send to custom relays
await send({
  target: "recipient_pubkey",
  payload: { message: "Hello" },
  relays: customRelays,
});

// Receive from custom relays
const subscription = receive({
  onMessage: (payload, sender) => console.log(payload),
  relays: customRelays,
});
```

### Structured Data Messaging

```javascript
// Send structured application data
await send({
  target: "recipient_pubkey",
  payload: {
    type: "user_update",
    operation: "profile_change",
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
      timestamp: new Date().toISOString(),
    },
  },
});
```

### Error Handling

```javascript
try {
  const eventId = await send({
    target: "invalid_pubkey", // This will throw
    payload: { message: "Hello" },
  });
} catch (error) {
  if (error.message.includes("invalid pubkey")) {
    console.error("Invalid recipient public key");
  } else if (error.message.includes("relay")) {
    console.error("Relay connection failed");
  } else {
    console.error("Unexpected error:", error.message);
  }
}
```

## Environment Variables

| Variable               | Required | Default                                         | Description                           |
| ---------------------- | -------- | ----------------------------------------------- | ------------------------------------- |
| `NOSTR_PRIVKEY`        | Yes      | -                                               | Your Nostr private key (64 hex chars) |
| `NOSTR_RELAYS`         | No       | `wss://relay.damus.io,wss://relay.snort.social` | Comma-separated relay URLs            |
| `NOSTR_POW_DIFFICULTY` | No       | `0`                                             | Default PoW difficulty in bits        |
| `NOSTR_POW_THREADS`    | No       | `4`                                             | Worker threads for PoW mining         |

## Examples

See the [`examples/`](./examples/) directory for complete working examples:

- [`basic-usage.js`](./examples/basic-usage.js) - Simple send/receive without PoW
- [`pow-usage.js`](./examples/pow-usage.js) - Proof-of-work mining examples
- [`advanced-usage.js`](./examples/advanced-usage.js) - Advanced features and patterns

## Troubleshooting

### Common Issues

**"NOSTR_PRIVKEY environment variable is required"**

- Ensure your `.env` file contains a valid 64-character hex private key
- Check that your application is loading environment variables correctly

**"Failed to connect to relays"**

- Verify relay URLs are accessible and use `wss://` protocol
- Try different relays if current ones are offline
- Check your network connection and firewall settings

**"PoW mining timeout"**

- Reduce difficulty bits for faster mining
- Increase the number of worker threads
- Consider disabling PoW for testing (`pow: false`)

**"Invalid pubkey format"**

- Ensure recipient public keys are 64-character hex strings
- Verify the pubkey doesn't include prefixes like `npub` (use hex format)

### Performance Tips

- Use multiple worker threads for PoW mining on multi-core systems
- Keep PoW difficulty reasonable (8-16 bits) for good performance
- Reuse subscription handles instead of creating new ones frequently
- Use connection pooling by keeping relay connections alive

### Debugging

Enable debug logging by setting the environment variable:

```bash
DEBUG=nostrmq:* node your-app.js
```

## TypeScript Support

NostrMQ includes comprehensive TypeScript definitions:

```typescript
import { send, receive, SendOpts, ReceiveOpts, NostrMQConfig } from "nostrmq";

const sendOptions: SendOpts = {
  target: "recipient_pubkey",
  payload: { message: "Hello TypeScript!" },
  pow: 8,
};

const eventId: string = await send(sendOptions);
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run the build: `npm run build`
5. Submit a pull request

## License

ISC License - see LICENSE file for details.

## Related Projects

- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) - Core Nostr protocol implementation
- [Nostr Protocol](https://github.com/nostr-protocol/nostr) - Decentralized social protocol

---

**NostrMQ** - Secure, decentralized messaging for the modern web.
