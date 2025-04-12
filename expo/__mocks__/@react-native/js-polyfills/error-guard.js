/**
 * Mock implementation of @react-native/js-polyfills/error-guard
 */

// Create a minimal implementation that satisfies what React Native expects
export const ErrorUtils = {
  setGlobalHandler: jest.fn(),
  getGlobalHandler: jest.fn(() => null),
  reportError: jest.fn(),
  reportFatalError: jest.fn(),
};

// Export as both default and named export for compatibility
export default {
  ErrorUtils,
};
