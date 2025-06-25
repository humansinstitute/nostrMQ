# NostrMQ Improvement Roadmap

This document highlights issues found during the security review of the current codebase and proposes concrete steps to address them. The examples below can be used as a starting point for a pull request.

## 1. Verify Signatures on Incoming Events

`receive.ts` processes events without validating their Nostr signatures:

```ts
// src/receive.ts
const messageData = await processEvent(event, config);
```

Add a signature check inside `processEvent` before decrypting:

```ts
import { validateEvent } from "nostr-tools";

if (!validateEvent(event)) {
  console.warn(`Invalid signature from ${event.pubkey}`);
  return null;
}
```

## 2. Enforce Payload Size Limits

The design docs recommend a maximum payload size, but the implementation has no check:

```md
| **Payload size**   | Decrypt only after a size cap (e.g. 64 kB) to avoid memory abuse. |
```

Before decrypting, ensure the encrypted content is below a safe threshold:

```ts
const MAX_SIZE = 64 * 1024; // 64 kB
if (event.content.length > MAX_SIZE) {
  console.warn(`Payload from ${event.pubkey} too large`);
  return null;
}
```

## 3. Environment Variable Naming

Code expects variables prefixed with `NOSTR_`:

```ts
const privkey = process.env.NOSTR_PRIVKEY;
```

Documentation uses the `NOSTRMQ_` prefix instead:

```bash
export NOSTRMQ_PRIVKEY="your_private_key_in_hex"
```

Unify these names (e.g., prefer `NOSTRMQ_*`) and keep fallbacks for compatibility:

```ts
const privkey = process.env.NOSTRMQ_PRIVKEY || process.env.NOSTR_PRIVKEY;
```

## 4. Clear Timers in `withTimeout`

`withTimeout` creates a timeout that is never cleared:

```ts
return Promise.race([
  promise,
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(msg)), timeoutMs)
  ),
]);
```

Keep a handle to the timer and clear it when the main promise resolves:

```ts
return new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(msg)), timeoutMs);
  promise
    .then((v) => { clearTimeout(timer); resolve(v); })
    .catch((e) => { clearTimeout(timer); reject(e); });
});
```

## 5. Remove Stale Event Listeners

`RelayPool.publish` attaches an `ok` listener for every relay but never removes it on timeout:

```ts
this.on("ok", handler); // removed only when OK arrives
```

Add cleanup in the timeout branch to avoid listener leaks:

```ts
const okReceived = await withTimeout(waitForOk, 5000).catch(() => {
  this.off("ok", handler);
  throw new Error(`Publish timeout for ${url}`);
});
```

## 6. Limit Single‑Threaded PoW Mining

`mineSingleThreaded` loops indefinitely:

```ts
while (true) {
  // ...
}
```

Add a maximum duration or iteration count:

```ts
const deadline = Date.now() + 5 * 60_000; // 5 minutes
while (Date.now() < deadline) {
  // mining logic
}
throw new Error("PoW mining timeout");
```

## 7. Verify PoW on Received Events

The receiver currently does not check PoW difficulty. After validating the signature and payload, verify the event’s nonce:

```ts
import { hasValidPow } from "./pow.js";

if (!hasValidPow(event, config.powDifficulty)) {
  console.warn(`Insufficient PoW from ${event.pubkey}`);
  return null;
}
```

---
Implementing these fixes will improve the security and reliability of the library. After applying changes, run the test suite with `npm test` and ensure linting and CI checks pass before submitting your PR.
