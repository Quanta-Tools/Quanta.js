/**
 * Quanta Analytics SDK for Web
 */
export declare abstract class AbstractQuantaBase {
    protected _initialized: boolean;
    protected _initializing: number;
    protected _initializingPromise: Promise<void> | null;
    protected _id: string;
    protected _appId: string;
    protected _abLetters: string;
    protected _abDict: Record<string, string>;
    protected _queue: EventTask[];
    protected _isProcessing: boolean;
    protected _installDate: number;
    protected _skipFirstViewEvent: boolean;
    protected _skipNavigationViewEvents: boolean;
    protected _skipAllViewEvents: boolean;
    protected _isFirstViewEvent: boolean;
    protected _currentPath: string | null;
    abstract makeAsyncStorage(): {
        getItem: (key: string) => Promise<string | null>;
        setItem: (key: string, value: string) => Promise<void>;
    };
    asyncStorage: {
        getItem: (key: string) => Promise<string | null>;
        setItem: (key: string, value: string) => Promise<void>;
    };
    getAppId(): string;
    /**
     * Initialize the Quanta SDK
     * @param appId Your Quanta application ID (optional if loaded via script tag)
     */
    initialize(appId?: string): void;
    loadAppId(): Promise<string | null>;
    setAppId(appId: string): Promise<void>;
    /**
     * Initialize the Quanta SDK
     * @param appId Your Quanta application ID (optional if loaded via script tag)
     */
    initializeAsync(appId?: string, silent?: boolean): Promise<void>;
    /**
     * Set up listeners to detect URL changes from both history API and navigation events
     */
    abstract setupUrlChangeListeners(): void;
    /**
     * Handle URL changes by checking if path changed and sending view event
     */
    abstract handleUrlChange(): Promise<void>;
    maybeSendViewEvent(): Promise<void>;
    /**
     * Send a view event to Quanta
     */
    abstract sendViewEvent(): Promise<void>;
    /**
     * Parse data attributes from the script tag
     */
    protected parseScriptTagAttributes(): void;
    abstract getScriptTag(): HTMLScriptElement | null;
    /**
     * Extract app ID from the script tag URL
     * Expected format: https://js.quanta.tools/app/{appId}.js
     */
    abstract getAppIdFromScriptTag(): string | null;
    /**
     * Log an event to Quanta
     * @param event Event name
     * @param addedArguments Additional event parameters or formatted argument string
     */
    log(event: string, addedArguments?: Record<string, string> | string): void;
    /**
     * Log an event to Quanta
     * @param event Event name
     * @param addedArguments Additional event parameters or formatted argument string
     */
    logAsync(event: string, addedArguments?: Record<string, string> | string): Promise<void>;
    /**
     * Log an event with revenue to Quanta
     * @param event Event name
     * @param revenue Revenue amount
     * @param addedArguments Additional event parameters or formatted argument string
     */
    logWithRevenue(event: string, revenue?: number, addedArguments?: Record<string, string> | string, time?: Date): void;
    abstract isServerSide(): boolean;
    /**
     * Log an event with revenue to Quanta
     * @param event Event name
     * @param revenue Revenue amount
     * @param addedArguments Additional event parameters or formatted argument string
     */
    logWithRevenueAsync(event: string, revenue?: number, addedArguments?: Record<string, string> | string, time?: Date): Promise<void>;
    /**
     * Get the result of an AB test for an experiment
     * @param experimentName The name of the experiment
     * @returns The variant letter (A, B, C, etc.)
     */
    abTest(experimentName: string): string;
    /**
     * Get the result of an AB test for an experiment
     * @param experimentName The name of the experiment
     * @returns The variant letter (A, B, C, etc.)
     */
    abTestAsync(experimentName: string): Promise<string>;
    /**
     * Set the user ID
     * @param id User ID
     */
    setId(id: string): void;
    /**
     * Set the user ID
     * @param id User ID
     */
    setIdAsync(id: string): Promise<void>;
    /**
     * Get the current user ID
     * @returns User ID
     */
    getId(): string;
    protected loadOrCreateId(): Promise<string>;
    protected loadOrCreateInstallDate(): Promise<number>;
    abstract systemLanguageProvider(): string;
    abstract getBundleId(): string;
    abstract getVersion(): string;
    protected getUserData(): string;
    abstract getDeviceInfo(): string;
    abstract getOSInfo(): string;
    protected getOSInfoSafe(): string;
    abstract isDebug(): boolean;
    protected safe(value: string, keepUnitSeparator?: boolean): string;
    protected stringForDouble(value: number): string;
    protected enqueueEvent(event: EventTask): Promise<void>;
    protected processQueue(): Promise<void>;
    protected sendEvent(event: EventTask): Promise<boolean>;
    protected saveQueue(): Promise<void>;
    protected loadQueue(): Promise<void>;
    protected setAbJson(abJson: string): void;
    protected getAbLetters(abJson: string): string;
    protected getAbDict(abJson: string): Record<string, string>;
    protected stringToNumber(input: string): number;
    /**
     * Simple implementation of RFC4122 version 4 UUIDs
     * @returns A UUID string
     */
    generateUuid(): string;
    protected shortenUuid(uuidStr: string): string;
    protected isValidUUID(str: string): boolean;
    protected shouldLog(): boolean;
    protected loggingEnabled: boolean | null;
    enableLogging(): void;
    disableLogging(): void;
    protected debugLog(...args: any[]): void;
    protected debugWarn(...args: any[]): void;
    protected debugError(...args: any[]): void;
    /**
     * Checks if the app has been claimed and shows welcome message if not
     */
    protected checkClaimed(): Promise<void>;
}
interface EventTask {
    appId: string;
    userData: string;
    event: string;
    revenue: string;
    addedArguments: string;
    time: Date;
    abLetters?: string;
}
export {};
