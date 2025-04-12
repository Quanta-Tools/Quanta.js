// Pre-setup for Jest to mock all required modules

// Basic React mock to ensure hooks don't throw errors
global.React = {
  createContext: () => ({
    Provider: () => null,
    Consumer: () => null,
  }),
};

// Remove or comment out the following block so that the test file's mock for "react-native" is used:
// jest.mock("react-native", () => ({
//   AppState: {
//     currentState: "active",
//     addEventListener: jest.fn(() => ({ remove: jest.fn() })),
//   },
//   Platform: {
//     OS: "ios",
//     select: jest.fn((obj) => obj.ios),
//   },
//   NativeModules: {},
//   NativeEventEmitter: jest.fn(() => ({
//     addListener: jest.fn(),
//     removeAllListeners: jest.fn(),
//   })),
// }));

// Mock Expo modules
jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("expo-device", () => ({
  deviceName: "Test Device",
  modelName: "Test Model",
  osName: "Test OS",
  osVersion: "1.0",
}));

jest.mock("expo-constants", () => ({
  expoConfig: {
    version: "1.0.0",
  },
}));

jest.mock("expo-localization", () => ({
  locale: "en-US",
  timezone: "America/New_York",
  getLocales: () => [{ languageTag: "en-US" }],
}));

jest.mock("expo-application", () => ({
  applicationId: "com.test.app",
  nativeApplicationVersion: "1.0.0",
  nativeBuildVersion: "1",
}));

// Make sure fetch is available
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
  })
);

// Global variables
global.__DEV__ = true;
global.mockAppStateCallback = null;

console.log("Pre-setup completed");
