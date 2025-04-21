import { useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { SessionStorageService } from "./sessionStorage";
import { Quanta } from "./quanta";

interface StoredSession {
  screenId: string;
  args?: Record<string, string>;
  startTime: number;
  oldStartTime: number;
  pausedAtTime?: number;
}

// Constants
const PERSISTENCE_INTERVAL = 10000;
const MINIMUM_DURATION = 500;
const MINIMUM_ESTIMATED_DURATION = PERSISTENCE_INTERVAL / 2;

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

const sessions = { current: {} as Record<string, StoredSession> };
const appState = { current: AppState.currentState };
const persistenceTimer = { current: null as NodeJS.Timeout | null };
const isFirstLoad = { current: true };

/**
 * Storage helpers
 */
const saveToStorage = async (data: Record<string, StoredSession>) => {
  SessionStorageService.set(
    Object.values(data).map((session) => ({
      screenId: session.screenId,
      args: session.args,
      startTime: session.oldStartTime,
      duration: Math.max(getDuration(session), MINIMUM_ESTIMATED_DURATION),
    }))
  ).catch(console.error);
};

const getDuration = (session: StoredSession): number => {
  if (session.pausedAtTime) return session.pausedAtTime - session.startTime;
  return Date.now() - session.startTime;
};

const initialize = async () => {
  if (!Quanta.getAppId() && __DEV__) {
    console.warn(
      "Make sure your Quanta AppId is set! Check https://github.com/Quanta-Tools/Quanta.js/tree/main/expo#set-appid for more information."
    );
  }

  isFirstLoad.current = false;

  // Subscribe to app state changes
  AppState.addEventListener("change", handleAppStateChange);

  const storedSessions = await SessionStorageService.get();
  storedSessions.forEach((session) => {
    logViewEvent(
      session.startTime,
      session.screenId,
      session.duration,
      session.args
    );
  });
};

const sessionsChanged = async () => {
  if (persistenceTimer.current) {
    clearTimeout(persistenceTimer.current); // Clear previous timer
  }

  if (isFirstLoad.current) await initialize();

  saveToStorage(sessions.current);
  persistenceTimer.current = setInterval(() => {
    saveToStorage(sessions.current);
  }, PERSISTENCE_INTERVAL);
};

const logViewEvent = (
  startTime: number,
  screenId: string,
  durationMs: number,
  args?: Record<string, string>
) => {
  Quanta.logWithRevenue(
    "view",
    0,
    {
      screen: screenId,
      seconds: shortString(durationMs / 1000),
      ...(args || {}),
    },
    new Date(startTime)
  );
};

/**
 * Core tracking methods
 */
const startScreenView = (
  screenId: string,
  args: Record<string, string> = {}
) => {
  const handle = Quanta.generateUuid();
  const now = Date.now();
  console.log("Starting screen view:", screenId, handle);

  sessions.current[handle] = {
    screenId,
    args,
    startTime: now,
    oldStartTime: now,
  };
  sessionsChanged().catch(console.error);

  return handle;
};

const endScreenView = (handle: string) => {
  const session = sessions.current[handle];
  if (!session) {
    console.log("Ending screen view:", handle);
    return;
  }
  console.log("Ending screen view:", handle, JSON.stringify(session));

  const duration = getDuration(session);
  if (duration >= MINIMUM_DURATION) {
    logViewEvent(
      session.oldStartTime,
      session.screenId,
      duration,
      session.args
    );
  }

  delete sessions.current[handle];
  sessionsChanged().catch(console.error);
};

/**
 * Batch operations for app state changes
 */
const pauseSessions = () => {
  const now = Date.now();

  sessions.current = Object.fromEntries(
    Object.entries(sessions.current).map(([handle, session]) => {
      if (session.pausedAtTime !== undefined) return [handle, session];
      return [
        handle,
        {
          ...session,
          pausedAtTime: now,
        },
      ];
    })
  );

  sessionsChanged().catch(console.error);
};

const resumeSessions = () => {
  const now = Date.now();

  sessions.current = Object.fromEntries(
    Object.entries(sessions.current).map(([handle, session]) => {
      if (session.pausedAtTime === undefined) return [handle, session];

      const { pausedAtTime, ...unpaused } = session;
      unpaused.startTime += now - pausedAtTime;

      return [handle, unpaused];
    })
  );

  sessionsChanged().catch(console.error);
};

/**
 * AppState change handler
 */
const handleAppStateChange = (nextState: AppStateStatus) => {
  const prevState = appState.current;

  // Handle state transitions
  if (nextState === "active") {
    resumeSessions();
  } else if (prevState === "active") {
    pauseSessions();
  }

  appState.current = nextState;
};

export const useScreenTracking = () => ({
  startScreenView,
  endScreenView,
});

export const useQuanta = (screenId: string, args?: Record<string, string>) => {
  const { startScreenView, endScreenView } = useScreenTracking();
  useEffect(() => {
    const handle = startScreenView(screenId, args);

    return () => {
      endScreenView(handle);
    };
  }, []);
};
