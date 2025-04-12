/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  // Do NOT use jest-expo
  // Change from "node" to "jsdom" to provide DOM environment
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": "babel-jest",
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@react-native/js-polyfills)",
  ],
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  setupFiles: ["<rootDir>/jest.setup.pre.js"],
  moduleNameMapper: {
    "^@react-native/(.*)$": "<rootDir>/__mocks__/@react-native/$1",
    "^react-native$": "<rootDir>/node_modules/react-native",
    "^react-native/(.*)$": "<rootDir>/node_modules/react-native/$1",
  },
  // Ensure mocks are loaded from __mocks__ directory
  resetMocks: false,
  restoreMocks: false,
  clearMocks: true,
  // Additional settings to make things work
  globals: {
    "ts-jest": {
      isolatedModules: true,
    },
  },
  moduleDirectories: ["node_modules", "__mocks__"],
};
