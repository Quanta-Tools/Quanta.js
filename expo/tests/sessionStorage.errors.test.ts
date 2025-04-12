import { SessionStorageService } from "../src/sessionStorage";
import SecureStore from "expo-secure-store";

// Special setup for error tests - isolated from main tests
jest.mock("expo-secure-store", () => {
  return {
    setItemAsync: jest.fn(),
    getItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
  };
});

// Clear mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

describe("SessionStorageService error handling", () => {
  describe("removeSession", () => {
    it("should handle errors gracefully", async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Mock getItemAsync to reject with error
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error("Test error")
      );

      // Act
      await SessionStorageService.removeSession("TestScreen");

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to remove session:",
        expect.any(Error)
      );

      // Clean up
      consoleSpy.mockRestore();
    });
  });

  describe("persistSessions", () => {
    it("should handle errors gracefully", async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Mock setItemAsync to throw an error
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error("Test error")
      );

      // Act
      await SessionStorageService.persistSessions([
        {
          screenId: "TestScreen",
          accumulatedTime: 1000,
          lastUpdateTime: Date.now(),
          startTime: Date.now() - 1000,
          isEstimated: false,
        },
      ]);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to persist sessions:",
        expect.any(Error)
      );

      // Clean up
      consoleSpy.mockRestore();
    });
  });
});
