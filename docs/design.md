# nostrMQ  |  **Design & Implementation Blueprint**

_A minimal Node.js message-queue library for encrypted RPC over Nostr (with optional NIP-13 proof-of-work mining)._

---

## ✨ 1 What it does

`nostrMQ` lets any Node project send and receive **kind 30072** replaceable/ephemeral events as a lightweight, end-to-end-encrypted “message bus”.
Core value-adds:

| Feature                              | Why it matters                                                         |
| ------------------------------------ | ---------------------------------------------------------------------- |
| **Encrypted payloads** (NIP-04)      | Keep job data private while traversing public relays.                  |
| **Zero-infrastructure RPC**          | Clients & servers sit behind NAT; only outbound WebSockets to relays.  |
| **Key-based identity**               | Pubkey = identity; no API keys or TLS certs.                           |
| **Configurable PoW mining** (NIP-13) | Boost relay acceptance & spam resistance without external PoW service. |
| **Tiny API surface**                 | Just `send()` and `receive()` plus sensible defaults.                  |

---

## 📦 2 NPM Package Meta

```jsonc
{
  "name": "nostrmq",
  "version": "0.3.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "files": ["dist"],
  "keywords": ["nostr", "mq", "rpc", "nip04", "nip13", "pow"],
  "dependencies": {
    "nostr-tools": "^2.0.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.5.0",
    "@types/ws": "^8.5.8"
  }
}
```

---

## 🗄 3 Project Layout

```
nostrMQ/
├─ src/
│  ├─ index.ts        # public API re-exports
│  ├─ send.ts
│  ├─ receive.ts
│  ├─ relayPool.ts    # lightweight relay manager
│  ├─ pow.ts          # PoW miner / verifier  ← NEW
│  └─ utils.ts
├─ examples/
│  ├─ ping.ts         # fire-and-forget send
│  └─ pong.ts         # listen & reply demo
├─ .env.example
├─ README.md          # (this file)
└─ tsconfig.json
```

---

## 🛠 4 Environment Configuration

```dotenv
# Mandatory
NOSTR_PRIVKEY=xxxxxxxx...xxxxxxxx

# Required
# Comma-separated list of relay URLs (no fallback; must be set)
# Example:
# NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://relay.nostr.band
NOSTR_RELAYS=
NOSTR_POW_DIFFICULTY=22       # integer bits; 0 or unset → disable PoW
NOSTR_POW_THREADS=4           # worker threads for mining
```

---

## 📑 5 Event Contract

| Field       | Value                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **kind**    | `30072`                                                                                                                                                                 |
| **tags**    | `["p", targetPubkey]` (recipient) • `["d", uniqueId]` (replaceability) • optional `["response", responsePubkey]` • optional `["nonce", nonce, bits]` _(when PoW mined)_ |
| **content** | NIP-04 encrypted JSON → `{ "target":<hex>, "response":<hex>, "payload":<any> }`                                                                                         |
| **pubkey**  | Implicit **source** (no extra `source` field)                                                                                                                           |

---

## 🧩 6 Public API (TypeScript)

```ts
// src/index.ts
export { send } from "./send.js";
export { receive } from "./receive.js";
export type { SendOpts, ReceiveOpts } from "./types.js";
```

### 6.1 `send(opts): Promise<string>`

```ts
interface SendOpts {
  payload: unknown; // data to transmit (JSON-serialisable)
  target: string; // hex pubkey of recipient
  response?: string; // where the reply should go (default = sender)
  relays?: string[]; // overrides env
  pow?: boolean | number; // false → none; true → env bits; number → explicit bits
  timeoutMs?: number; // default 2 000
}
```

Returns the **event ID** once the first relay acknowledges.

### 6.2 `receive(opts): SubscriptionHandle`

```ts
interface ReceiveOpts {
  onMessage: (
    payload: unknown,
    sender: string,
    rawEvent: NostrEvent
  ) => void | Promise<void>;
  relays?: string[];
  autoAck?: boolean; // auto-reply “OK” back to sender
}
```

`SubscriptionHandle` exposes `.close()` and `[Symbol.asyncIterator]` so you can:

```ts
for await (const m of receive({ ... })) {
  // ...
}
```

---

## ⚙️ 7 Key Implementation Files (high-level)

### 7.1 `pow.ts` (excerpt)

```ts
import { createHash } from "crypto";
import { Worker } from "worker_threads";
import { getEventHash, EventTemplate } from "nostr-tools";

export async function mineEventPow(
  evt: EventTemplate,
  bits: number,
  threads = 1
): Promise<EventTemplate> {
  if (bits <= 0) return evt;

  const targetZeros = bits >> 2;
  const targetRem = bits & 3;

  const testHash = (hex: string): boolean =>
    hex.startsWith("0".repeat(targetZeros)) &&
    (targetRem === 0 ||
      parseInt(hex[targetZeros], 16) >> (4 - targetRem) === 0);

  const mineLoop = (template: EventTemplate) => {
    let nonce = 0;
    while (true) {
      template.tags = template.tags.filter((t) => t[0] !== "nonce");
      template.tags.push(["nonce", nonce.toString(), bits.toString()]);
      const id = getEventHash(template);
      if (testHash(id)) return { ...template, id };
      nonce++;
      if (nonce % 10_000 === 0)
        template.created_at = Math.floor(Date.now() / 1000);
    }
  };

  if (threads <= 1) return mineLoop(evt);

  // Multi-worker race
  return new Promise((resolve) => {
    let finished = false;
    for (let i = 0; i < threads; i++) {
      const worker = new Worker(new URL("./pow.worker.js", import.meta.url), {
        workerData: { evt, bits, offset: i, stride: threads },
      });
      worker.on("message", (mined) => {
        if (!finished) {
          finished = true;
          resolve(mined);
        }
      });
    }
  });
}
```

_(`pow.worker.js` runs the same loop with an initial `nonce = offset`, incrementing by `stride`.)_

### 7.2 `send.ts` (flow)

1. Read `.env`, merge with `SendOpts`.
2. Serialise `{ target, response, payload }`, encrypt with **NIP-04**.
3. Build event template (`kind 30072`, tags).
4. **Optional PoW** → `mineEventPow(template, bits, threads)`.
5. Publish to all `relays`; race first `"OK"` notice.
6. Resolve `id`, propagate errors/timeouts.

### 7.3 `receive.ts`

- Open sockets to `relays` via `relayPool`.
- SUB filter: `{ kinds:[30072], "#p":[myPubkey] }`.
- Verify signature; (optional) verify PoW ≥ env.
- Decrypt, JSON-parse → invoke `onMessage`.
- If `autoAck`, immediately `send({ target:sender, payload:{ok:true}, pow:false })`.

---

## 🚀 8 Quick-start Example

### Install

```bash
npm i nostrmq
```

### Ping (client)

```ts
import "dotenv/config";
import { send } from "nostrmq";

await send({
  payload: { method: "ping" },
  target: "targetHexPubkey",
  pow: true, // uses NOSTR_POW_DIFFICULTY env
});
```

### Pong (server)

```ts
import "dotenv/config";
import { receive, send } from "nostrmq";

receive({
  async onMessage(payload, sender) {
    if (payload?.method === "ping") {
      await send({
        payload: { method: "pong", ts: Date.now() },
        target: sender,
        pow: false,
      });
    }
  },
});
```

---

## 🔐 9 Security & Operational Notes

| Topic              | Practice                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Key storage**    | Load from env / secret manager; never commit to git.                                                                  |
| **Replay defence** | Replaceable events (`"d"` tag) + app-level deduping.                                                                  |
| **PoW policy**     | Use `NOSTR_POW_DIFFICULTY` for uniform enforcement; receivers can additionally discard events with insufficient bits. |
| **Payload size**   | Decrypt only after a size cap (e.g. 64 kB) to avoid memory abuse.                                                     |

---

## 🛣 10 Road-map

| Version | Feature                                          |
| ------- | ------------------------------------------------ |
| 0.2     | `npx nostrmq` CLI (curl-like UX).                |
| 0.3     | Cashu token attachment & invoice-verify helpers. |
| 0.3     | Streaming / chunked payload mode (NIP-44).       |
