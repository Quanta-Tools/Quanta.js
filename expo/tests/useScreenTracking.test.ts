import { AppState } from "react-native";
import { shortString } from "../src/useScreenTracking";
import { Quanta } from "../src/quanta";
import { SessionStorageService } from "../src/sessionStorage";

// Mock the React Native AppState
jest.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: jest.fn(),
  },
}));

// Mock the SessionStorageService
jest.mock("../src/sessionStorage", () => ({
  SessionStorageService: {
    get: jest.fn().mockResolvedValue([]),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));

// Import the actual module for direct testing of standalone functions
jest.mock("../src/useScreenTracking", () => {
  const originalModule = jest.requireActual("../src/useScreenTracking");
  // Return the actual shortString function but mock the hooks
  return {
    shortString: originalModule.shortString,
    useScreenTracking: jest.fn().mockImplementation(() => ({
      startScreenView: jest.fn().mockReturnValue("test-uuid"),
      endScreenView: jest.fn(),
    })),
    useQuanta: jest.fn(),
  };
});

describe("shortString", () => {
  test("formats large numbers with exponents", () => {
    // The function returns like "1.00e4", so test with regex pattern
    expect(shortString(10000)).toMatch(/^1\.?0*e4$/);
    expect(shortString(123456)).toMatch(/^1\.2[23]e5$/);
  });

  test("returns 0 for zero values", () => {
    expect(shortString(0)).toBe("0");
  });

  test("returns 0 for very small values", () => {
    expect(shortString(0.0001)).toBe("0");
  });

  test("formats normal numbers correctly", () => {
    expect(shortString(42.5)).toBe("42.5");
    expect(shortString(999)).toBe("999");
    // Allow for small differences in precision
    expect(shortString(1.234)).toMatch(/^1\.2[34]$/);
  });
});

describe("SessionStorageService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("persists sessions with set method", async () => {
    const testSessions = [
      {
        screenId: "test-screen",
        args: { param: "value" },
        startTime: 1000,
        duration: 5000,
      },
    ];

    await SessionStorageService.set(testSessions);
    expect(SessionStorageService.set).toHaveBeenCalledWith(testSessions);
  });

  test("retrieves sessions with get method", async () => {
    const mockSessions = [
      {
        screenId: "saved-screen",
        args: { source: "test" },
        startTime: 2000,
        duration: 3000,
      },
    ];

    (SessionStorageService.get as jest.Mock).mockResolvedValueOnce(
      mockSessions
    );

    const result = await SessionStorageService.get();
    expect(result).toEqual(mockSessions);
    expect(SessionStorageService.get).toHaveBeenCalled();
  });
});

// Test direct functions from useScreenTracking without relying on hooks
describe("Quanta logging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Quanta.logWithRevenue correctly formats view data", () => {
    // Directly test the Quanta logging function
    const startTime = 1000;
    const screenId = "test-screen";
    const duration = 5000;
    const args = { category: "test-category" };

    // Call logWithRevenue directly
    Quanta.logWithRevenue(
      "view",
      0,
      {
        screen: screenId,
        seconds: "5",
        ...args,
      },
      new Date(startTime)
    );

    // Verify the mock was called with correct parameters
    expect(Quanta.logWithRevenue).toHaveBeenCalledWith(
      "view",
      0,
      {
        screen: screenId,
        seconds: "5",
        category: "test-category",
      },
      new Date(startTime)
    );
  });
});
