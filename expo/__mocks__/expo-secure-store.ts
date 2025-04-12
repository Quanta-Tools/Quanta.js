// Mock implementation of expo-secure-store
let storedItems: Record<string, string> = {};

const SecureStore = {
  setItemAsync: jest.fn((key: string, value: string) => {
    storedItems[key] = value;
    return Promise.resolve();
  }),

  getItemAsync: jest.fn((key: string) => {
    return Promise.resolve(storedItems[key] || null);
  }),

  deleteItemAsync: jest.fn((key: string) => {
    delete storedItems[key];
    return Promise.resolve();
  }),

  // Helper for tests to clear all stored items
  __resetStore: () => {
    storedItems = {};
  },
};

export default SecureStore;
