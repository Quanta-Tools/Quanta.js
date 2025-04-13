import { Quanta } from "./quanta";

// Constants
const PERSISTENCE_KEY = "tools.quanta.sessions";
const MINIMUM_ESTIMATED_DURATION = 5.0; // Seconds

// Types
export interface StoredSession {
  screenId: string;
  args?: Record<string, string>;
  accumulatedTime: number; // in milliseconds
  lastUpdateTime: number;
  startTime: number;
  isEstimated: boolean;
}

/**
 * Service for managing session storage
 */
export class SessionStorageService {
  /**
   * Store multiple sessions to secure storage
   */
  static async persistSessions(sessions: StoredSession[]): Promise<void> {
    try {
      const sessionsJson = JSON.stringify(sessions);
      await Quanta.asyncStorage.setItem(PERSISTENCE_KEY, sessionsJson);
    } catch (error) {
      console.error("Failed to persist sessions:", error);
    }
  }

  /**
   * Store a single session with estimated duration
   * This is used only for crash recovery and should not affect actual duration tracking
   */
  static async persistSessionWithEstimatedDuration(
    screenId: string,
    args?: Record<string, string>,
    startTime?: number
  ): Promise<void> {
    try {
      // Get existing sessions
      const existingSessions = await this.getStoredSessions();

      // Filter out any existing session with this screenId
      const filteredSessions = existingSessions.filter(
        (session) => session.screenId !== screenId
      );

      // Add new session with estimated duration
      const now = Date.now();
      filteredSessions.push({
        screenId,
        args: args || {},
        accumulatedTime: MINIMUM_ESTIMATED_DURATION * 1000, // Convert to ms
        lastUpdateTime: now,
        startTime: startTime || now,
        isEstimated: true,
      });

      // Save updated sessions
      await this.persistSessions(filteredSessions);
    } catch (error) {
      console.error(
        "Failed to persist session with estimated duration:",
        error
      );
    }
  }

  /**
   * Get all stored sessions
   */
  static async getStoredSessions(): Promise<StoredSession[]> {
    try {
      const sessionsJson = await Quanta.asyncStorage.getItem(PERSISTENCE_KEY);
      if (!sessionsJson) return [];

      return JSON.parse(sessionsJson);
    } catch (error) {
      console.error("Failed to retrieve stored sessions:", error);
      return [];
    }
  }

  /**
   * Clear all sessions from storage
   */
  static async clearSessions(): Promise<void> {
    try {
      await Quanta.asyncStorage.setItem(PERSISTENCE_KEY, "[]");
    } catch (error) {
      console.error("Failed to clear sessions:", error);
    }
  }

  /**
   * Update persisted session with actual duration
   */
  static async updateSessionDuration(
    screenId: string,
    duration: number,
    args?: Record<string, string>,
    startTime?: number
  ): Promise<void> {
    try {
      // Get existing sessions
      const existingSessions = await this.getStoredSessions();

      // Find and update or add the session
      const existingIndex = existingSessions.findIndex(
        (session) => session.screenId === screenId
      );

      const now = Date.now();
      const sessionToUpdate: StoredSession = {
        screenId,
        args: args || {},
        accumulatedTime: duration,
        lastUpdateTime: now,
        startTime: startTime || now - duration,
        isEstimated: false,
      };

      if (existingIndex >= 0) {
        existingSessions[existingIndex] = sessionToUpdate;
      } else {
        existingSessions.push(sessionToUpdate);
      }

      // Save updated sessions
      await this.persistSessions(existingSessions);
    } catch (error) {
      console.error("Failed to update session duration:", error);
    }
  }

  /**
   * Remove a session from storage
   * @param screenId The ID of the screen session to remove
   */
  static async removeSession(screenId: string): Promise<void> {
    try {
      // Get the raw JSON string first
      const sessionsJson = await Quanta.asyncStorage.getItem(PERSISTENCE_KEY);
      if (!sessionsJson) return; // No sessions to remove

      // Parse the sessions
      const sessions = JSON.parse(sessionsJson);

      // Filter out the specified session
      const filteredSessions = sessions.filter(
        (session: StoredSession) => session.screenId !== screenId
      );

      // If nothing changed, return early
      if (filteredSessions.length === sessions.length) return;

      // Save updated sessions
      const updatedJson = JSON.stringify(filteredSessions);
      await Quanta.asyncStorage.setItem(PERSISTENCE_KEY, updatedJson);
    } catch (error) {
      console.error("Failed to remove session:", error);
    }
  }

  /**
   * Detect if we have any stored sessions that may indicate a crash
   */
  static async hasCrashEvidence(): Promise<boolean> {
    try {
      const sessionsJson = await Quanta.asyncStorage.getItem(PERSISTENCE_KEY);
      const sessions = sessionsJson ? JSON.parse(sessionsJson) : [];
      return sessions.length > 0;
    } catch (error) {
      console.error("Failed to check for crash evidence:", error);
      return false;
    }
  }
}
