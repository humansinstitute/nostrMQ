# NostrMQ MongoDB Pilot App Design

This document outlines a simple pilot application using **NostrMQ** for remote MongoDB access. The goal is to allow a client to send encrypted requests over Nostr and receive responses containing data or update results. Each request is validated against a whitelist of allowed sender pubkeys.

## Overview

1. **Local MongoDB** – The server runs a MongoDB instance accessible via `mongodb://localhost:27017`.
2. **Database Selection** – Each database is associated with an `npub` tag. Clients specify the database by including this npub in the payload.
3. **Actions** – The payload supports `insert`, `find`, `update`, and `delete` operations. Documents are selected with a query object when applicable.
4. **Whitelisting** – Only messages from pubkeys present in `ALLOWED_SENDERS` are processed.
5. **Ephemeral Replies** – Clients include an ephemeral `replyPubkey` in the request. The server encrypts the response to this pubkey and sends it via NostrMQ.
6. **Status Codes** – Responses include a `status` field (`ok` or `error`) and optional result data.

## Payload Format

```json
{
  "dbNpub": "<npub identifying the database>",
  "collection": "users",
  "action": "insert" | "find" | "update" | "delete",
  "query": { "id": 1 },
  "update": { "$set": { "name": "Bob" } },
  "replyPubkey": "<ephemeral npub>"
}
```

## Request Flow

1. Client generates an ephemeral key pair for the reply channel.
2. Client sends the payload using `send()` targeting the server pubkey.
3. Server receives the message with `receive()` and validates:
   - Sender is whitelisted.
   - Payload includes `dbNpub`, `collection`, `action`, and `replyPubkey`.
4. Server performs the MongoDB operation and constructs a response:

```json
{
  "status": "ok",
  "data": [/* documents or update result */]
}
```

5. Server sends the response back encrypted to `replyPubkey`.
6. Client listens with `receive()` using its ephemeral private key and processes the result.

## Implementation Notes

- Environment variables hold the server private key (`NOSTRMQ_PRIVKEY`), relay list (`NOSTRMQ_RELAYS`), and allowed sender pubkeys (`ALLOWED_SENDERS`).
- The server uses **Mongoose** to interact with a local MongoDB instance (`mongodb://localhost:27017`).
- The mapping from `dbNpub` to actual MongoDB database names can live in a simple JavaScript object.
- To keep the example self‑contained, PoW is disabled during testing.

See [examples/mongo-pilot-server.js](../examples/mongo-pilot-server.js) and [examples/mongo-pilot-client.js](../examples/mongo-pilot-client.js) for runnable snippets.
