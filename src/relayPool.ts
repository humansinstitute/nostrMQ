import { EventEmitter } from "events";
import WebSocket from "ws";
import type { Event as NostrEvent, EventTemplate } from "nostr-tools";
import type { RelayConnection, RelayMessage, NostrMQConfig } from "./types.js";
import {
  isValidRelayUrl,
  retry,
  sleep,
  withTimeout,
  safeJsonParse,
  safeJsonStringify,
  loadConfig,
} from "./utils.js";

/**
 * Relay pool events
 */
export interface RelayPoolEvents {
  "relay:connected": (url: string) => void;
  "relay:disconnected": (url: string, error?: Error) => void;
  "relay:error": (url: string, error: Error) => void;
  "relay:message": (url: string, message: RelayMessage) => void;
  event: (url: string, subscriptionId: string, event: NostrEvent) => void;
  eose: (url: string, subscriptionId: string) => void;
  ok: (
    url: string,
    eventId: string,
    accepted: boolean,
    message: string
  ) => void;
  notice: (url: string, message: string) => void;
  closed: (url: string, subscriptionId: string, message: string) => void;
}

/**
 * Subscription tracking
 */
interface Subscription {
  id: string;
  filters: any[];
  relays: Set<string>;
  active: boolean;
}

/**
 * RelayPool manages connections to multiple Nostr relays
 */
export class RelayPool extends EventEmitter {
  private connections = new Map<string, RelayConnection>();
  private subscriptions = new Map<string, Subscription>();
  private config: NostrMQConfig;
  private reconnectTimeouts = new Map<string, NodeJS.Timeout>();
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // 1 second
  private maxReconnectDelay = 30000; // 30 seconds

  constructor(config?: NostrMQConfig) {
    super();
    this.config = config || loadConfig();

    // Initialize relay connections
    for (const url of this.config.relays) {
      if (isValidRelayUrl(url)) {
        this.connections.set(url, {
          url,
          ws: null,
          state: "disconnected",
          reconnectAttempts: 0,
        });
      }
    }
  }

  /**
   * Connect to all configured relays
   */
  async connect(): Promise<void> {
    const connectionPromises = Array.from(this.connections.keys()).map((url) =>
      this.connectToRelay(url)
    );

    // Wait for at least one successful connection
    try {
      await Promise.race(connectionPromises);
    } catch (error) {
      throw new Error(`Failed to connect to any relay: ${error}`);
    }
  }

  /**
   * Connect to a specific relay
   */
  private async connectToRelay(url: string): Promise<void> {
    const connection = this.connections.get(url);
    if (!connection) {
      throw new Error(`Relay ${url} not found in pool`);
    }

    if (connection.state === "connected" || connection.state === "connecting") {
      return;
    }

    connection.state = "connecting";

    try {
      const ws = new WebSocket(url);
      connection.ws = ws;

      // Set up WebSocket event handlers
      ws.on("open", () => {
        connection.state = "connected";
        connection.reconnectAttempts = 0;
        connection.lastError = undefined;
        this.emit("relay:connected", url);

        // Resubscribe to active subscriptions
        this.resubscribeToRelay(url);
      });

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = safeJsonParse(data.toString()) as RelayMessage;
          this.handleRelayMessage(url, message);
        } catch (error) {
          console.error(`Failed to parse message from ${url}:`, error);
        }
      });

      ws.on("close", (code: number, reason: Buffer) => {
        connection.state = "disconnected";
        connection.ws = null;
        const error = new Error(
          `Connection closed: ${code} ${reason.toString()}`
        );
        this.emit("relay:disconnected", url, error);
        this.scheduleReconnect(url);
      });

      ws.on("error", (error: Error) => {
        connection.state = "error";
        connection.lastError = error;
        this.emit("relay:error", url, error);
        this.scheduleReconnect(url);
      });

      // Wait for connection with timeout
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          ws.once("open", resolve);
          ws.once("error", reject);
        }),
        10000, // 10 second timeout
        `Connection to ${url} timed out`
      );
    } catch (error) {
      connection.state = "error";
      connection.lastError =
        error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(url: string): void {
    const connection = this.connections.get(url);
    if (
      !connection ||
      connection.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      return;
    }

    // Clear any existing timeout
    const existingTimeout = this.reconnectTimeouts.get(url);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    connection.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, connection.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    const timeout = setTimeout(() => {
      this.reconnectTimeouts.delete(url);
      this.connectToRelay(url).catch((error) => {
        console.error(`Reconnection to ${url} failed:`, error);
      });
    }, delay);

    this.reconnectTimeouts.set(url, timeout);
  }

  /**
   * Handle incoming relay messages
   */
  private handleRelayMessage(url: string, message: RelayMessage): void {
    this.emit("relay:message", url, message);

    const [type, ...args] = message;

    switch (type) {
      case "EVENT": {
        const [subscriptionId, event] = args as [string, NostrEvent];
        this.emit("event", url, subscriptionId, event);
        break;
      }
      case "EOSE": {
        const [subscriptionId] = args as [string];
        this.emit("eose", url, subscriptionId);
        break;
      }
      case "OK": {
        const [eventId, accepted, message] = args as [string, boolean, string];
        this.emit("ok", url, eventId, accepted, message);
        break;
      }
      case "NOTICE": {
        const [notice] = args as [string];
        this.emit("notice", url, notice);
        break;
      }
      case "CLOSED": {
        const [subscriptionId, message] = args as [string, string];
        this.emit("closed", url, subscriptionId, message);
        break;
      }
      default:
        console.warn(`Unknown message type from ${url}:`, type);
    }
  }

  /**
   * Publish an event to relays
   */
  async publish(
    event: NostrEvent,
    targetRelays?: string[]
  ): Promise<Map<string, boolean>> {
    const relays = targetRelays || Array.from(this.connections.keys());
    const results = new Map<string, boolean>();

    const publishPromises = relays.map(async (url) => {
      const connection = this.connections.get(url);
      if (!connection || connection.state !== "connected" || !connection.ws) {
        results.set(url, false);
        return;
      }

      try {
        const message = safeJsonStringify(["EVENT", event]);
        connection.ws.send(message);

        // Wait for OK response
        const okReceived = await withTimeout(
          new Promise<boolean>((resolve) => {
            const handler = (
              relayUrl: string,
              eventId: string,
              accepted: boolean
            ) => {
              if (relayUrl === url && eventId === event.id) {
                this.off("ok", handler);
                resolve(accepted);
              }
            };
            this.on("ok", handler);
          }),
          5000, // 5 second timeout
          `Publish timeout for ${url}`
        );

        results.set(url, okReceived);
      } catch (error) {
        console.error(`Failed to publish to ${url}:`, error);
        results.set(url, false);
      }
    });

    await Promise.allSettled(publishPromises);
    return results;
  }

  /**
   * Subscribe to events
   */
  subscribe(
    subscriptionId: string,
    filters: any[],
    targetRelays?: string[]
  ): void {
    const relays = targetRelays || Array.from(this.connections.keys());

    // Store subscription
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      filters,
      relays: new Set(relays),
      active: true,
    });

    // Send REQ to each relay
    for (const url of relays) {
      this.sendSubscriptionToRelay(url, subscriptionId, filters);
    }
  }

  /**
   * Send subscription to a specific relay
   */
  private sendSubscriptionToRelay(
    url: string,
    subscriptionId: string,
    filters: any[]
  ): void {
    const connection = this.connections.get(url);
    if (!connection || connection.state !== "connected" || !connection.ws) {
      return;
    }

    try {
      const message = safeJsonStringify(["REQ", subscriptionId, ...filters]);
      connection.ws.send(message);
    } catch (error) {
      console.error(`Failed to send subscription to ${url}:`, error);
    }
  }

  /**
   * Resubscribe to all active subscriptions for a relay
   */
  private resubscribeToRelay(url: string): void {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.active && subscription.relays.has(url)) {
        this.sendSubscriptionToRelay(
          url,
          subscription.id,
          subscription.filters
        );
      }
    }
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string, targetRelays?: string[]): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    const relays = targetRelays || Array.from(subscription.relays);

    // Send CLOSE to each relay
    for (const url of relays) {
      const connection = this.connections.get(url);
      if (connection && connection.state === "connected" && connection.ws) {
        try {
          const message = safeJsonStringify(["CLOSE", subscriptionId]);
          connection.ws.send(message);
        } catch (error) {
          console.error(`Failed to unsubscribe from ${url}:`, error);
        }
      }
    }

    // Remove subscription if no target relays specified
    if (!targetRelays) {
      subscription.active = false;
      this.subscriptions.delete(subscriptionId);
    } else {
      // Remove only specified relays
      for (const url of targetRelays) {
        subscription.relays.delete(url);
      }
      if (subscription.relays.size === 0) {
        subscription.active = false;
        this.subscriptions.delete(subscriptionId);
      }
    }
  }

  /**
   * Get connected relays
   */
  getConnectedRelays(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, connection]) => connection.state === "connected")
      .map(([url, _]) => url);
  }

  /**
   * Get relay connection status
   */
  getRelayStatus(url: string): RelayConnection | undefined {
    return this.connections.get(url);
  }

  /**
   * Get all relay statuses
   */
  getAllRelayStatuses(): Map<string, RelayConnection> {
    return new Map(this.connections);
  }

  /**
   * Add a new relay to the pool
   */
  addRelay(url: string): void {
    if (!isValidRelayUrl(url)) {
      throw new Error(`Invalid relay URL: ${url}`);
    }

    if (this.connections.has(url)) {
      return; // Already exists
    }

    this.connections.set(url, {
      url,
      ws: null,
      state: "disconnected",
      reconnectAttempts: 0,
    });

    // Auto-connect if pool is already connected
    if (this.getConnectedRelays().length > 0) {
      this.connectToRelay(url).catch((error) => {
        console.error(`Failed to connect to new relay ${url}:`, error);
      });
    }
  }

  /**
   * Remove a relay from the pool
   */
  removeRelay(url: string): void {
    const connection = this.connections.get(url);
    if (!connection) {
      return;
    }

    // Close connection if active
    if (connection.ws) {
      connection.ws.close();
    }

    // Clear reconnect timeout
    const timeout = this.reconnectTimeouts.get(url);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(url);
    }

    // Remove from connections
    this.connections.delete(url);

    // Remove from active subscriptions
    for (const subscription of this.subscriptions.values()) {
      subscription.relays.delete(url);
      if (subscription.relays.size === 0) {
        subscription.active = false;
        this.subscriptions.delete(subscription.id);
      }
    }
  }

  /**
   * Disconnect from all relays and cleanup
   */
  async disconnect(): Promise<void> {
    // Clear all reconnect timeouts
    for (const timeout of this.reconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.reconnectTimeouts.clear();

    // Close all connections
    const disconnectPromises = Array.from(this.connections.values()).map(
      (connection) => {
        if (connection.ws) {
          return new Promise<void>((resolve) => {
            connection.ws!.once("close", () => resolve());
            connection.ws!.close();
          });
        }
        return Promise.resolve();
      }
    );

    await Promise.allSettled(disconnectPromises);

    // Clear subscriptions
    this.subscriptions.clear();

    // Reset connection states
    for (const connection of this.connections.values()) {
      connection.state = "disconnected";
      connection.ws = null;
      connection.reconnectAttempts = 0;
    }
  }
}

/**
 * Create a new RelayPool instance
 */
export function createRelayPool(config?: NostrMQConfig): RelayPool {
  return new RelayPool(config);
}
