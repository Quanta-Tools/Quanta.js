import { useCallback, useEffect, useRef, useState } from "react";
import Device from "expo-device";
import Localization from "expo-localization";
import Application from "expo-application";
import { AppState, AppStateStatus, Platform } from "react-native";
import { SessionStorageService, StoredSession } from "./sessionStorage";
import Quanta from ".";

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
const PERSISTENCE_INTERVAL = 10000; // 10 seconds
const MINIMUM_TRACKABLE_DURATION = 500; // 0.5 seconds
const MAX_RESTORE_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// AppState Handling Enhancements
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
    // Use scientific notation for large numbers

    // Format to scientific notation with 2 decimal places
    const str = value.toExponential(2);

    // Replace "e+" or "e-" with just "e" or "-e"
    return str.replace(/e\+/, "e").replace(/e-/, "e-");
  } else if (value == 0 || Math.abs(value) < 0.001) {
    // Return "0" for very small values
    return "0";
  } else {
    // Check if integer part + fraction ≤ 4 digits
    let intLength = Math.floor(Math.abs(value)).toString().length;

    // If too many digits before the period, round to an integer
    if (intLength >= 4) {
      return value
        .toLocaleString("en-US", {
          style: "decimal",
          maximumFractionDigits: 2,
        })
        .replace(/,/g, "");
    }

    // Limit total length to 4 digits
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
  // State to track active screen sessions
  const [activeSessions, setActiveSessions] = useState<
    Record<string, ScreenSession>
  >({});
  // Add a ref to track created sessions immediately.
  const createdSessionsRef = useRef<Set<string>>(new Set());
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const appStateTransitionsRef = useRef<AppStateTransition[]>([]);
  const lastStateChangeRef = useRef<number>(Date.now());
  const forceRefreshRef = useRef<boolean>(false);
  const persistenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoadRef = useRef<boolean>(true);
  const restoredSessionsRef = useRef<StoredSession[]>([]);
  const appStartTimeRef = useRef<number>(Date.now());

  /**
   * Determine if we're on iOS
   */
  const isIOS = Platform.OS === "ios";

  /**
   * Start tracking a screen view
   */
  const startScreenView = useCallback((options: ScreenViewOptions = {}) => {
    const { screenId = "Unknown", args } = options;
    const now = Date.now();
    // If this session has not been created, mark it and persist immediately.
    if (!createdSessionsRef.current.has(screenId)) {
      createdSessionsRef.current.add(screenId);
      SessionStorageService.persistSessionWithEstimatedDuration(
        screenId,
        args,
        now
      );
    }
    setActiveSessions((prev) => {
      if (prev[screenId]) {
        return {
          ...prev,
          [screenId]: {
            ...prev[screenId],
            args: {
              ...(prev[screenId].args || {}),
              ...(args || {}),
            },
          },
        };
      }
      return {
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
    });
    return screenId;
  }, []);

  /**
   * End tracking a screen view
   */
  const endScreenView = useCallback(
    (screenId: string) => {
      const session = activeSessions[screenId];
      if (!session) return;

      // Remove from active sessions
      setActiveSessions((prev) => {
        const { [screenId]: removed, ...rest } = prev;
        return rest;
      });

      // Calculate duration and log event
      const duration = calculateDuration(session);
      SessionStorageService.removeSession(screenId);
      if (duration < MINIMUM_TRACKABLE_DURATION) return;

      // Convert duration from milliseconds to seconds
      const durationSeconds = duration / 1000;

      // Log the view event with Quanta
      Quanta.log("view", {
        screen: screenId,
        seconds: shortString(durationSeconds),
        ...session.args,
      });
    },
    [activeSessions]
  );

  /**
   * Pause tracking for a specific screen
   */
  const pauseScreenView = useCallback((screenId: string) => {
    setActiveSessions((currentSessions) => {
      if (!currentSessions[screenId] || currentSessions[screenId].isPaused) {
        return currentSessions;
      }

      const session = currentSessions[screenId];
      const now = Date.now();

      return {
        ...currentSessions,
        [screenId]: {
          ...session,
          pauseTime: now,
          accumulatedTime: session.accumulatedTime + (now - session.startTime),
          isPaused: true,
        },
      };
    });
  }, []);

  /**
   * Resume tracking for a specific screen
   */
  const resumeScreenView = useCallback((screenId: string) => {
    setActiveSessions((currentSessions) => {
      if (!currentSessions[screenId] || !currentSessions[screenId].isPaused) {
        return currentSessions;
      }

      const session = currentSessions[screenId];

      return {
        ...currentSessions,
        [screenId]: {
          ...session,
          startTime: Date.now(),
          pauseTime: undefined,
          isPaused: false,
        },
      };
    });
  }, []);

  /**
   * Calculate the duration of a session
   */
  const calculateDuration = (session: ScreenSession): number => {
    if (session.isPaused) {
      return session.accumulatedTime;
    }
    return session.accumulatedTime + (Date.now() - session.startTime);
  };

  /**
   * Pause all active sessions (when app goes to background)
   */
  const pauseAllSessions = useCallback(() => {
    const now = Date.now();
    console.log(
      `[ScreenTracker] Pausing all sessions at ${new Date(now).toISOString()}`
    );

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
          console.log(
            `[ScreenTracker] Paused session "${id}" (+${elapsed}ms, total: ${
              session.accumulatedTime + elapsed
            }ms)`
          );
        } else {
          updatedSessions[id] = session;
          console.log(`[ScreenTracker] Session "${id}" already paused`);
        }
      });

      return updatedSessions;
    });

    // Persist all sessions with actual durations when going to background
    // This is critical for crash recovery if the app is terminated while backgrounded
    persistAllSessions(true).catch((error) => {
      console.error(
        "[ScreenTracker] Error persisting sessions during pause:",
        error
      );
    });
  }, []);

  /**
   * Resume all active sessions (when app comes to foreground)
   */
  const resumeAllSessions = useCallback(() => {
    const now = Date.now();
    console.log(
      `[ScreenTracker] Resuming all sessions at ${new Date(now).toISOString()}`
    );

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
          console.log(`[ScreenTracker] Resumed session "${id}"`);
        } else {
          updatedSessions[id] = session;
          console.log(`[ScreenTracker] Session "${id}" already active`);
        }
      });

      return updatedSessions;
    });

    // We might also want to refresh persistence now that we're back
    setupPeriodicPersistence();
  }, []);

  /**
   * Handle all possible app state transitions
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

      console.log(
        `[ScreenTracker] App state changing from "${prevState}" to "${nextAppState}" ` +
          `(after ${timeSinceLastChange}ms)`
      );

      // Handle based on transition type

      // App came to the foreground
      if (
        (prevState === "background" || prevState === "inactive") &&
        nextAppState === "active"
      ) {
        console.log("[ScreenTracker] App foregrounded");
        resumeAllSessions();
      }
      // App went to the background
      else if (
        prevState === "active" &&
        (nextAppState === "background" || nextAppState === "inactive")
      ) {
        console.log("[ScreenTracker] App backgrounded");
        pauseAllSessions();
      }
      // iOS-specific: Handle quick transitions through 'inactive'
      else if (
        isIOS &&
        prevState === "inactive" &&
        nextAppState === "background"
      ) {
        // Check if this is just a quick transition through 'inactive' to 'background'
        // If too quick, we might want to treat it as a direct active->background transition
        if (timeSinceLastChange < 1000) {
          console.log(
            "[ScreenTracker] Quick transition through 'inactive' to 'background'"
          );
          // Ensure sessions are paused
          pauseAllSessions();
        }
      }
      // Unknown or unexpected state change
      else {
        console.log(
          `[ScreenTracker] Unhandled state transition: ${prevState} -> ${nextAppState}`
        );
      }

      // Update the reference to current state
      appStateRef.current = nextAppState;
    },
    [pauseAllSessions, resumeAllSessions]
  );

  /**
   * Persist all active sessions to secure storage
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
          startTime: session.sessionStartTime, // Use original start time
          isEstimated:
            !useActualDurationOnly &&
            currentDuration < PERSISTENCE_INTERVAL / 2,
        };
      }
    );

    // Save to secure storage
    await SessionStorageService.persistSessions(sessionsToStore);
  };

  /**
   * Setup periodic persistence to handle crashes
   */
  const setupPeriodicPersistence = useCallback(() => {
    // Clear any existing timer
    if (persistenceTimerRef.current) {
      clearInterval(persistenceTimerRef.current);
      console.log("[ScreenTracker] Cleared existing persistence timer");
    }

    // Set up new timer
    persistenceTimerRef.current = setInterval(async () => {
      if (Object.keys(activeSessions).length > 0) {
        console.log(
          `[ScreenTracker] Periodic persistence for ${
            Object.keys(activeSessions).length
          } sessions`
        );
        await persistAllSessions();
      }
    }, PERSISTENCE_INTERVAL);

    console.log(
      `[ScreenTracker] Started new persistence timer (${PERSISTENCE_INTERVAL}ms interval)`
    );
  }, [activeSessions]);

  /**
   * Process any restored sessions from a previous app run on initial load
   * This handles crash recovery by processing sessions that were active
   * when the app crashed or was terminated
   */
  const processRestoredSessions = useCallback(async () => {
    try {
      // Skip if we've already processed restored sessions
      if (!isFirstLoadRef.current) {
        console.log(
          "[ScreenTracker] Already processed restored sessions, skipping"
        );
        return;
      }

      console.log("[ScreenTracker] Processing restored sessions");
      isFirstLoadRef.current = false;

      // Get stored sessions
      const storedSessions = await SessionStorageService.getStoredSessions();
      restoredSessionsRef.current = [...storedSessions];

      if (storedSessions.length === 0) {
        console.log("[ScreenTracker] No stored sessions found");
        return;
      }

      console.log(
        `[ScreenTracker] Found ${storedSessions.length} stored sessions`
      );

      // Filter out very old sessions (24+ hours) to prevent processing sessions from days ago
      const now = Date.now();
      const validSessions = storedSessions.filter((session) => {
        const sessionAge = now - session.startTime;
        const isValid = sessionAge <= MAX_RESTORE_SESSION_AGE;
        if (!isValid) {
          console.log(
            `[ScreenTracker] Skipping old session "${session.screenId}" (age: ${
              sessionAge / 1000
            }s)`
          );
        }
        return isValid;
      });

      if (validSessions.length === 0) {
        console.log("[ScreenTracker] No valid sessions to restore");
        await SessionStorageService.clearSessions();
        return;
      }

      console.log(
        `[ScreenTracker] Processing ${validSessions.length} valid sessions`
      );

      // Process each session
      for (const session of validSessions) {
        // Skip sessions with duration below threshold
        if (session.accumulatedTime < MINIMUM_TRACKABLE_DURATION) {
          console.log(
            `[ScreenTracker] Skipping short session "${session.screenId}" (${session.accumulatedTime}ms)`
          );
          continue;
        }

        console.log(
          `[ScreenTracker] Restored session "${session.screenId}" with duration ${session.accumulatedTime}ms, isEstimated=${session.isEstimated}`
        );

        // In a later step, we'll send analytics for these sessions
        // The important part is to mark these as incomplete/crashed sessions

        // For now we'll just log the sessions we would track
        console.log(
          `[ScreenTracker] Would track restored session: ${
            session.screenId
          }, duration: ${session.accumulatedTime}ms, startTime: ${new Date(
            session.startTime
          ).toISOString()}`
        );
      }

      // Clear stored sessions after processing
      await SessionStorageService.clearSessions();
      console.log("[ScreenTracker] Cleared stored sessions after processing");
    } catch (error) {
      console.error(
        "[ScreenTracker] Failed to process restored sessions:",
        error
      );
    }
  }, []);

  /**
   * Determine if the current app startup is a fresh start or coming from background
   */
  const determineStartupState = useCallback(async () => {
    try {
      // Get stored sessions to see if we have any
      const storedSessions = await SessionStorageService.getStoredSessions();

      // Get the last app state transition time (if available)
      const lastTransition =
        appStateTransitionsRef.current.length > 0
          ? appStateTransitionsRef.current[
              appStateTransitionsRef.current.length - 1
            ]
          : null;

      const now = Date.now();
      const appStartupTime = appStartTimeRef.current;
      const timeSinceStart = now - appStartupTime;

      // If we have stored sessions, it might indicate a crash or forced termination
      const hasSuspiciousTermination = storedSessions.length > 0;

      console.log(
        `[ScreenTracker] App startup state: ` +
          `timeSinceStart=${timeSinceStart}ms, ` +
          `storedSessionsCount=${storedSessions.length}, ` +
          `currentState=${AppState.currentState}, ` +
          `hasSuspiciousTermination=${hasSuspiciousTermination}`
      );

      // Process any restored sessions
      await processRestoredSessions();
    } catch (error) {
      console.error("[ScreenTracker] Error determining startup state:", error);
    }
  }, [processRestoredSessions]);

  /**
   * Handle app state changes
   */
  useEffect(() => {
    console.log("[ScreenTracker] Setting up app state change listener");

    // Determine startup state
    determineStartupState().catch((error) => {
      console.error(
        "[ScreenTracker] Error during startup state detection:",
        error
      );
    });

    // Subscribe to app state changes
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    // Force assignment so tests can detect the listener.
    (global as any).mockAppStateCallback = handleAppStateChange;

    // Additional setup for iOS
    if (isIOS) {
      // On iOS, we need to handle the active->inactive->background transition carefully
      // React Native sometimes doesn't capture all state changes
      console.log("[ScreenTracker] Set up iOS-specific state handling");
    }

    // Setup periodic persistence
    setupPeriodicPersistence();

    // Cleanup
    return () => {
      console.log("[ScreenTracker] Cleaning up app state listener and timers");
      subscription.remove();
      if (persistenceTimerRef.current) {
        clearInterval(persistenceTimerRef.current);
      }
    };
  }, [handleAppStateChange, setupPeriodicPersistence, determineStartupState]);

  /**
   * Force a persistence update when active sessions change
   */
  useEffect(() => {
    // If we have active sessions and this isn't the initial render
    const sessionCount = Object.keys(activeSessions).length;
    if (sessionCount > 0 && forceRefreshRef.current) {
      console.log(
        `[ScreenTracker] Sessions changed, forcing persistence (${sessionCount} sessions)`
      );
      persistAllSessions(false).catch((error) => {
        console.error(
          "[ScreenTracker] Error during forced persistence:",
          error
        );
      });
    }

    // Mark that we've passed initial render
    forceRefreshRef.current = true;
  }, [activeSessions]);

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
  };
};
