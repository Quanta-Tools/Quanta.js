// Main setup file - mock React hooks for testing

// Ensure important mocks are set up before any test modules are imported
jest.mock("react-native/Libraries/EventEmitter/NativeEventEmitter");

// Create persistent state to maintain data between calls
const mockReactState = {};
const mockRefs = {};

// Mock useState hook
const mockUseState = (initialValue) => {
  const key = Math.random().toString();
  if (!mockReactState[key]) {
    mockReactState[key] = initialValue;
  }

  const setValue = (newValue) => {
    mockReactState[key] =
      typeof newValue === "function" ? newValue(mockReactState[key]) : newValue;
    return mockReactState[key];
  };

  return [mockReactState[key], setValue];
};

// Mock useRef hook
const mockUseRef = (initialValue) => {
  const key = Math.random().toString();
  if (!mockRefs[key]) {
    mockRefs[key] = { current: initialValue };
  }
  return mockRefs[key];
};

// Mock useEffect hook
const mockUseEffect = (callback, deps) => {
  callback();
  return undefined;
};

// Mock useCallback hook
const mockUseCallback = (callback) => callback;

// Mock React
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: mockUseState,
  useRef: mockUseRef,
  useEffect: mockUseEffect,
  useCallback: mockUseCallback,
}));

// Set up mock for console.log to be used in tests
global.originalConsoleLog = console.log;
console.log = jest.fn((...args) => {
  // Keep actual logging for debugging but also make it mockable for tests
  global.originalConsoleLog(...args);
});

// Mock the SessionStorageService methods without using relative paths
const mockPersistSessionWithEstimatedDuration = jest.fn();
const mockUpdateSessionDuration = jest.fn();
const mockGetStoredSessions = jest.fn().mockResolvedValue([]);
const mockClearSessions = jest.fn();
const mockPersistSessions = jest.fn();
const mockHasCrashEvidence = jest.fn().mockResolvedValue(false);

// Create global mock objects for the testing framework to use
global.__mocks = {
  sessionStorage: {
    persistSessionWithEstimatedDuration:
      mockPersistSessionWithEstimatedDuration,
    updateSessionDuration: mockUpdateSessionDuration,
    getStoredSessions: mockGetStoredSessions,
    clearSessions: mockClearSessions,
    persistSessions: mockPersistSessions,
    hasCrashEvidence: mockHasCrashEvidence,
  },
};

// Skip the mock implementation of renderHook
// This allows tests to use the real renderHook implementation
// which will call the actual hook with our mocked dependencies

console.log("Main setup completed");

// Ensure fetch is available globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
  })
);

// Mock modules that use native code
jest.mock("react-native/Libraries/EventEmitter/NativeEventEmitter");

// Set up the AppState mock to make it available globally
jest.mock("react-native", () => {
  const appStateChangeListeners = new Set();

  const mockAppState = {
    currentState: "active",
    addEventListener: jest.fn((event, callback) => {
      if (event === "change") {
        appStateChangeListeners.add(callback);
        global.mockAppStateCallback = callback;
      }
      return {
        remove: jest.fn(() => {
          appStateChangeListeners.delete(callback);
          if (global.mockAppStateCallback === callback) {
            global.mockAppStateCallback = null;
          }
        }),
      };
    }),
  };

  return {
    AppState: mockAppState,
    Platform: { OS: "ios" },
  };
});
