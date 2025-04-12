import { SessionStorageService, StoredSession } from "../src/sessionStorage";
import SecureStore from "expo-secure-store";

// Mock dependencies - ensure errors are handled properly
jest.mock("expo-secure-store", () => {
  const store: { [key: string]: string | null } = {};

  return {
    setItemAsync: jest.fn((key, value) => {
      store[key] = value;
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((key) => {
      return Promise.resolve(store[key]);
    }),
    deleteItemAsync: jest.fn((key) => {
      delete store[key];
      return Promise.resolve();
    }),
    __resetStore: () => {
      for (const key in store) {
        delete store[key];
      }
    },
  };
});

// Clear mocks before all tests
beforeEach(() => {
  jest.clearAllMocks();
  // Reset stored items between tests
  (SecureStore as any).__resetStore();
});

describe("SessionStorageService", () => {
  describe("persistSessions", () => {
    it("should persist sessions to secure storage as JSON", async () => {
      // Arrange
      const sessions: StoredSession[] = [
        {
          screenId: "TestScreen",
          args: { test: "value" },
          accumulatedTime: 1000,
          lastUpdateTime: 1234567890,
          startTime: 1234567000,
          isEstimated: false,
        },
      ];

      // Act
      await SessionStorageService.persistSessions(sessions);

      // Assert
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        "tools.quanta.sessions",
        JSON.stringify(sessions)
      );
    });

    it("should handle errors gracefully", async () => {
      // Arrange
      const sessions: StoredSession[] = [
        {
          screenId: "TestScreen",
          accumulatedTime: 1000,
          lastUpdateTime: 1234567890,
          startTime: 1234567000,
          isEstimated: false,
        },
      ];

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error("Test error")
      );

      // Act
      await SessionStorageService.persistSessions(sessions);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to persist sessions:",
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe("getStoredSessions", () => {
    it("should retrieve sessions from secure storage", async () => {
      // Arrange
      const mockSessions: StoredSession[] = [
        {
          screenId: "TestScreen",
          args: { test: "value" },
          accumulatedTime: 1000,
          lastUpdateTime: 1234567890,
          startTime: 1234567000,
          isEstimated: false,
        },
      ];

      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
        JSON.stringify(mockSessions)
      );

      // Act
      const result = await SessionStorageService.getStoredSessions();

      // Assert
      expect(result).toEqual(mockSessions);
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
        "tools.quanta.sessions"
      );
    });

    it("should return empty array when no sessions are stored", async () => {
      // Arrange
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await SessionStorageService.getStoredSessions();

      // Assert
      expect(result).toEqual([]);
    });

    it("should handle errors gracefully", async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
        new Error("Test error")
      );

      // Act
      const result = await SessionStorageService.getStoredSessions();

      // Assert
      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to retrieve stored sessions:",
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe("clearSessions", () => {
    it("should clear sessions from secure storage", async () => {
      // Act
      await SessionStorageService.clearSessions();

      // Assert
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        "tools.quanta.sessions"
      );
    });

    it("should handle errors gracefully", async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(
        new Error("Test error")
      );

      // Act
      await SessionStorageService.clearSessions();

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to clear sessions:",
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe("persistSessionWithEstimatedDuration", () => {
    it("should persist a new session with estimated duration", async () => {
      // Arrange
      const screenId = "TestScreen";
      const args = { test: "value" };
      const startTime = 1234567890;

      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      // Act
      await SessionStorageService.persistSessionWithEstimatedDuration(
        screenId,
        args,
        startTime
      );

      // Assert
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
      const persistedData = JSON.parse(
        (SecureStore.setItemAsync as jest.Mock).mock.calls[0][1]
      );

      expect(persistedData).toEqual([
        {
          screenId,
          args,
          accumulatedTime: 5000, // 5 seconds in ms
          lastUpdateTime: expect.any(Number),
          startTime,
          isEstimated: true,
        },
      ]);
    });

    it("should replace existing session with same screenId", async () => {
      // Arrange
      const screenId = "TestScreen";
      const args = { test: "value" };
      const startTime = 1234567890;

      const existingSessions = [
        {
          screenId,
          args: { old: "value" },
          accumulatedTime: 1000,
          lastUpdateTime: 1234567000,
          startTime: 1234566000,
          isEstimated: true,
        },
        {
          screenId: "OtherScreen",
          args: { other: "value" },
          accumulatedTime: 2000,
          lastUpdateTime: 1234567000,
          startTime: 1234566000,
          isEstimated: true,
        },
      ];

      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
        JSON.stringify(existingSessions)
      );

      // Act
      await SessionStorageService.persistSessionWithEstimatedDuration(
        screenId,
        args,
        startTime
      );

      // Assert
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
      const persistedData = JSON.parse(
        (SecureStore.setItemAsync as jest.Mock).mock.calls[0][1]
      );

      // Should have two entries
      expect(persistedData.length).toBe(2);

      // Should have replaced the matching screenId entry
      const updatedSession = persistedData.find(
        (s: StoredSession) => s.screenId === screenId
      );
      expect(updatedSession).toEqual({
        screenId,
        args,
        accumulatedTime: 5000,
        lastUpdateTime: expect.any(Number),
        startTime,
        isEstimated: true,
      });

      // Should have kept the other entry
      const otherSession = persistedData.find(
        (s: StoredSession) => s.screenId === "OtherScreen"
      );
      expect(otherSession).toBeTruthy();
    });
  });

  describe("updateSessionDuration", () => {
    it("should update an existing session with actual duration", async () => {
      // Arrange
      const screenId = "TestScreen";
      const duration = 3000;
      const args = { test: "value" };
      const startTime = 1234567000;

      const existingSessions = [
        {
          screenId,
          args: { old: "value" },
          accumulatedTime: 1000,
          lastUpdateTime: 1234567000,
          startTime: 1234566000,
          isEstimated: true,
        },
      ];

      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
        JSON.stringify(existingSessions)
      );

      // Act
      await SessionStorageService.updateSessionDuration(
        screenId,
        duration,
        args,
        startTime
      );

      // Assert
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
      const persistedData = JSON.parse(
        (SecureStore.setItemAsync as jest.Mock).mock.calls[0][1]
      );

      expect(persistedData).toEqual([
        {
          screenId,
          args,
          accumulatedTime: duration,
          lastUpdateTime: expect.any(Number),
          startTime,
          isEstimated: false,
        },
      ]);
    });

    it("should add a new session if it does not exist", async () => {
      // Arrange
      const screenId = "TestScreen";
      const duration = 3000;
      const args = { test: "value" };
      const startTime = 1234567000;

      const existingSessions = [
        {
          screenId: "OtherScreen",
          args: { other: "value" },
          accumulatedTime: 2000,
          lastUpdateTime: 1234567000,
          startTime: 1234566000,
          isEstimated: true,
        },
      ];

      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
        JSON.stringify(existingSessions)
      );

      // Act
      await SessionStorageService.updateSessionDuration(
        screenId,
        duration,
        args,
        startTime
      );

      // Assert
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
      const persistedData = JSON.parse(
        (SecureStore.setItemAsync as jest.Mock).mock.calls[0][1]
      );

      // Should have two entries
      expect(persistedData.length).toBe(2);

      // Should have the existing entry
      const otherSession = persistedData.find(
        (s: StoredSession) => s.screenId === "OtherScreen"
      );
      expect(otherSession).toBeTruthy();

      // Should have added the new session
      const newSession = persistedData.find(
        (s: StoredSession) => s.screenId === screenId
      );
      expect(newSession).toEqual({
        screenId,
        args,
        accumulatedTime: duration,
        lastUpdateTime: expect.any(Number),
        startTime,
        isEstimated: false,
      });
    });
  });

  describe("hasCrashEvidence", () => {
    it("should return true if there are stored sessions", async () => {
      // Arrange
      const existingSessions = [
        {
          screenId: "TestScreen",
          args: { test: "value" },
          accumulatedTime: 1000,
          lastUpdateTime: 1234567000,
          startTime: 1234566000,
          isEstimated: true,
        },
      ];

      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(
        JSON.stringify(existingSessions)
      );

      // Act
      const result = await SessionStorageService.hasCrashEvidence();

      // Assert
      expect(result).toBe(true);
    });

    it("should return false if there are no stored sessions", async () => {
      // Arrange
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await SessionStorageService.hasCrashEvidence();

      // Assert
      expect(result).toBe(false);
    });

    it("should handle errors gracefully", async () => {
      // Arrange
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(
        new Error("Test error")
      );

      // Act
      const result = await SessionStorageService.hasCrashEvidence();

      // Assert
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to check for crash evidence:",
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });
});
