import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { SessionStorageService, StoredSession } from "./sessionStorage";
import { Quanta } from "./quanta";

// Types
interface ScreenSession {
  screenId: string;
  args?: Record<string, string>;
  startTime: number;
  accumulatedTime: number;
  isPaused: boolean;
  sessionStartTime: number;
}

interface ScreenViewOptions {
  screenId?: string;
  args?: Record<string, string>;
}

// Constants
const STORAGE_KEY = "tools.quanta.active_sessions";
const PERSISTENCE_INTERVAL = 10000;
const MINIMUM_DURATION = 500;
const MAX_SESSION_AGE = 24 * 60 * 60 * 1000;

/**
 * Formats a duration in seconds to a string with appropriate precision
 */
export function shortString(value: number) {
  if (Math.abs(value) > 9_999)
    return value.toExponential(2).replace(/e[\+\-]/, "e");
  if (value === 0 || Math.abs(value) < 0.001) return "0";

  const intLength = Math.floor(Math.abs(value)).toString().length;
  const precision = intLength >= 4 ? 2 : Math.min(4 - intLength, 2);

  return value
    .toLocaleString("en-US", {
      style: "decimal",
      maximumFractionDigits: precision,
    })
    .replace(/,/g, "");
}

/**
 * Hook for tracking screen view time and analytics
 */
export const useScreenTracking = () => {
  // State for active sessions
  const [sessions, setSessions] = useState<Record<string, ScreenSession>>({});

  // Refs for persistent values
  const trackedScreens = useRef<Set<string>>(new Set());
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const persistenceTimer = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoad = useRef<boolean>(true);
  const restoredSessions = useRef<StoredSession[]>([]);
  const initialized = useRef<boolean>(false);

  /**
   * Storage helpers
   */
  const saveToStorage = useCallback(
    async (data: Record<string, ScreenSession>) => {
      try {
        await Quanta.asyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        console.error("[ScreenTracker] Failed to save sessions:", error);
      }
    },
    []
  );

  const loadFromStorage = useCallback(async () => {
    try {
      const data = await Quanta.asyncStorage.getItem(STORAGE_KEY);
      if (!data) return {};

      const loaded = JSON.parse(data);
      Object.keys(loaded).forEach((id) => trackedScreens.current.add(id));
      setSessions(loaded);
      return loaded;
    } catch (error) {
      console.error("[ScreenTracker] Failed to load sessions:", error);
      return {};
    }
  }, []);

  /**
   * Core session utilities
   */
  const getDuration = useCallback((session: ScreenSession): number => {
    if (session.isPaused) return session.accumulatedTime;
    return session.accumulatedTime + (Date.now() - session.startTime);
  }, []);

  /**
   * Core tracking methods
   */
  const startScreenView = useCallback(
    (options: ScreenViewOptions = {}) => {
      const { screenId = "Unknown", args } = options; // Keep args potentially undefined here
      const now = Date.now();

      // Create estimated duration session for crash recovery
      if (!trackedScreens.current.has(screenId)) {
        trackedScreens.current.add(screenId);
        SessionStorageService.persistSessionWithEstimatedDuration(
          screenId,
          args, // Pass original args (or undefined) here
          now
        );
      }

      // Update state and storage atomically
      setSessions((prev) => {
        if (prev[screenId]) return prev;

        const updated = {
          ...prev,
          [screenId]: {
            screenId,
            args: args || {}, // Ensure args is an object in the state
            startTime: now,
            accumulatedTime: 0,
            isPaused: false,
            sessionStartTime: now,
          },
        };

        // Save immediately to ensure persistence across remounts
        saveToStorage(updated).catch(console.error);
        return updated;
      });
    },
    [saveToStorage]
  );

  const endScreenView = useCallback(
    (screenId: string) => {
      // Use functional update to ensure we work with the latest state
      setSessions((currentSessions) => {
        const session = currentSessions[screenId];

        if (!session) {
          // If still not found even in latest state, try storage recovery
          // Note: In the crash test scenario, active storage is cleared,
          // so this recovery path is unlikely to find the session here.
          Quanta.asyncStorage
            .getItem(STORAGE_KEY)
            .then((data) => {
              if (!data) return;
              try {
                const stored = JSON.parse(data);
                const storedSession = stored[screenId];
                if (!storedSession) return;

                // Log the recovered session if found (unlikely in crash test)
                endAndLogSession(screenId, storedSession);

                // Remove from storage (if recovered)
                delete stored[screenId];
                saveToStorage(stored).catch(console.error);
              } catch (e) {
                console.error(
                  "[ScreenTracker] Error processing storage recovery in endScreenView:",
                  e
                );
              }
            })
            .catch(console.error);

          return currentSessions; // No change if session not found
        }

        // --- Session found in current state ---
        const duration = getDuration(session);

        // Remove short sessions without logging
        if (duration < MINIMUM_DURATION) {
          SessionStorageService.removeSession(screenId); // Ensure removal from persistent storage
        } else {
          // Log the view event for valid durations
          const durationSec = duration / 1000;
          Quanta.log("view", {
            screen: screenId,
            seconds: shortString(durationSec),
            ...(session.args || {}),
          });

          // Update the session in persistent storage
          SessionStorageService.updateSessionDuration(
            screenId,
            duration,
            session.args || {},
            session.sessionStartTime
          );
        }

        // Remove the session from active state
        const { [screenId]: _, ...rest } = currentSessions;
        saveToStorage(rest).catch(console.error); // Save the updated active state
        return rest; // Return the new state without the ended session
      });
    },
    // Dependencies: saveToStorage, getDuration. 'sessions' is removed as we use the functional update form.
    [saveToStorage, getDuration]
  );

  /**
   * Batch operations for app state changes
   */
  const pauseAllSessions = useCallback(() => {
    const now = Date.now();
    let sessionsToStore: StoredSession[] = []; // Define outside to capture value

    setSessions((prev) => {
      const updated = { ...prev };
      const currentSessionsToStore: StoredSession[] = []; // Calculate inside

      Object.keys(prev).forEach((id) => {
        if (!prev[id].isPaused) {
          const accumulatedTime =
            prev[id].accumulatedTime + (now - prev[id].startTime);
          updated[id] = {
            ...prev[id],
            accumulatedTime: accumulatedTime,
            isPaused: true,
          };
          // Add the *updated* session info for persistence
          currentSessionsToStore.push({
            screenId: updated[id].screenId,
            args: updated[id].args,
            accumulatedTime: accumulatedTime, // Use the calculated time
            lastUpdateTime: now,
            startTime: updated[id].sessionStartTime,
            isEstimated: false, // Pausing implies it's not a fresh estimate
          });
        } else {
          // If already paused, still include it for persistence
          currentSessionsToStore.push({
            screenId: prev[id].screenId,
            args: prev[id].args,
            accumulatedTime: prev[id].accumulatedTime,
            lastUpdateTime: now, // Update timestamp
            startTime: prev[id].sessionStartTime,
            isEstimated: false,
          });
        }
      });

      // Save updated state to active session storage
      saveToStorage(updated).catch(console.error);
      sessionsToStore = currentSessionsToStore; // Assign calculated sessions
      return updated;
    });

    // Persist sessions for crash recovery using the correctly calculated data
    if (sessionsToStore.length > 0) {
      SessionStorageService.persistSessions(sessionsToStore).catch(
        console.error
      );
    }
  }, [saveToStorage]);

  const resumeAllSessions = useCallback(() => {
    const now = Date.now();

    setSessions((prev) => {
      const updated = { ...prev };

      Object.keys(prev).forEach((id) => {
        if (prev[id].isPaused) {
          updated[id] = {
            ...prev[id],
            startTime: now,
            isPaused: false,
          };
        }
      });

      saveToStorage(updated).catch(console.error);
      return updated;
    });
  }, [saveToStorage]);

  /**
   * AppState change handler
   */
  const handleAppStateChange = useCallback(
    (nextState: AppStateStatus) => {
      const prevState = appState.current;

      // Handle state transitions
      if (nextState === "active") {
        resumeAllSessions();
      } else if (prevState === "active") {
        pauseAllSessions();
      }

      appState.current = nextState;
    },
    [pauseAllSessions, resumeAllSessions]
  );

  /**
   * Process restored sessions from crash recovery
   */
  const processRestoredSessions = useCallback(async () => {
    if (!isFirstLoad.current) return;
    isFirstLoad.current = false;

    try {
      // Get stored sessions
      const stored = await SessionStorageService.getStoredSessions();
      restoredSessions.current = [...stored];

      if (stored.length === 0) return;

      // Filter old/invalid sessions
      const now = Date.now();
      const validSessions = stored.filter(
        (s) =>
          s.accumulatedTime >= MINIMUM_DURATION &&
          now - s.startTime <= MAX_SESSION_AGE
      );

      if (validSessions.length === 0) {
        await SessionStorageService.clearSessions();
        return;
      }

      // Check for active sessions in storage first
      const activeSessionsJson = await Quanta.asyncStorage.getItem(STORAGE_KEY);
      const activeStored = activeSessionsJson
        ? JSON.parse(activeSessionsJson)
        : {};

      // Process each session
      // Build updates outside the loop to set state once
      const newSessions: Record<string, ScreenSession> = {};
      for (const session of validSessions) {
        const { screenId } = session;

        // Prefer active sessions from storage over restored ones
        if (activeStored[screenId]) {
          newSessions[screenId] = activeStored[screenId];
          trackedScreens.current.add(screenId);
          continue;
        }

        // Create a fresh session from restored data
        // Reset accumulated time for estimated sessions to avoid adding minimum estimated duration
        newSessions[screenId] = {
          screenId,
          args: session.args || {}, // Ensure args is an object
          startTime: now,
          accumulatedTime: session.isEstimated ? 0 : session.accumulatedTime,
          isPaused: false,
          sessionStartTime: session.startTime,
        };

        trackedScreens.current.add(screenId);
      }

      // Update state with all processed sessions at once
      if (Object.keys(newSessions).length > 0) {
        setSessions((prev) => ({
          ...prev,
          ...newSessions,
        }));
      }

      // Clear stored sessions after processing
      await SessionStorageService.clearSessions();
    } catch (error) {
      console.error(
        "[ScreenTracker] Failed to process restored sessions:",
        error
      );
    }
  }, []); // Removed dependencies that might cause unnecessary reruns

  /**
   * Setup periodic persistence for crash recovery
   */
  const setupPersistence = useCallback(() => {
    if (persistenceTimer.current) {
      clearInterval(persistenceTimer.current);
    }

    persistenceTimer.current = setInterval(() => {
      if (Object.keys(sessions).length == 0) return;
      const sessionsToStore = Object.values(sessions).map((session) => {
        const duration = getDuration(session);

        return {
          screenId: session.screenId,
          args: session.args,
          accumulatedTime: Math.max(duration, PERSISTENCE_INTERVAL / 2),
          lastUpdateTime: Date.now(),
          startTime: session.sessionStartTime,
          isEstimated: duration < PERSISTENCE_INTERVAL / 2,
        };
      });

      SessionStorageService.persistSessions(sessionsToStore).catch(
        console.error
      );
    }, PERSISTENCE_INTERVAL);
  }, [sessions, getDuration]);

  /**
   * Initialize tracking
   */
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadFromStorage().catch(console.error);
  }, [loadFromStorage]);

  /**
   * Setup AppState listener and session restoration
   */
  useEffect(() => {
    // Process any recovered sessions
    processRestoredSessions().catch(console.error);

    // Subscribe to app state changes
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    // For test compatibility
    (global as any).mockAppStateCallback = handleAppStateChange;

    // Setup persistence
    setupPersistence();

    // Cleanup
    return () => {
      subscription.remove();
      if (persistenceTimer.current) {
        clearInterval(persistenceTimer.current);
      }
      saveToStorage(sessions).catch(console.error);
    };
  }, [
    sessions,
    handleAppStateChange,
    processRestoredSessions,
    setupPersistence,
    saveToStorage,
    getDuration, // Added getDuration
  ]);

  return {
    // Core tracking methods
    startScreenView,
    endScreenView,

    // For testing/debugging
    _activeSessions: sessions,
    _appState: appState.current,
    _stateTransitions: [],
    _restoredSessions: restoredSessions.current,
    _loadActiveSessionsFromStorage: loadFromStorage,
    _saveActiveSessionsToStorage: saveToStorage,
  };
};
