// Mock implementation of SessionStorageService

export interface StoredSession {
  screenId: string;
  args?: Record<string, string>;
  accumulatedTime: number;
  lastUpdateTime: number;
  startTime: number;
  isEstimated: boolean;
}

// Create all functions as Jest mock functions
export const SessionStorageService = {
  persistSessionWithEstimatedDuration: jest.fn(),
  updateSessionDuration: jest.fn(),
  persistSessions: jest.fn(),
  getStoredSessions: jest.fn().mockResolvedValue([]),
  clearSessions: jest.fn(),
  hasCrashEvidence: jest.fn().mockResolvedValue(false),
};
