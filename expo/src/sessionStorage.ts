import { Quanta } from "./quanta";

// Constants
const PERSISTENCE_KEY = "tools.quanta.sessions";

// Types
export interface CrashedSession {
  screenId: string;
  args?: Record<string, string>;
  startTime: number;
  duration: number;
}

/**
 * Service for managing session storage
 */
export class SessionStorageService {
  private static async persistSessions(sessions: CrashedSession[]) {
    if (sessions.length === 0 && this.wasEmpty) return;
    try {
      const sessionsJson = JSON.stringify(sessions);
      await Quanta.asyncStorage.setItem(PERSISTENCE_KEY, sessionsJson);
      this.wasEmpty = sessions.length === 0;
    } catch (error) {
      console.error("Failed to persist sessions:", error);
    }
  }

  private static async getStoredSessions(): Promise<CrashedSession[]> {
    try {
      const sessionsJson = await Quanta.asyncStorage.getItem(PERSISTENCE_KEY);
      console.log("Getting sessions:", sessionsJson);
      if (!sessionsJson) return [];

      return JSON.parse(sessionsJson);
    } catch (error) {
      console.error("Failed to retrieve stored sessions:", error);
      return [];
    }
  }

  static sessions: CrashedSession[] | null = null;
  static wasEmpty = false;

  public static async get() {
    if (this.sessions !== null) return this.sessions;
    this.sessions = await this.getStoredSessions();
    return this.sessions ?? {};
  }

  public static async set(sessions: CrashedSession[]) {
    this.sessions = sessions;
    console.log("Setting sessions:", JSON.stringify(sessions));
    await this.persistSessions(sessions);
  }
}
