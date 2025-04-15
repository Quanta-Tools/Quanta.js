import { AppStateStatus } from "react-native"; // Keep top-level type imports

// Set up global mock space for tests
declare global {
  namespace NodeJS {
    interface Global {
      mockAppStateCallback?: (state: AppStateStatus) => void; // Use AppStateStatus type
      __mockStoredActiveSessions?: Record<string, any>;
      __mockStorageData?: Record<string, string>;
    }
  }
}

// DO NOT import modules under test or their mocks here yet

// Mock other dependencies that don't need resetModules usually
// These mocks are simple values and less likely to cause issues if not reset,
// but resetting them in beforeEach is safer if they had complex state.
jest.mock("expo-device", () => ({
  deviceName: "Test Device",
  modelName: "Test Model",
  osName: "Test OS",
  osVersion: "1.0",
}));
jest.mock("expo-constants", () => ({}));
jest.mock("expo-localization", () => ({
  locale: "en-US",
  timezone: "America/New_York",
  getLocales: () => [{ languageTag: "en-US" }],
}));
jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.0.0",
  nativeBuildVersion: "1",
}));

describe("Duration Tracking Tests", () => {
  // Define types for modules we will require later
  let useScreenTracking: typeof import("../src/useScreenTracking").useScreenTracking;
  let Quanta: typeof import("../src/quanta").Quanta;
  let SessionStorageService: typeof import("../src/sessionStorage").SessionStorageService;
  let mockAsyncStorage: {
    setItem: jest.Mock;
    getItem: jest.Mock;
    removeItem: jest.Mock;
  };
  let mockAppStateCallbackSetter: (
    callback: (state: AppStateStatus) => void
  ) => void;

  // Before each test
  beforeEach(() => {
    jest.resetModules(); // Reset modules to ensure fresh mocks for each test

    // Initialize storage mock data
    global.__mockStorageData = {};

    // Define mock AsyncStorage implementation
    mockAsyncStorage = {
      setItem: jest
        .fn()
        .mockImplementation(async (key: string, value: string) => {
          global.__mockStorageData![key] = value;
          return Promise.resolve();
        }),
      getItem: jest.fn().mockImplementation(async (key: string) => {
        return Promise.resolve(global.__mockStorageData![key] || null);
      }),
      removeItem: jest.fn().mockImplementation(async (key: string) => {
        delete global.__mockStorageData![key];
        return Promise.resolve();
      }),
    };

    // Mock Quanta - This MUST happen before requiring Quanta or useScreenTracking
    jest.mock("../src/quanta", () => {
      return {
        Quanta: {
          log: jest.fn(),
          logAsync: jest.fn().mockResolvedValue(undefined),
          asyncStorage: mockAsyncStorage,
        },
      };
    });

    // Mock SessionStorageService
    jest.mock("../src/sessionStorage", () => {
      return {
        SessionStorageService: {
          persistSessionWithEstimatedDuration: jest
            .fn()
            .mockResolvedValue(undefined),
          updateSessionDuration: jest.fn().mockResolvedValue(undefined),
          persistSessions: jest.fn().mockResolvedValue(undefined),
          getStoredSessions: jest.fn().mockResolvedValue([]),
          clearSessions: jest.fn().mockResolvedValue(undefined),
          hasCrashEvidence: jest.fn().mockResolvedValue(false),
          removeSession: jest.fn().mockResolvedValue(undefined),
        },
      };
    });

    // Mock AppState and Platform from react-native
    jest.mock("react-native", () => {
      let currentCallback: ((state: AppStateStatus) => void) | null = null;
      mockAppStateCallbackSetter = (callback) => {
        currentCallback = callback;
        global.mockAppStateCallback = callback;
      };
      return {
        AppState: {
          currentState: "active",
          addEventListener: jest.fn((event, callback) => {
            if (event === "change") {
              mockAppStateCallbackSetter(callback);
            }
            return { remove: jest.fn() };
          }),
        },
        Platform: {
          OS: "ios",
        },
      };
    });
    global.mockAppStateCallback = undefined;

    // Use fake timers
    jest.useFakeTimers();
    jest
      .spyOn(global, "setInterval")
      .mockImplementation((callback: any) => 123 as any);
    jest.spyOn(Date, "now").mockReturnValue(1000000);

    // Require the modules AFTER mocks are defined
    Quanta = require("../src/quanta").Quanta;
    SessionStorageService =
      require("../src/sessionStorage").SessionStorageService;
    useScreenTracking = require("../src/useScreenTracking").useScreenTracking;

    SessionStorageService.getStoredSessions.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper function to trigger AppState changes
  function simulateAppStateChange(newState: AppStateStatus) {
    if (global.mockAppStateCallback) {
      global.mockAppStateCallback(newState);
    } else {
      console.warn(
        "AppState listener not set up in mock, ignoring state change"
      );
    }
  }

  // Helper function to simulate app crashes
  async function simulateAppCrash() {
    const activeSessionsJson = await mockAsyncStorage.getItem(
      "tools.quanta.active_sessions"
    );
    if (!activeSessionsJson || activeSessionsJson === "{}") {
      SessionStorageService.getStoredSessions.mockResolvedValue([]);
      await mockAsyncStorage.setItem("tools.quanta.active_sessions", "{}");
      return;
    }

    const activeSessions = JSON.parse(activeSessionsJson);

    const sessionsToStore = Object.entries(activeSessions).map(
      ([screenId, session]) => {
        const sessionObj = session as any;
        const now = Date.now();
        let duration = sessionObj.accumulatedTime;
        if (!sessionObj.isPaused) {
          duration += now - sessionObj.startTime;
        }

        let isEstimated = false;
        const minDuration = 5000;
        const maxDuration = 10000;

        if (duration < minDuration) {
          duration = minDuration;
          isEstimated = true;
        } else if (duration > maxDuration) {
          duration = maxDuration;
        }

        return {
          screenId,
          args: sessionObj.args || {},
          accumulatedTime: duration,
          lastUpdateTime: now,
          startTime: sessionObj.sessionStartTime,
          isEstimated,
        };
      }
    );

    if (sessionsToStore.length > 0) {
      SessionStorageService.getStoredSessions.mockResolvedValue(
        sessionsToStore
      );
    } else {
      SessionStorageService.getStoredSessions.mockResolvedValue([]);
    }

    await mockAsyncStorage.setItem("tools.quanta.active_sessions", "{}");
  }

  // Test Case 1: Open screen, wait 1s, close screen (should log)
  it("should log a view event when a screen is shown for at least 1 second", async () => {
    const hook = useScreenTracking();
    await Promise.resolve(); // Initial load effect

    const screenId = "TestScreen";
    hook.startScreenView({ screenId });
    await Promise.resolve(); // Allow startScreenView's setSessions/save

    jest.spyOn(Date, "now").mockReturnValue(1001000);

    await hook.endScreenView(screenId);
    await Promise.resolve(); // Allow endScreenView's async operations (log, storage)
    await Promise.resolve(); // Extra tick just in case

    expect(Quanta.log).toHaveBeenCalledWith(
      "view",
      expect.objectContaining({
        screen: screenId,
        seconds: "1",
      })
    );

    expect(SessionStorageService.updateSessionDuration).toHaveBeenCalledWith(
      screenId,
      1000,
      {},
      1000000
    );
    expect(SessionStorageService.removeSession).not.toHaveBeenCalled();
  });

  // Test Case 2: Open screen, wait 0.4s, close screen (should not log)
  it("should not log a view event when a screen is shown for less than 500ms", async () => {
    const hook = useScreenTracking();
    await Promise.resolve(); // Initial load effect

    const screenId = "ShortScreen";
    hook.startScreenView({ screenId });
    await Promise.resolve(); // Allow startScreenView's setSessions/save

    jest.spyOn(Date, "now").mockReturnValue(1000400);

    await hook.endScreenView(screenId);
    await Promise.resolve(); // Allow endScreenView's async operations (removeSession)
    await Promise.resolve(); // Extra tick

    expect(Quanta.log).not.toHaveBeenCalled();

    expect(SessionStorageService.updateSessionDuration).not.toHaveBeenCalled();
    expect(SessionStorageService.removeSession).toHaveBeenCalledWith(screenId);
  });

  // Test Case 3: Open screen, wait 1s, crash app, open screen (should log 5s session after crash recovery)
  it("should log based on restored (estimated) + new time after crash recovery", async () => {
    // Instance 1
    let hookInstance1 = useScreenTracking();
    await Promise.resolve(); // Initial load

    const screenId = "CrashRecoveryShortScreen";
    hookInstance1.startScreenView({ screenId });
    await Promise.resolve(); // Allow startScreenView's setSessions/save

    jest.spyOn(Date, "now").mockReturnValue(1001000); // 1s elapsed

    await simulateAppCrash(); // Prepares storage for recovery (5s estimated)

    jest.spyOn(Date, "now").mockReturnValue(1010000); // Restart time

    // Instance 2
    const hookInstance2 = useScreenTracking();
    await Promise.resolve(); // Allow initial render
    await Promise.resolve(); // Allow processRestoredSessions effect
    await Promise.resolve(); // Allow async ops within processRestoredSessions

    // Advance time and end the *restarted* session
    jest.spyOn(Date, "now").mockReturnValue(1011000); // 1s elapsed since restart
    await hookInstance2.endScreenView(screenId);
    await Promise.resolve(); // Allow endScreenView async ops
    await Promise.resolve(); // Extra tick

    // Expect log with duration = 0 (reset estimated) + 1s (since restart) = 1s
    expect(Quanta.log).toHaveBeenCalledWith(
      "view",
      expect.objectContaining({
        screen: screenId,
        seconds: "1",
      })
    );
  });

  // Test Case 4: Open screen, wait 11s, crash app, open screen (should log 10s session after crash recovery)
  it("should log based on restored (capped) + new time after crash recovery", async () => {
    // Instance 1
    let hookInstance1 = useScreenTracking();
    await Promise.resolve(); // Initial load

    const screenId = "CrashRecoveryLongScreen";
    hookInstance1.startScreenView({ screenId });
    await Promise.resolve(); // Allow startScreenView's setSessions/save

    jest.spyOn(Date, "now").mockReturnValue(1011000); // 11s elapsed

    await simulateAppCrash(); // Prepares storage for recovery (10s capped)

    jest.spyOn(Date, "now").mockReturnValue(1020000); // Restart time

    // Instance 2
    const hookInstance2 = useScreenTracking();
    await Promise.resolve(); // Allow initial render
    await Promise.resolve(); // Allow processRestoredSessions effect
    await Promise.resolve(); // Allow async ops within processRestoredSessions

    // Advance time and end the *restarted* session
    jest.spyOn(Date, "now").mockReturnValue(1021000); // 1s elapsed since restart
    await hookInstance2.endScreenView(screenId);
    await Promise.resolve(); // Allow endScreenView async ops
    await Promise.resolve(); // Extra tick

    // Expect log with duration = 10s (capped restored) + 1s (since restart) = 11s
    expect(Quanta.log).toHaveBeenCalledWith(
      "view",
      expect.objectContaining({
        screen: screenId,
        seconds: "11",
      })
    );
  });

  // Test for background/foreground behavior
  it("should accurately track time when app goes to background and returns", async () => {
    const hook = useScreenTracking();
    await Promise.resolve(); // Initial load effect
    await Promise.resolve(); // Allow setupPersistence effect

    const screenId = "BackgroundTest";
    hook.startScreenView({ screenId });
    await Promise.resolve(); // Allow startScreenView's setSessions/save

    jest.spyOn(Date, "now").mockReturnValue(1002000); // 2s elapsed

    simulateAppStateChange("background");
    await Promise.resolve(); // Allow handleAppStateChange -> pauseAllSessions
    await Promise.resolve(); // Allow async ops within pauseAllSessions (saveToStorage, persistSessions)
    await Promise.resolve(); // Extra tick

    // Check active session storage
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      "tools.quanta.active_sessions",
      expect.stringContaining(`"accumulatedTime":2000,"isPaused":true`)
    );
    // Check persistence service call
    expect(SessionStorageService.persistSessions).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          screenId: screenId,
          accumulatedTime: 2000, // Check the time persisted
        }),
      ])
    );

    mockAsyncStorage.setItem.mockClear();
    SessionStorageService.persistSessions.mockClear();

    jest.spyOn(Date, "now").mockReturnValue(1007000); // 5s in background

    simulateAppStateChange("active");
    await Promise.resolve(); // Allow handleAppStateChange -> resumeAllSessions
    await Promise.resolve(); // Allow async ops within resumeAllSessions (saveToStorage)
    await Promise.resolve(); // Extra tick

    // Check active session storage after resume
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      "tools.quanta.active_sessions",
      expect.stringContaining(`"isPaused":false,"startTime":1007000`) // Check resume state
    );
    mockAsyncStorage.setItem.mockClear();

    jest.spyOn(Date, "now").mockReturnValue(1010000); // 3s active after resume

    await hook.endScreenView(screenId);
    await Promise.resolve(); // Allow endScreenView async ops
    await Promise.resolve(); // Extra tick

    // Check final log
    expect(Quanta.log).toHaveBeenCalledWith(
      "view",
      expect.objectContaining({
        screen: screenId,
        seconds: "5", // 2s + 3s = 5s
      })
    );

    // Check final storage update
    expect(SessionStorageService.updateSessionDuration).toHaveBeenCalledWith(
      screenId,
      5000,
      {},
      1000000
    );
  });
});
