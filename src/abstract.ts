const RECORD_SEPARATOR = "\u001E";
const UNIT_SEPARATOR = "\u001F";

/**
 * Quanta Analytics SDK for Web
 */
export abstract class AbstractQuantaBase {
  protected _initialized = false;
  protected _initializing = 0;
  protected _initializingPromise: Promise<void> | null = null;
  protected _id = "";
  protected _appId = "";
  protected _abLetters = "";
  protected _abDict: Record<string, string> = {};
  protected _queue: EventTask[] = [];
  protected _isProcessing = false;
  protected _installDate = 0;
  // New configuration properties for script tag data attributes
  protected _skipFirstViewEvent = false;
  protected _skipNavigationViewEvents = false;
  protected _skipAllViewEvents = false;
  protected _isFirstViewEvent = true;
  protected _currentPath = null as string | null;

  abstract makeAsyncStorage(): {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  };

  public asyncStorage = this.makeAsyncStorage();

  public getAppId() {
    return this._appId;
  }

  /**
   * Initialize the Quanta SDK
   * @param appId Your Quanta application ID (optional if loaded via script tag)
   */
  initialize(appId?: string) {
    this.initializeAsync(appId).catch(console.error);
  }

  async loadAppId() {
    return await this.asyncStorage.getItem("tools.quanta.appId");
  }

  async setAppId(appId: string) {
    return await this.asyncStorage.setItem("tools.quanta.appId", appId);
  }

  /**
   * Initialize the Quanta SDK
   * @param appId Your Quanta application ID (optional if loaded via script tag)
   */
  async initializeAsync(appId?: string, silent: boolean = false) {
    if (this._initialized) {
      if (appId) {
        this._appId = appId;
        await this.setAppId(appId);
      }
      return;
    }

    if (this._initializing++ !== 0) {
      while (!this._initializingPromise) {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
      await this._initializingPromise;
      await this.initializeAsync(appId, silent);

      return;
    }

    let resolvePromise = () => {};
    this._initializingPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    try {
      if (this.isServerSide()) {
        if (silent) return;
        console.info("[Quanta] Skipping client sdk call on server.");
        return;
      }

      // Parse any data attributes on the script tag
      this.parseScriptTagAttributes();

      // Auto-detect app ID from script tag if not provided
      this._appId =
        appId ?? this.getAppIdFromScriptTag() ?? (await this.loadAppId()) ?? "";

      if (!this._appId) {
        if (silent) return;
        this.debugWarn(
          "No Quanta app ID provided. Analytics will not be sent."
        );
        return;
      }
      await this.setAppId(this._appId);

      // Load or generate user ID
      this._id = await this.loadOrCreateId();
      this._installDate = await this.loadOrCreateInstallDate();

      // Load AB test settings
      const abJson = (await this.asyncStorage.getItem("tools.quanta.ab")) || "";
      this._abLetters = this.getAbLetters(abJson);
      this._abDict = this.getAbDict(abJson);

      // Setup URL change listeners
      this.setupUrlChangeListeners();

      // Load any queued events
      await this.loadQueue();

      // Process any queued events
      await this.processQueue();

      // Check if app is claimed (only in debug mode)
      if (this.isDebug()) {
        this.checkClaimed().catch(console.error);
      }

      this.debugLog("Quanta initialized");
      this._initialized = true;

      // Send launch event
      await this.maybeSendViewEvent();
    } finally {
      this._initializing--;
      resolvePromise();
    }
  }

  /**
   * Set up listeners to detect URL changes from both history API and navigation events
   */
  abstract setupUrlChangeListeners(): void;

  /**
   * Handle URL changes by checking if path changed and sending view event
   */
  abstract handleUrlChange(): Promise<void>;

  async maybeSendViewEvent() {
    if (!this._initialized) {
      await this.initializeAsync();
    }

    // Skip view events based on configuration
    if (this._skipAllViewEvents) {
      return;
    }

    if (this._skipFirstViewEvent && this._isFirstViewEvent) {
      this._isFirstViewEvent = false;
      return;
    }

    if (this._skipNavigationViewEvents && !this._isFirstViewEvent) {
      return;
    }

    await this.sendViewEvent();
  }

  /**
   * Send a view event to Quanta
   */
  abstract sendViewEvent(): Promise<void>;

  /**
   * Parse data attributes from the script tag
   */
  protected parseScriptTagAttributes() {
    if (typeof window === "undefined") return;

    // Parse boolean data attributes
    this._skipFirstViewEvent =
      !!document.currentScript?.dataset?.skipFirstViewEvent;
    this._skipNavigationViewEvents =
      !!document.currentScript?.dataset?.skipNavigationViewEvents;
    this._skipAllViewEvents =
      !!document.currentScript?.dataset?.skipAllViewEvents;

    // Enable debug logs if requested
    if (!!document.currentScript?.dataset?.enableDebugLogs) {
      this.enableLogging();
    }
  }

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
  log(event: string, addedArguments: Record<string, string> | string = {}) {
    this.logWithRevenue(event, 0, addedArguments);
  }

  /**
   * Log an event to Quanta
   * @param event Event name
   * @param addedArguments Additional event parameters or formatted argument string
   */
  async logAsync(
    event: string,
    addedArguments: Record<string, string> | string = {}
  ) {
    await this.logWithRevenueAsync(event, 0, addedArguments);
  }

  /**
   * Log an event with revenue to Quanta
   * @param event Event name
   * @param revenue Revenue amount
   * @param addedArguments Additional event parameters or formatted argument string
   */
  logWithRevenue(
    event: string,
    revenue: number = 0,
    addedArguments: Record<string, string> | string = {},
    time: Date = new Date()
  ) {
    this.logWithRevenueAsync(event, revenue, addedArguments, time).catch(
      console.error
    );
  }

  abstract isServerSide(): boolean;

  /**
   * Log an event with revenue to Quanta
   * @param event Event name
   * @param revenue Revenue amount
   * @param addedArguments Additional event parameters or formatted argument string
   */
  async logWithRevenueAsync(
    event: string,
    revenue: number = 0,
    addedArguments: Record<string, string> | string = {},
    time: Date = new Date()
  ) {
    if (this.isServerSide()) {
      console.info("[Quanta] Skipping client sdk call on server.");
      return;
    }
    if (!this._initialized) {
      this.initialize();
    }

    if (event.length > 200) {
      this.debugWarn(
        "Event name is too long. Event name + args should be 200 characters or less. It will be truncated."
      );
      event = event.substring(0, 200);
    }

    let argString = "";

    // Check if addedArguments is a direct string or a Record
    if (typeof addedArguments === "string") {
      // Direct string case - use as is, just ensure it's safe
      argString = this.safe(addedArguments, true);
    } else {
      // Record case - existing logic
      const sortedKeys = Object.keys(addedArguments).sort();

      for (const key of sortedKeys) {
        const safeKey = this.safe(key, false);
        const safeValue = this.safe(addedArguments[key], false);
        argString += `${safeKey}${UNIT_SEPARATOR}${safeValue}${UNIT_SEPARATOR}`;
      }

      if (argString.length > 0) {
        argString = argString.substring(
          0,
          argString.length - UNIT_SEPARATOR.length
        );
      }
    }

    // Check if event + args exceeds length limit
    if (event.length + argString.length > 200) {
      this.debugWarn(
        "Added arguments are too long. Event name + args should be 200 characters or less. They will be truncated."
      );
      argString = argString.substring(0, 200 - event.length);
    }

    const userData = this.getUserData();
    const revenueString = this.stringForDouble(revenue);

    await this.enqueueEvent({
      appId: this._appId,
      userData,
      event: this.safe(event),
      revenue: revenueString,
      addedArguments: this.safe(argString, true),
      time,
      abLetters: this._abLetters,
    });
  }

  /**
   * Get the result of an AB test for an experiment
   * @param experimentName The name of the experiment
   * @returns The variant letter (A, B, C, etc.)
   */
  abTest(experimentName: string) {
    if (!this._initialized) {
      console.error(
        "[Quanta] Ab test called in sync method before initialization. Please make sure to call initialize() first, or use abTestAsync() instead."
      );
      this.initialize();
      return "A";
    }
    return this._abDict[experimentName.toLowerCase()] || "A";
  }

  /**
   * Get the result of an AB test for an experiment
   * @param experimentName The name of the experiment
   * @returns The variant letter (A, B, C, etc.)
   */
  async abTestAsync(experimentName: string) {
    if (!this._initialized) {
      await this.initializeAsync();
    }
    return this._abDict[experimentName.toLowerCase()] || "A";
  }

  /**
   * Set the user ID
   * @param id User ID
   */
  setId(id: string) {
    this.setIdAsync(id).catch(console.error);
  }

  /**
   * Set the user ID
   * @param id User ID
   */
  async setIdAsync(id: string) {
    if (this._id !== "") return;
    let shortId = id;
    if (this.isValidUUID(shortId)) {
      shortId = this.shortenUuid(shortId);
    }
    this._id = shortId;
    await this.asyncStorage.setItem("tools.quanta.id", this._id);
    if (this._id.length !== 22) {
      this.debugWarn(
        `The ID ${this._id} does not look like a valid UUID or Quanta ID. Only use UUIDs or shortened Quanta IDs as user IDs.`
      );
    }
  }

  /**
   * Get the current user ID
   * @returns User ID
   */
  getId(): string {
    return this._id;
  }

  // Private methods

  protected async loadOrCreateId() {
    const storedId = await this.asyncStorage.getItem("tools.quanta.id");
    if (storedId) {
      return storedId;
    }
    const newId = this.shortenUuid(this.generateUuid());
    await this.asyncStorage.setItem("tools.quanta.id", newId);
    return newId;
  }

  protected async loadOrCreateInstallDate() {
    const storedDate = await this.asyncStorage.getItem("tools.quanta.install");
    if (storedDate) {
      return parseInt(storedDate, 10);
    }
    const now = Math.floor(Date.now() / 1000);
    await this.asyncStorage.setItem("tools.quanta.install", now.toString());
    return now;
  }

  abstract systemLanguageProvider(): string;

  abstract getBundleId(): string;

  abstract getVersion(): string;

  protected getUserData(): string {
    const device = this.getDeviceInfo();
    const os = this.getOSInfoSafe();
    const bundleId = this.getBundleId();
    const debugFlags = this.isDebug() ? 1 : 0;
    const version = this.getVersion();
    const language = this.systemLanguageProvider().replace("-", "_");

    let userData = "";
    userData += `${this._id}`;
    userData += `${RECORD_SEPARATOR}${this.safe(device)}`;
    userData += `${RECORD_SEPARATOR}${this.safe(os)}`;
    userData += `${RECORD_SEPARATOR}${this.safe(bundleId)}`;
    userData += `${RECORD_SEPARATOR}${debugFlags}`;
    userData += `${RECORD_SEPARATOR}${this.safe(version)}`;
    userData += `${RECORD_SEPARATOR}${language}`;
    userData += `${RECORD_SEPARATOR}${this._installDate}`;

    return userData;
  }

  abstract getDeviceInfo(): string;

  abstract getOSInfo(): string;

  protected getOSInfoSafe(): string {
    return this.getOSInfo().slice(0, 25);
  }

  abstract isDebug(): boolean;

  protected safe(value: string, keepUnitSeparator: boolean = false): string {
    if (keepUnitSeparator) {
      return value.replace(new RegExp(RECORD_SEPARATOR, "g"), "");
    }
    return value
      .replace(new RegExp(RECORD_SEPARATOR, "g"), "")
      .replace(new RegExp(UNIT_SEPARATOR, "g"), "");
  }

  protected stringForDouble(value: number): string {
    // Handle upper bound
    if (value > 999999.99) {
      this.debugWarn(
        "Value exceeds maximum allowed revenue of 999,999.99. Will be capped."
      );
      return this.stringForDouble(999999.99);
    }

    // Handle lower bound
    if (value < -999999.99) {
      this.debugWarn(
        "Value is below minimum allowed revenue of -999,999.99. Will be capped."
      );
      return this.stringForDouble(-999999.99);
    }

    // Format with 2 decimal places and remove .00 if needed
    const formatted = value.toFixed(2);
    return formatted.endsWith(".00")
      ? formatted.substring(0, formatted.length - 3)
      : formatted;
  }

  protected async enqueueEvent(event: EventTask) {
    this._queue.push(event);
    await this.saveQueue();

    if (!this._isProcessing) {
      await this.processQueue();
    }
  }

  protected async processQueue(): Promise<void> {
    if (this._isProcessing || this._queue.length === 0) return;

    this._isProcessing = true;
    let failures = 0;

    while (this._queue.length > 0) {
      // Handle exponential backoff for failures
      if (failures > 0) {
        const delay = Math.pow(1.5, failures - 1) * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const success = await this.sendEvent(this._queue[0]);

      // ~4 hours = 27 failures
      // cancel if older than 48h
      const eventAge =
        (Date.now() - this._queue[0].time.getTime()) / (1000 * 60 * 60);

      if (success || failures >= 27 || eventAge > 48) {
        this._queue.shift();
        failures = 0;
        await this.saveQueue();
      } else {
        failures++;
      }

      // Small pause between attempts
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this._isProcessing = false;
  }

  protected async sendEvent(event: EventTask): Promise<boolean> {
    try {
      const url = "https://analytics-ingress.quanta.tools/ee/";

      let body = "";
      body += event.appId;
      body += `${RECORD_SEPARATOR}${Math.floor(event.time.getTime() / 1000)}`;
      body += `${RECORD_SEPARATOR}${event.event}`;
      body += `${RECORD_SEPARATOR}${event.revenue}`;
      body += `${RECORD_SEPARATOR}${event.addedArguments}`;
      body += `${RECORD_SEPARATOR}${event.userData}`;
      if (event.abLetters) {
        body += `${RECORD_SEPARATOR}${event.abLetters}`;
      }

      const headers: Record<string, string> = {
        "Content-Type": "text/plain",
      };

      const abVersion = await this.asyncStorage.getItem(
        "tools.quanta.ab.version"
      );
      if (abVersion) {
        headers["X-AB-Version"] = abVersion;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
      });

      if (response.ok) {
        try {
          const responseText = await response.text();
          if (responseText) {
            await this.asyncStorage.setItem("tools.quanta.ab", responseText);
            this.setAbJson(responseText);
          }

          const abVersionHeader = response.headers.get("X-AB-Version");
          if (abVersionHeader) {
            await this.asyncStorage.setItem(
              "tools.quanta.ab.version",
              abVersionHeader
            );
          }
        } catch (e) {
          // Ignore parsing errors
        }
        return true;
      }
      return false;
    } catch (error) {
      this.debugError("Failed to send event:", error);
      return false;
    }
  }

  protected async saveQueue() {
    try {
      await this.asyncStorage.setItem(
        "tools.quanta.queue.tasks",
        JSON.stringify(this._queue)
      );
    } catch (e) {
      this.debugWarn("Failed to save queue to storage:", e);
    }
  }

  protected async loadQueue() {
    try {
      const queueData = await this.asyncStorage.getItem(
        "tools.quanta.queue.tasks"
      );
      if (queueData) {
        const parsed = JSON.parse(queueData);
        this._queue = parsed.map((item: any) => ({
          ...item,
          time: new Date(item.time),
        }));
      }
    } catch (e) {
      this.debugWarn("Failed to load queue from storage:", e);
    }
  }

  protected setAbJson(abJson: string) {
    this._abLetters = this.getAbLetters(abJson);
    this._abDict = this.getAbDict(abJson);
  }

  protected getAbLetters(abJson: string): string {
    if (!abJson) return "";

    try {
      const experiments: ABExperiment[] = JSON.parse(abJson);
      let abLetters = "";

      for (const exp of experiments) {
        const key = `${this._id}.${exp.name[exp.name.length - 1] || ""}`;
        const int = this.stringToNumber(key);
        let limit = 0;

        for (let idx = 0; idx < exp.variants.length; idx++) {
          limit += exp.variants[idx];
          if (limit > int) {
            abLetters += "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[idx];
            break;
          }
        }
      }

      return abLetters;
    } catch (e) {
      this.debugWarn("Failed to parse AB test JSON:", e);
      return "";
    }
  }

  protected getAbDict(abJson: string): Record<string, string> {
    const dict: Record<string, string> = {};
    if (!abJson) return dict;

    try {
      const experiments: ABExperiment[] = JSON.parse(abJson);
      const letters = this._abLetters;

      for (let idx = 0; idx < experiments.length; idx++) {
        if (idx >= letters.length) break;

        const experiment = experiments[idx];
        for (const name of experiment.name) {
          dict[name.toLowerCase()] = letters.substring(idx, idx + 1);
        }
      }

      return dict;
    } catch (e) {
      this.debugWarn("Failed to parse AB test JSON:", e);
      return dict;
    }
  }

  protected stringToNumber(input: string): number {
    // Simple hash function similar to the Swift version
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash % 100);
  }

  /**
   * Simple implementation of RFC4122 version 4 UUIDs
   * @returns A UUID string
   */
  public generateUuid(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0,
          v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  protected shortenUuid(uuidStr: string): string {
    // Convert UUID string to bytes
    const uuid = uuidStr.replace(/-/g, "");
    const bytes = new Uint8Array(16);

    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(uuid.substring(i * 2, i * 2 + 2), 16);
    }

    // Convert to Base64 and make URL-safe
    let base64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  protected isValidUUID(str: string): boolean {
    const pattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return pattern.test(str);
  }

  protected shouldLog(): boolean {
    if (this.loggingEnabled === null) {
      return this.isDebug();
    }
    return this.loggingEnabled;
  }

  protected loggingEnabled: boolean | null = null;
  public enableLogging() {
    this.loggingEnabled = true;
  }
  public disableLogging() {
    this.loggingEnabled = false;
  }

  protected debugLog(...args: any[]) {
    if (!this.shouldLog()) return;
    console.info(...args);
  }

  protected debugWarn(...args: any[]) {
    if (!this.shouldLog()) return;
    console.warn(...args);
  }

  protected debugError(...args: any[]) {
    if (!this.shouldLog()) return;
    console.error(...args);
  }

  /**
   * Checks if the app has been claimed and shows welcome message if not
   */
  protected async checkClaimed(): Promise<void> {
    if (!this._appId) return;

    try {
      const response = await fetch(
        `https://quanta.tools/api/claimed/${this._appId}`
      );
      if (!response.ok) return;

      const data = await response.json();
      if (!data.unClaimed) return;

      // App is unclaimed, show welcome message
      console.info(
        `%c
       :@@@               +@@+    @@@             
      @@  @:             @@  @   @  @@            
      @@ @@             @@  @@  @@  @             
      @ @@        =     @@  @   @  @@      =     +
     @@@@:@@    @@ @@   @  @=  @@ @@    @@@ @@=@@ 
    :@@    @   @@  @@   @@@    @@@@    @@    @@   
 @@@@@@   @@   @@@@    @@@     @@     @@@    @@   
     @     \\@@@@ \\@@@@@  \\@@@@@ \\@@@@@  \\@@@@     
`,
        "font-family:monospace;font-weight:600"
      );
      console.info("Welcome to Quanta! 🥳");
      console.info("Your analytics are fully set up.");
      console.info(
        "See your first events coming in and attach this app to your Quanta account at"
      );
      console.info(`https://quanta.tools/setup/${this._appId}`);
      console.info("");
      console.info(
        "Once your app is attached to an account, this welcome message won't show up anymore. 🚮"
      );
    } catch {
      // Silently fail if there's an issue with the API call
    }
  }
}

// Type definitions

interface EventTask {
  appId: string;
  userData: string;
  event: string;
  revenue: string;
  addedArguments: string;
  time: Date;
  abLetters?: string;
}

interface ABExperiment {
  name: string[];
  variants: number[];
}
