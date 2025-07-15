import type { TrackingConfig } from "./types.js";
import {
  ensureCacheDir,
  saveTimestamp,
  loadTimestamp,
  saveSnapshot,
  loadSnapshot,
  getTrackingConfig,
} from "./utils.js";

/**
 * MessageTracker prevents replay attacks by tracking processed messages
 * using a combination of timestamp filtering and recent event ID tracking.
 *
 * Features:
 * - Persistent timestamp cache to survive restarts
 * - In-memory recent event ID tracking for duplicate detection
 * - Graceful fallback to memory-only mode if file operations fail
 * - Zero-configuration with sensible defaults
 */
export class MessageTracker {
  private lastProcessed: number;
  private recentEvents: Set<string>;
  private cacheDir: string;
  private config: TrackingConfig;
  private persistenceEnabled: boolean;

  /**
   * Create a new MessageTracker instance
   * @param config - Optional tracking configuration (uses environment defaults if not provided)
   */
  constructor(config?: Partial<TrackingConfig>) {
    const defaultConfig = getTrackingConfig();
    this.config = { ...defaultConfig, ...config };

    this.cacheDir = this.config.cacheDir;
    this.persistenceEnabled = this.config.enablePersistence;
    this.recentEvents = new Set<string>();

    // Initialize with fallback timestamp (1 hour ago by default)
    this.lastProcessed =
      Math.floor(Date.now() / 1000) - this.config.oldestMqSeconds;
  }

  /**
   * Initialize the tracker by loading cached data
   * This should be called once before using the tracker
   *
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    if (!this.persistenceEnabled) {
      console.log(
        "MessageTracker: Persistence disabled, using memory-only mode"
      );
      return;
    }

    try {
      // Ensure cache directory exists
      const dirCreated = await ensureCacheDir(this.cacheDir);
      if (!dirCreated) {
        console.warn(
          "MessageTracker: Failed to create cache directory, falling back to memory-only mode"
        );
        this.persistenceEnabled = false;
        return;
      }

      // Load timestamp from cache
      const cachedTimestamp = await loadTimestamp(this.cacheDir);
      if (cachedTimestamp !== null) {
        // Use cached timestamp, but ensure it's not too old
        const maxAge =
          Math.floor(Date.now() / 1000) - this.config.oldestMqSeconds * 2;
        this.lastProcessed = Math.max(cachedTimestamp, maxAge);
        console.log(
          `MessageTracker: Loaded timestamp from cache: ${new Date(
            this.lastProcessed * 1000
          ).toISOString()}`
        );
      } else {
        console.log(
          "MessageTracker: No cached timestamp found, using default lookback"
        );
      }

      // Load recent event IDs from snapshot
      const cachedEvents = await loadSnapshot(this.cacheDir);
      if (cachedEvents.length > 0) {
        // Limit to configured track limit
        const eventsToLoad = cachedEvents.slice(-this.config.trackLimit);
        this.recentEvents = new Set(eventsToLoad);
        console.log(
          `MessageTracker: Loaded ${eventsToLoad.length} event IDs from cache`
        );
      }
    } catch (error) {
      console.warn(
        "MessageTracker: Failed to initialize cache, falling back to memory-only mode:",
        error
      );
      this.persistenceEnabled = false;
    }
  }

  /**
   * Get the timestamp to use for relay subscription filtering
   * This represents the earliest message timestamp we want to receive
   *
   * @returns Unix timestamp in seconds
   */
  getSubscriptionSince(): number {
    return this.lastProcessed;
  }

  /**
   * Check if an event has already been processed
   * Uses both timestamp and event ID for comprehensive duplicate detection
   *
   * @param eventId - The event ID to check
   * @param timestamp - The event timestamp in seconds
   * @returns true if the event has already been processed
   */
  hasProcessed(eventId: string, timestamp: number): boolean {
    // Check if timestamp is too old (before our tracking window)
    if (timestamp < this.lastProcessed) {
      return true; // Consider old events as already processed
    }

    // Check if we've seen this specific event ID recently
    if (this.recentEvents.has(eventId)) {
      return true;
    }

    return false;
  }

  /**
   * Mark an event as processed and update tracking state
   * This should be called after successfully processing a message
   *
   * @param eventId - The event ID to mark as processed
   * @param timestamp - The event timestamp in seconds
   */
  async markProcessed(eventId: string, timestamp: number): Promise<void> {
    // Update last processed timestamp if this event is newer
    if (timestamp > this.lastProcessed) {
      this.lastProcessed = timestamp;

      // Persist timestamp if enabled
      if (this.persistenceEnabled) {
        await this.saveTimestampAsync(timestamp);
      }
    }

    // Add to recent events set
    this.recentEvents.add(eventId);

    // Trim recent events if we exceed the limit
    if (this.recentEvents.size > this.config.trackLimit) {
      const eventsArray = Array.from(this.recentEvents);
      const toKeep = eventsArray.slice(-this.config.trackLimit);
      this.recentEvents = new Set(toKeep);

      // Persist snapshot if enabled
      if (this.persistenceEnabled) {
        await this.saveSnapshotAsync(toKeep);
      }
    }
  }

  /**
   * Get current tracking statistics for monitoring
   *
   * @returns Object with current tracking state
   */
  getStats(): {
    lastProcessed: number;
    lastProcessedDate: string;
    recentEventsCount: number;
    persistenceEnabled: boolean;
    cacheDir: string;
  } {
    return {
      lastProcessed: this.lastProcessed,
      lastProcessedDate: new Date(this.lastProcessed * 1000).toISOString(),
      recentEventsCount: this.recentEvents.size,
      persistenceEnabled: this.persistenceEnabled,
      cacheDir: this.cacheDir,
    };
  }

  /**
   * Clear all tracking state (useful for testing or reset)
   * This does not delete persistent cache files
   */
  clear(): void {
    this.recentEvents.clear();
    this.lastProcessed =
      Math.floor(Date.now() / 1000) - this.config.oldestMqSeconds;
  }

  /**
   * Gracefully save timestamp to cache file
   * Errors are logged but don't throw to avoid breaking message processing
   */
  private async saveTimestampAsync(timestamp: number): Promise<void> {
    try {
      await saveTimestamp(this.cacheDir, timestamp);
    } catch (error) {
      console.warn("MessageTracker: Failed to save timestamp:", error);
    }
  }

  /**
   * Gracefully save event IDs snapshot to cache file
   * Errors are logged but don't throw to avoid breaking message processing
   */
  private async saveSnapshotAsync(eventIds: string[]): Promise<void> {
    try {
      await saveSnapshot(this.cacheDir, eventIds);
    } catch (error) {
      console.warn("MessageTracker: Failed to save snapshot:", error);
    }
  }
}

/**
 * Create a new MessageTracker instance with default configuration
 * This is a convenience function for common usage
 *
 * @param config - Optional partial configuration to override defaults
 * @returns A new MessageTracker instance
 */
export function createMessageTracker(
  config?: Partial<TrackingConfig>
): MessageTracker {
  return new MessageTracker(config);
}
