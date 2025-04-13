import { useCallback, useEffect, useRef, useState } from "react";
import Device from "expo-device";
import Localization from "expo-localization";
import Application from "expo-application";
import { AppState, AppStateStatus, Platform } from "react-native";
import { SessionStorageService, StoredSession } from "./sessionStorage";
import { Quanta } from "./quanta";

// Types
interface ScreenSession {
  screenId: string;
  args?: Record<string, string>;
  startTime: number;
  pauseTime?: number;
  accumulatedTime: number;
  isPaused: boolean;
  sessionStartTime: number; // Keep the original start time for analytics
}

interface ScreenViewOptions {
  screenId?: string;
  args?: Record<string, string>;
}

// Constants
const PERSISTENCE_KEY_ACTIVE_SESSIONS = "tools.quanta.active_sessions";
const PERSISTENCE_INTERVAL = 10000; // 10 seconds
const MINIMUM_TRACKABLE_DURATION = 500; // 0.5 seconds
const MAX_RESTORE_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Types for AppState handling
type AppStateTransition = {
  from: AppStateStatus;
  to: AppStateStatus;
  timestamp: number;
};

/**
 * Formats a duration number to a short string representation
 */
export function shortString(value: number) {
  if (Math.abs(value) > 9_999) {
    return value.toExponential(2).replace(/e\+/, "e").replace(/e-/, "e-");
  } else if (value === 0 || Math.abs(value) < 0.001) {
    return "0";
  } else {
    let intLength = Math.floor(Math.abs(value)).toString().length;
    if (intLength >= 4) {
      return value
        .toLocaleString("en-US", {
          style: "decimal",
          maximumFractionDigits: 2,
        })
        .replace(/,/g, "");
    }
    let remainingDigits = 4 - intLength;
    return value
      .toLocaleString("en-US", {
        style: "decimal",
        maximumFractionDigits: Math.min(remainingDigits, 2),
      })
      .replace(/,/g, "");
  }
}

/**
 * Hook for tracking screen view time and analytics
 */
export const useScreenTracking = () => {
  // State and refs
  const [activeSessions, setActiveSessions] = useState<
    Record<string, ScreenSession>
  >({});
  const createdSessionsRef = useRef<Set<string>>(new Set());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const appStateTransitionsRef = useRef<AppStateTransition[]>([]);
  const lastStateChangeRef = useRef<number>(Date.now());
  const persistenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoadRef = useRef<boolean>(true);
  const restoredSessionsRef = useRef<StoredSession[]>([]);
  const initializedRef = useRef<boolean>(false);
  const isIOS = Platform.OS === "ios";

  /**
   * Helper functions for session management
   */
  const saveActiveSessionsToStorage = useCallback(async () => {
    try {
      await Quanta.asyncStorage.setItem(
        PERSISTENCE_KEY_ACTIVE_SESSIONS,
        JSON.stringify(activeSessions)
      );
    } catch (error) {
      console.error("[ScreenTracker] Failed to save active sessions:", error);
    }
  }, [activeSessions]);

  const loadActiveSessionsFromStorage = useCallback(async () => {
    try {
      const sessionsJson = await Quanta.asyncStorage.getItem(
        PERSISTENCE_KEY_ACTIVE_SESSIONS
      );
      if (sessionsJson) {
        const loadedSessions = JSON.parse(sessionsJson);
        Object.keys(loadedSessions).forEach((id) =>
          createdSessionsRef.current.add(id)
        );
        setActiveSessions(loadedSessions);
        return loadedSessions;
      }
      return {};
    } catch (error) {
      console.error("[ScreenTracker] Failed to load active sessions:", error);
      return {};
    }
  }, []);

  const calculateDuration = useCallback((session: ScreenSession): number => {
    if (session.isPaused) {
      return session.accumulatedTime;
    }
    return session.accumulatedTime + (Date.now() - session.startTime);
  }, []);

  const finishSession = useCallback(
    (screenId: string, session: ScreenSession, duration: number) => {
      SessionStorageService.removeSession(screenId);

      if (duration < MINIMUM_TRACKABLE_DURATION) return;

      // Convert duration from milliseconds to seconds
      const durationSeconds = duration / 1000;
      const formattedDuration = shortString(durationSeconds);

      // Log the view event with Quanta
      Quanta.logWithRevenue(
        "view",
        0,
        { screen: screenId, seconds: formattedDuration, ...session.args },
        new Date(session.startTime)
      );
    },
    []
  );

  /**
   * Core tracking methods
   */
  const startScreenView = useCallback((options: ScreenViewOptions = {}) => {
    const { screenId = "Unknown", args } = options;
    const now = Date.now();

    if (!createdSessionsRef.current.has(screenId)) {
      createdSessionsRef.current.add(screenId);
      SessionStorageService.persistSessionWithEstimatedDuration(
        screenId,
        args,
        now
      );
    }

    setActiveSessions((prev) => {
      const updated = prev[screenId]
        ? {
            ...prev,
            [screenId]: {
              ...prev[screenId],
              args: { ...(prev[screenId].args || {}), ...(args || {}) },
            },
          }
        : {
            ...prev,
            [screenId]: {
              screenId,
              args,
              startTime: now,
              accumulatedTime: 0,
              isPaused: false,
              sessionStartTime: now,
            },
          };

      // Save active sessions immediately to ensure they survive remounts
      Quanta.asyncStorage
        .setItem(PERSISTENCE_KEY_ACTIVE_SESSIONS, JSON.stringify(updated))
        .catch(console.error);

      return updated;
    });

    return screenId;
  }, []);

  const endScreenView = useCallback(
    (screenId: string) => {
      const session = activeSessions[screenId];

      if (!session) {
        // Try to load sessions from storage
        Quanta.asyncStorage
          .getItem(PERSISTENCE_KEY_ACTIVE_SESSIONS)
          .then((sessionsJson) => {
            if (!sessionsJson) return;

            const storedSessions = JSON.parse(sessionsJson);
            const storedSession = storedSessions[screenId];

            if (!storedSession) return;

            // Calculate duration from stored session
            const duration = storedSession.isPaused
              ? storedSession.accumulatedTime
              : storedSession.accumulatedTime +
                (Date.now() - storedSession.startTime);

            finishSession(screenId, storedSession, duration);

            // Remove from stored sessions
            delete storedSessions[screenId];
            Quanta.asyncStorage
              .setItem(
                PERSISTENCE_KEY_ACTIVE_SESSIONS,
                JSON.stringify(storedSessions)
              )
              .catch(console.error);
          })
          .catch(console.error);
        return;
      }

      // Remove from active sessions
      setActiveSessions((prev) => {
        const { [screenId]: removed, ...rest } = prev;

        // Update storage after removing the session
        Quanta.asyncStorage
          .setItem(PERSISTENCE_KEY_ACTIVE_SESSIONS, JSON.stringify(rest))
          .catch(console.error);

        return rest;
      });

      // Calculate duration and log event
      const duration = calculateDuration(session);
      finishSession(screenId, session, duration);
    },
    [activeSessions, calculateDuration, finishSession]
  );

  const pauseScreenView = useCallback(
    (screenId: string) => {
      setActiveSessions((currentSessions) => {
        if (!currentSessions[screenId] || currentSessions[screenId].isPaused) {
          return currentSessions;
        }

        const session = currentSessions[screenId];
        const now = Date.now();

        const updated = {
          ...currentSessions,
          [screenId]: {
            ...session,
            pauseTime: now,
            accumulatedTime:
              session.accumulatedTime + (now - session.startTime),
            isPaused: true,
          },
        };

        saveActiveSessionsToStorage();
        return updated;
      });
    },
    [saveActiveSessionsToStorage]
  );

  const resumeScreenView = useCallback(
    (screenId: string) => {
      setActiveSessions((currentSessions) => {
        if (!currentSessions[screenId] || !currentSessions[screenId].isPaused) {
          return currentSessions;
        }

        const session = currentSessions[screenId];
        const updated = {
          ...currentSessions,
          [screenId]: {
            ...session,
            startTime: Date.now(),
            pauseTime: undefined,
            isPaused: false,
          },
        };

        saveActiveSessionsToStorage();
        return updated;
      });
    },
    [saveActiveSessionsToStorage]
  );

  /**
   * Session management for app state changes
   */
  const pauseAllSessions = useCallback(() => {
    const now = Date.now();

    setActiveSessions((currentSessions) => {
      const updatedSessions: Record<string, ScreenSession> = {};

      Object.entries(currentSessions).forEach(([id, session]) => {
        if (!session.isPaused) {
          const elapsed = now - session.startTime;
          updatedSessions[id] = {
            ...session,
            accumulatedTime: session.accumulatedTime + elapsed,
            pauseTime: now,
            isPaused: true,
          };
        } else {
          updatedSessions[id] = session;
        }
      });

      return updatedSessions;
    });

    // After pausing, save active sessions to storage
    saveActiveSessionsToStorage();

    // Persist all sessions with actual durations when going to background
    persistAllSessions(true).catch(console.error);
  }, [activeSessions, saveActiveSessionsToStorage]);

  const resumeAllSessions = useCallback(() => {
    const now = Date.now();

    setActiveSessions((currentSessions) => {
      const updatedSessions: Record<string, ScreenSession> = {};

      Object.entries(currentSessions).forEach(([id, session]) => {
        if (session.isPaused) {
          updatedSessions[id] = {
            ...session,
            startTime: now,
            pauseTime: undefined,
            isPaused: false,
          };
        } else {
          updatedSessions[id] = session;
        }
      });

      return updatedSessions;
    });

    // After resuming, save active sessions to storage
    saveActiveSessionsToStorage();

    // We might also want to refresh persistence now that we're back
    setupPeriodicPersistence();
  }, [activeSessions, saveActiveSessionsToStorage]);

  /**
   * AppState change handler
   */
  const handleAppStateChange = useCallback(
    (nextAppState: AppStateStatus) => {
      const now = Date.now();
      const prevState = appStateRef.current;

      // Record this transition
      appStateTransitionsRef.current.push({
        from: prevState,
        to: nextAppState,
        timestamp: now,
      });

      // Keep the history manageable
      if (appStateTransitionsRef.current.length > 10) {
        appStateTransitionsRef.current.shift();
      }

      // Calculate time since last state change
      const timeSinceLastChange = now - lastStateChangeRef.current;
      lastStateChangeRef.current = now;

      // App came to the foreground
      if (
        (prevState === "background" || prevState === "inactive") &&
        nextAppState === "active"
      ) {
        resumeAllSessions();
      }
      // App went to the background
      else if (
        prevState === "active" &&
        (nextAppState === "background" || nextAppState === "inactive")
      ) {
        pauseAllSessions();
      }
      // iOS-specific: Handle quick transitions through 'inactive'
      else if (
        isIOS &&
        prevState === "inactive" &&
        nextAppState === "background" &&
        timeSinceLastChange < 1000
      ) {
        pauseAllSessions();
      }

      // Update the reference to current state
      appStateRef.current = nextAppState;
    },
    [pauseAllSessions, resumeAllSessions, isIOS]
  );

  /**
   * Persistence functions
   */
  const persistAllSessions = async (useActualDurationOnly: boolean = false) => {
    // Skip if no active sessions
    if (Object.keys(activeSessions).length === 0) return;

    // Prepare sessions for storage
    const sessionsToStore: StoredSession[] = Object.values(activeSessions).map(
      (session) => {
        // Calculate current duration
        const currentDuration = calculateDuration(session);

        // If useActualDurationOnly is true, use the actual duration
        // Otherwise ensure we have at least the minimum estimated duration
        const durationToStore = useActualDurationOnly
          ? currentDuration
          : Math.max(currentDuration, PERSISTENCE_INTERVAL / 2);

        return {
          screenId: session.screenId,
          args: session.args,
          accumulatedTime: durationToStore,
          lastUpdateTime: Date.now(),
          startTime: session.sessionStartTime,
          isEstimated:
            !useActualDurationOnly &&
            currentDuration < PERSISTENCE_INTERVAL / 2,
        };
      }
    );

    // Save to secure storage
    await SessionStorageService.persistSessions(sessionsToStore);
  };

  const setupPeriodicPersistence = useCallback(() => {
    // Clear any existing timer
    if (persistenceTimerRef.current) {
      clearInterval(persistenceTimerRef.current);
    }

    // Set up new timer
    persistenceTimerRef.current = setInterval(async () => {
      if (Object.keys(activeSessions).length > 0) {
        await persistAllSessions();
      }
    }, PERSISTENCE_INTERVAL);
  }, [activeSessions]);

  /**
   * Process any restored sessions from a previous app run
   */
  const processRestoredSessions = useCallback(async () => {
    try {
      // Skip if we've already processed restored sessions
      if (!isFirstLoadRef.current) return;

      isFirstLoadRef.current = false;

      // Get stored sessions
      const storedSessions = await SessionStorageService.getStoredSessions();
      restoredSessionsRef.current = [...storedSessions];

      if (storedSessions.length === 0) return;

      // Filter out very old sessions (24+ hours)
      const now = Date.now();
      const validSessions = storedSessions.filter((session) => {
        const sessionAge = now - session.startTime;
        return sessionAge <= MAX_RESTORE_SESSION_AGE;
      });

      if (validSessions.length === 0) {
        await SessionStorageService.clearSessions();
        return;
      }

      // Process each session
      for (const session of validSessions) {
        // Skip sessions with duration below threshold
        if (session.accumulatedTime < MINIMUM_TRACKABLE_DURATION) continue;

        // Check if we also have an active session stored in AsyncStorage
        try {
          const activeSessionsJson = await Quanta.asyncStorage.getItem(
            PERSISTENCE_KEY_ACTIVE_SESSIONS
          );

          if (activeSessionsJson) {
            const activeStoredSessions = JSON.parse(activeSessionsJson);

            if (activeStoredSessions[session.screenId]) {
              // We have an active session in storage - use this as it has more accurate state
              setActiveSessions((prev) => ({
                ...prev,
                [session.screenId]: activeStoredSessions[session.screenId],
              }));

              // Update the createdSessionsRef to prevent duplicate persistence
              createdSessionsRef.current.add(session.screenId);

              continue; // Skip the rest, we've handled this session
            }
          }
        } catch (err) {
          console.error(
            "[ScreenTracker] Error checking active stored sessions:",
            err
          );
        }

        // If we get here, we need to create a session from the stored session data
        const now = Date.now();

        // If the session is estimated (from crash recovery), we should use 0 for accumulatedTime
        // to avoid adding the 5s minimum
        const accumulatedTime = session.isEstimated
          ? 0
          : session.accumulatedTime;

        setActiveSessions((prev) => ({
          ...prev,
          [session.screenId]: {
            screenId: session.screenId,
            args: session.args || {},
            startTime: now,
            accumulatedTime: accumulatedTime,
            isPaused: false,
            sessionStartTime: session.startTime,
          },
        }));

        // Make sure we mark this session as tracked
        createdSessionsRef.current.add(session.screenId);
      }

      // Clear stored sessions after processing
      await SessionStorageService.clearSessions();
    } catch (error) {
      console.error(
        "[ScreenTracker] Failed to process restored sessions:",
        error
      );
    }
  }, []);

  /**
   * Determine startup state
   */
  const determineStartupState = useCallback(async () => {
    try {
      // Process any restored sessions
      await processRestoredSessions();
    } catch (error) {
      console.error("[ScreenTracker] Error determining startup state:", error);
    }
  }, [processRestoredSessions]);

  /**
   * Initialize component
   */
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      loadActiveSessionsFromStorage().catch(console.error);
    }
  }, [loadActiveSessionsFromStorage]);

  /**
   * Handle app state changes
   */
  useEffect(() => {
    // Determine startup state
    determineStartupState().catch(console.error);

    // Subscribe to app state changes
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    // Force assignment so tests can detect the listener.
    (global as any).mockAppStateCallback = handleAppStateChange;

    // Setup periodic persistence
    setupPeriodicPersistence();

    // Cleanup
    return () => {
      subscription.remove();
      if (persistenceTimerRef.current) {
        clearInterval(persistenceTimerRef.current);
      }

      // Save active sessions before unmounting
      saveActiveSessionsToStorage().catch(console.error);
    };
  }, [
    handleAppStateChange,
    setupPeriodicPersistence,
    determineStartupState,
    loadActiveSessionsFromStorage,
    saveActiveSessionsToStorage,
  ]);

  /**
   * Create a tracking function for use in React components
   */
  const trackScreen = useCallback(
    (options: ScreenViewOptions = {}) => {
      const screenId = startScreenView(options);
      // Return cleanup function for useEffect
      return () => endScreenView(screenId);
    },
    [startScreenView, endScreenView]
  );

  /**
   * Get device information for analytics
   */
  const getDeviceInfo = useCallback(async () => {
    return {
      deviceName: Device.deviceName ?? "Unknown Device",
      deviceModel: Device.modelName ?? "Unknown Model",
      osName: Device.osName ?? "Unknown OS",
      osVersion: Device.osVersion ?? "Unknown Version",
      appVersion: Application.nativeApplicationVersion ?? "Unknown App Version",
      buildNumber: Application.nativeBuildVersion ?? "Unknown Build",
      locale: Localization.locale,
      timezone: Localization.timezone,
    };
  }, []);

  return {
    // Core tracking methods
    startScreenView,
    endScreenView,
    pauseScreenView,
    resumeScreenView,

    // Helper for React components
    trackScreen,

    // Utility methods
    getDeviceInfo,
    calculateDuration,

    // For debugging/testing
    _activeSessions: activeSessions,
    _appState: appStateRef.current,
    _stateTransitions: appStateTransitionsRef.current,
    _restoredSessions: restoredSessionsRef.current,

    // For testing the persistence functionality
    _loadActiveSessionsFromStorage: loadActiveSessionsFromStorage,
    _saveActiveSessionsToStorage: saveActiveSessionsToStorage,
  };
};
