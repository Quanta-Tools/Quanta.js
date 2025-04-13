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
  const initializedRef = useRef<boolean>(false);

  /**
   * Determine if we're on iOS
   */
  const isIOS = Platform.OS === "ios";

  /**
   * Save active sessions to persistent storage to survive remounts
   */
  const saveActiveSessionsToStorage = useCallback(async () => {
    try {
      await Quanta.asyncStorage.setItem(
        PERSISTENCE_KEY_ACTIVE_SESSIONS,
        JSON.stringify(activeSessions)
      );
      console.log(
        `[ScreenTracker] Saved ${
          Object.keys(activeSessions).length
        } active sessions to storage`
      );
    } catch (error) {
      console.error("[ScreenTracker] Failed to save active sessions:", error);
    }
  }, [activeSessions]);

  /**
   * Load active sessions from persistent storage on initialization
   */
  const loadActiveSessionsFromStorage = useCallback(async () => {
    try {
      const sessionsJson = await Quanta.asyncStorage.getItem(
        PERSISTENCE_KEY_ACTIVE_SESSIONS
      );
      if (sessionsJson) {
        const loadedSessions = JSON.parse(sessionsJson);
        console.log(
          `[ScreenTracker] Loaded ${
            Object.keys(loadedSessions).length
          } active sessions from storage`
        );

        // Update the createdSessionsRef with loaded session IDs
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

  /**
   * Initialize component and load saved sessions
   */
  useEffect(() => {
    if (!initializedRef.current) {
      console.log("[ScreenTracker] Initializing and loading active sessions");
      initializedRef.current = true;
      loadActiveSessionsFromStorage().catch((err) => {
        console.error("[ScreenTracker] Error loading active sessions:", err);
      });
    }
  }, [loadActiveSessionsFromStorage]);

  /**
   * Start tracking a screen view
   */
  const startScreenView = useCallback((options: ScreenViewOptions = {}) => {
    const { screenId = "Unknown", args } = options;
    const now = Date.now();

    console.log(`[ScreenTracker] Starting screen view for "${screenId}"`, {
      timestamp: new Date(now).toISOString(),
      args: args || {},
    });

    // If this session has not been created, mark it and persist immediately.
    if (!createdSessionsRef.current.has(screenId)) {
      console.log(
        `[ScreenTracker] First time seeing session "${screenId}", persisting initial state`
      );
      createdSessionsRef.current.add(screenId);
      SessionStorageService.persistSessionWithEstimatedDuration(
        screenId,
        args,
        now
      );
    } else {
      console.log(
        `[ScreenTracker] Session "${screenId}" already exists in created sessions`
      );
    }

    setActiveSessions((prev) => {
      const updated = prev[screenId]
        ? {
            ...prev,
            [screenId]: {
              ...prev[screenId],
              args: {
                ...(prev[screenId].args || {}),
                ...(args || {}),
              },
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
        .catch((err) => {
          console.error("[ScreenTracker] Error saving active sessions:", err);
        });

      console.log(
        prev[screenId]
          ? `[ScreenTracker] Updating existing session "${screenId}" with new args`
          : `[ScreenTracker] Creating new session for "${screenId}"`
      );

      return updated;
    });

    console.log(
      `[ScreenTracker] Successfully started screen view for "${screenId}"`
    );
    return screenId;
  }, []);

  /**
   * End tracking a screen view
   */
  const endScreenView = useCallback(
    (screenId: string) => {
      console.log(
        `[ScreenTracker] Attempting to end screen view for "${screenId}"`
      );

      const session = activeSessions[screenId];
      if (!session) {
        console.log(
          `[ScreenTracker] No active session found for "${screenId}", checking storage`
        );

        // Try to load sessions from storage synchronously
        Quanta.asyncStorage
          .getItem(PERSISTENCE_KEY_ACTIVE_SESSIONS)
          .then((sessionsJson) => {
            if (!sessionsJson) {
              console.log(`[ScreenTracker] No stored active sessions found`);
              return;
            }

            const storedSessions = JSON.parse(sessionsJson);
            const storedSession = storedSessions[screenId];

            if (!storedSession) {
              console.log(
                `[ScreenTracker] No stored session found for "${screenId}"`
              );
              return;
            }

            console.log(
              `[ScreenTracker] Found stored session for "${screenId}", processing`
            );

            // Calculate duration from stored session
            const duration = storedSession.isPaused
              ? storedSession.accumulatedTime
              : storedSession.accumulatedTime +
                (Date.now() - storedSession.startTime);

            // Process the duration and log
            finishSession(screenId, storedSession, duration);

            // Remove from stored sessions
            delete storedSessions[screenId];
            Quanta.asyncStorage
              .setItem(
                PERSISTENCE_KEY_ACTIVE_SESSIONS,
                JSON.stringify(storedSessions)
              )
              .catch((err) => {
                console.error(
                  "[ScreenTracker] Error updating stored sessions:",
                  err
                );
              });
          })
          .catch((err) => {
            console.error(
              "[ScreenTracker] Error checking stored sessions:",
              err
            );
          });

        return;
      }

      console.log(`[ScreenTracker] Found active session for "${screenId}":`, {
        startTime: new Date(session.startTime).toISOString(),
        isPaused: session.isPaused,
        accumulatedTime: session.accumulatedTime,
        args: session.args,
      });

      // Remove from active sessions
      setActiveSessions((prev) => {
        console.log(
          `[ScreenTracker] Removing session "${screenId}" from active sessions`
        );
        const { [screenId]: removed, ...rest } = prev;

        // Update storage after removing the session
        Quanta.asyncStorage
          .setItem(PERSISTENCE_KEY_ACTIVE_SESSIONS, JSON.stringify(rest))
          .catch((err) => {
            console.error(
              "[ScreenTracker] Error updating stored sessions:",
              err
            );
          });

        return rest;
      });

      // Calculate duration and log event
      const duration = calculateDuration(session);
      console.log(
        `[ScreenTracker] Calculated duration for "${screenId}": ${duration}ms`
      );

      finishSession(screenId, session, duration);
    },
    [activeSessions]
  );

  /**
   * Helper to finish a session after calculating duration
   */
  const finishSession = useCallback(
    (screenId: string, session: ScreenSession, duration: number) => {
      SessionStorageService.removeSession(screenId);
      console.log(`[ScreenTracker] Removed session "${screenId}" from storage`);

      if (duration < MINIMUM_TRACKABLE_DURATION) {
        console.log(
          `[ScreenTracker] Session "${screenId}" duration (${duration}ms) below minimum threshold (${MINIMUM_TRACKABLE_DURATION}ms), skipping analytics`
        );
        return;
      }

      // Convert duration from milliseconds to seconds
      const durationSeconds = duration / 1000;
      const formattedDuration = shortString(durationSeconds);

      console.log(`[ScreenTracker] Logging view event for "${screenId}":`, {
        durationMs: duration,
        durationSec: durationSeconds,
        formattedDuration,
        args: session.args,
      });

      // Log the view event with Quanta
      Quanta.logWithRevenue(
        "view",
        0,
        {
          screen: screenId,
          seconds: formattedDuration,
          ...session.args,
        },
        new Date(session.startTime)
      );

      console.log(
        `[ScreenTracker] Successfully ended screen view for "${screenId}"`
      );
    },
    []
  );

  /**
   * Pause tracking for a specific screen
   */
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

        // Save to storage
        saveActiveSessionsToStorage();

        return updated;
      });
    },
    [saveActiveSessionsToStorage]
  );

  /**
   * Resume tracking for a specific screen
   */
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

        // Save to storage
        saveActiveSessionsToStorage();

        return updated;
      });
    },
    [saveActiveSessionsToStorage]
  );

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

    // After pausing, save active sessions to storage
    saveActiveSessionsToStorage();

    // Persist all sessions with actual durations when going to background
    persistAllSessions(true).catch((error) => {
      console.error(
        "[ScreenTracker] Error persisting sessions during pause:",
        error
      );
    });
  }, [activeSessions, saveActiveSessionsToStorage]);

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

    // After resuming, save active sessions to storage
    saveActiveSessionsToStorage();

    // We might also want to refresh persistence now that we're back
    setupPeriodicPersistence();
  }, [activeSessions, saveActiveSessionsToStorage]);

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

        // Properly restore the session to active sessions
        // This is the key part that was missing - we need to recreate the session in our active sessions
        if (session.accumulatedTime >= MINIMUM_TRACKABLE_DURATION) {
          // Check if we also have an active session stored in AsyncStorage from our previous fix
          try {
            const activeSessionsJson = await Quanta.asyncStorage.getItem(
              PERSISTENCE_KEY_ACTIVE_SESSIONS
            );

            if (activeSessionsJson) {
              const activeStoredSessions = JSON.parse(activeSessionsJson);

              if (activeStoredSessions[session.screenId]) {
                // We have an active session in storage - use this as it has more accurate state
                const storedActiveSession =
                  activeStoredSessions[session.screenId];

                console.log(
                  `[ScreenTracker] Found active stored session for "${session.screenId}", restoring to active sessions`
                );

                setActiveSessions((prev) => ({
                  ...prev,
                  [session.screenId]: storedActiveSession,
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

          // If the session is estimated (from crash recovery), we should use the accumulatedTime
          // directly without adding any additional time to avoid the 5s offset
          const accumulatedTime = session.isEstimated
            ? 0 // Start fresh for estimated sessions to avoid adding the 5s minimum
            : session.accumulatedTime; // Use the actual time for non-estimated sessions

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

          console.log(
            `[ScreenTracker] Added "${session.screenId}" to active sessions with accumulated time ${accumulatedTime}ms (original: ${session.accumulatedTime}ms, isEstimated: ${session.isEstimated})`
          );
        } else {
          console.log(
            `[ScreenTracker] Would track restored session: ${
              session.screenId
            }, duration: ${session.accumulatedTime}ms, startTime: ${new Date(
              session.startTime
            ).toISOString()}`
          );
        }
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

    // Add initialization of active sessions from storage
    if (!initializedRef.current) {
      initializedRef.current = true;
      loadActiveSessionsFromStorage().catch((err) => {
        console.error("[ScreenTracker] Error loading active sessions:", err);
      });
    }

    // Cleanup
    return () => {
      console.log("[ScreenTracker] Cleaning up app state listener and timers");
      subscription.remove();
      if (persistenceTimerRef.current) {
        clearInterval(persistenceTimerRef.current);
      }

      // Save active sessions before unmounting
      saveActiveSessionsToStorage().catch((err) => {
        console.error(
          "[ScreenTracker] Error saving sessions during cleanup:",
          err
        );
      });
    };
  }, [
    handleAppStateChange,
    setupPeriodicPersistence,
    determineStartupState,
    loadActiveSessionsFromStorage,
    saveActiveSessionsToStorage,
  ]);

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

    // For testing the persistence functionality
    _loadActiveSessionsFromStorage: loadActiveSessionsFromStorage,
    _saveActiveSessionsToStorage: saveActiveSessionsToStorage,
  };
};
