// Mock the Quanta class that's used in sessionStorage.ts
jest.mock("../src/quanta", () => ({
  Quanta: {
    asyncStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
    },
    generateUuid: jest.fn().mockReturnValue("test-uuid"),
    logWithRevenue: jest.fn(),
    getAppId: jest.fn(),
    initializeAsync: jest.fn(),
  },
}));

// Mock __DEV__ which is a global in React Native
global.__DEV__ = true;
