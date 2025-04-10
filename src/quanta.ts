const RECORD_SEPARATOR = "\u001E";
const UNIT_SEPARATOR = "\u001F";

function fullPath(url: Location | URL) {
  return url.href.slice(url.origin.length);
}

/**
 * Quanta Analytics SDK for Web
 */
class Quanta {
  private static _initialized = false;
  private static _initializing = 0;
  private static _initializingPromise: Promise<void> | null = null;
  private static _id = "";
  private static _appId = "";
  private static _abLetters = "";
  private static _abDict: Record<string, string> = {};
  private static _queue: EventTask[] = [];
  private static _isProcessing = false;
  private static _installDate = 0;
  // New configuration properties for script tag data attributes
  private static _skipFirstViewEvent = false;
  private static _skipNavigationViewEvents = false;
  private static _skipAllViewEvents = false;
  private static _isFirstViewEvent = true;
  private static _currentPath = null as string | null;

  protected static makeAsyncStorage() {
    return {
      getItem: async (key: string) => {
        return localStorage.getItem(key);
      },
      setItem: async (key: string, value: string) => {
        return localStorage.setItem(key, value);
      },
    };
  }

  static asyncStorage = this.makeAsyncStorage();

  /**
   * Initialize the Quanta SDK
   * @param appId Your Quanta application ID (optional if loaded via script tag)
   */
  static initialize(appId?: string) {
    this.initializeAsync(appId).catch(console.error);
  }

  static async loadAppId() {
    return await this.asyncStorage.getItem("tools.quanta.appId");
  }

  static async setAppId(appId: string) {
    return await this.asyncStorage.setItem("tools.quanta.appId", appId);
  }

  /**
   * Initialize the Quanta SDK
   * @param appId Your Quanta application ID (optional if loaded via script tag)
   */
  static async initializeAsync(appId?: string) {
    if (this._initialized) {
      if (appId) {
        this._appId = appId;
        await this.setAppId(appId);
      }
      return;
    }

    if (this._initializing++ !== 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      if (this._initializingPromise) {
        await this._initializingPromise;
      }
      return;
    }

    let resolvePromise = () => {};
    this._initializingPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    if (this.isServerSide()) {
      console.log("[Quanta] Skipping client sdk call on server.");
      return;
    }

    // Parse any data attributes on the script tag
    this.parseScriptTagAttributes();

    // Auto-detect app ID from script tag if not provided
    this._appId =
      appId ?? this.getAppIdFromScriptTag() ?? (await this.loadAppId()) ?? "";

    if (!this._appId) {
      this.debugWarn("No Quanta app ID provided. Analytics will not be sent.");
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
    resolvePromise();

    // Send launch event
    await this.maybeSendViewEvent();
  }

  /**
   * Set up listeners to detect URL changes from both history API and navigation events
   */
  protected static setupUrlChangeListeners() {
    if (typeof window === "undefined") return;

    if (this._currentPath === null) {
      this._currentPath = fullPath(window.location);
    }

    // Listen for popstate event (browser back/forward)
    window.addEventListener("popstate", () => {
      this.handleUrlChange().catch(console.error);
    });

    // Monitor pushState and replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      Quanta.handleUrlChange().catch(console.error);
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      Quanta.handleUrlChange().catch(console.error);
    };
  }

  /**
   * Handle URL changes by checking if path changed and sending view event
   */
  protected static async handleUrlChange() {
    const newPath = fullPath(window.location);
    if (newPath === this._currentPath) return;
    this._currentPath = newPath;
    this._isFirstViewEvent = false; // First view is only the initial page load
    await this.maybeSendViewEvent();
  }

  static async maybeSendViewEvent() {
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
  public static async sendViewEvent() {
    if (!this._initialized) {
      await this.initializeAsync();
    }

    // Parse URL to extract and remove UTM parameters
    const url = new URL(window.location.href);
    const urlSearchParams = url.searchParams;
    const utmParams: Record<string, string> = {};

    // Extract UTM parameters
    for (const [key, value] of urlSearchParams.entries()) {
      if (key.startsWith("utm_")) {
        utmParams[key.replace(/^utm_/, "")] = value;
        urlSearchParams.delete(key);
      }
    }

    // Reconstruct clean URL without UTM parameters
    url.search = urlSearchParams.toString();
    const path = fullPath(url);

    // Initialize props with path and UTM parameters
    const props: Record<string, string> = { path, ...utmParams };

    if (document.referrer) props.referrer = document.referrer;

    // Calculate how much space all properties take
    let totalLength = "view".length; // Event name
    let separatorCount = -1;

    // Add all properties except path
    for (const [key, value] of Object.entries(props)) {
      totalLength += key.length + value.length;
      separatorCount += 2; // Two separators per key-value pair
    }

    props.path = props.path.slice(0, 200 - totalLength - separatorCount);

    await this.logAsync("view", props);
  }

  /**
   * Parse data attributes from the script tag
   */
  private static parseScriptTagAttributes() {
    const scriptTag = this.getScriptTag();
    if (!scriptTag) return;

    // Parse boolean data attributes
    this._skipFirstViewEvent = scriptTag.hasAttribute(
      "data-skip-first-view-event"
    );
    this._skipNavigationViewEvents = scriptTag.hasAttribute(
      "data-skip-navigation-view-events"
    );
    this._skipAllViewEvents = scriptTag.hasAttribute(
      "data-skip-all-view-events"
    );

    // Enable debug logs if requested
    if (scriptTag.hasAttribute("data-enable-debug-logs")) {
      this.enableLogging();
    }
  }

  protected static getScriptTag(): HTMLScriptElement | null {
    if (typeof window === "undefined") return null;

    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      if (scripts[i].src.match(/^((https?:)?\/\/)?js\.quanta\.tools/)) {
        return scripts[i];
      }
    }
    return null;
  }

  /**
   * Extract app ID from the script tag URL
   * Expected format: https://js.quanta.tools/app/{appId}.js
   */
  protected static getAppIdFromScriptTag() {
    try {
      // Find all script tags
      const script = this.getScriptTag();
      if (!script) throw new Error("Script tag not found");

      const src = script.src;
      if (!src) throw new Error("src not found");

      // Match the pattern https://js.quanta.tools/app/{appId}.js
      const match = src.match(
        /^((https?:)?\/\/)?js\.quanta\.tools\/app\/([^\/]+)\.js(\?[^\?]*)?$/i
      );
      if (match && match[3]) {
        return match[3];
      }
    } catch {
      // Ignore errors
    }

    this.debugError(
      "Failed to extract Quanta app ID from script tag. Please make sure the script tag is loaded correctly:"
    );
    this.debugError(
      `<script src="https://js.quanta.tools/app/{appId}.js"></script>`
    );

    return null;
  }

  /**
   * Log an event to Quanta
   * @param event Event name
   * @param addedArguments Additional event parameters or formatted argument string
   */
  static log(
    event: string,
    addedArguments: Record<string, string> | string = {}
  ) {
    this.logWithRevenue(event, 0, addedArguments);
  }

  /**
   * Log an event to Quanta
   * @param event Event name
   * @param addedArguments Additional event parameters or formatted argument string
   */
  static async logAsync(
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
  static logWithRevenue(
    event: string,
    revenue: number = 0,
    addedArguments: Record<string, string> | string = {}
  ) {
    this.logWithRevenueAsync(event, revenue, addedArguments).catch(
      console.error
    );
  }

  /// override in expo
  protected static isServerSide() {
    return typeof window === "undefined";
  }

  /**
   * Log an event with revenue to Quanta
   * @param event Event name
   * @param revenue Revenue amount
   * @param addedArguments Additional event parameters or formatted argument string
   */
  static async logWithRevenueAsync(
    event: string,
    revenue: number = 0,
    addedArguments: Record<string, string> | string = {}
  ) {
    if (this.isServerSide()) {
      console.log("[Quanta] Skipping client sdk call on server.");
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
      time: new Date(),
      abLetters: this._abLetters,
    });
  }

  /**
   * Get the result of an AB test for an experiment
   * @param experimentName The name of the experiment
   * @returns The variant letter (A, B, C, etc.)
   */
  static abTest(experimentName: string) {
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
  static async abTestAsync(experimentName: string) {
    if (!this._initialized) {
      await this.initializeAsync();
    }
    return this._abDict[experimentName.toLowerCase()] || "A";
  }

  /**
   * Set the user ID
   * @param id User ID
   */
  static setId(id: string) {
    this.setIdAsync(id).catch(console.error);
  }

  /**
   * Set the user ID
   * @param id User ID
   */
  static async setIdAsync(id: string) {
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
  static getId(): string {
    return this._id;
  }

  // Private methods

  private static async loadOrCreateId() {
    const storedId = await this.asyncStorage.getItem("tools.quanta.id");
    if (storedId) {
      return storedId;
    }
    const newId = this.shortenUuid(this.generateUuid());
    await this.asyncStorage.setItem("tools.quanta.id", newId);
    return newId;
  }

  private static async loadOrCreateInstallDate() {
    const storedDate = await this.asyncStorage.getItem("tools.quanta.install");
    if (storedDate) {
      return parseInt(storedDate, 10);
    }
    const now = Math.floor(Date.now() / 1000);
    await this.asyncStorage.setItem("tools.quanta.install", now.toString());
    return now;
  }

  /// override in expo
  protected static systemLanguageProvider(): string {
    return navigator.language;
  }

  /// override in expo
  protected static getBundleId(): string {
    return window.location.hostname;
  }

  /// override in expo
  protected static getVersion(): string {
    return "1.0.0";
  }

  private static getUserData(): string {
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

  /// override in expo
  protected static getDeviceInfo(): string {
    // Get user agent string
    const ua = navigator.userAgent;

    // Check for browsers in specific order (most specific first)
    // Some browsers include strings like "Chrome" or "Safari" in their UA

    // Chromium-based browsers - check these before Chrome
    if (/Edg\//.test(ua)) return "Edge";
    if (/OPR\/|Opera\/|Opera Mini\//.test(ua)) return "Opera";
    if (/Vivaldi\//.test(ua)) return "Vivaldi";
    if (/YaBrowser\//.test(ua)) return "Yandex";
    if (
      /Brave\//.test(ua) ||
      (/Chrome/.test(ua) && (navigator as any).brave?.isBrave)
    )
      return "Brave";
    if (/SamsungBrowser\//.test(ua)) return "Samsung Browser";
    if (/UCWEB\/|UCBrowser\//.test(ua)) return "UC Browser";
    if (/QQBrowser\//.test(ua)) return "QQ Browser";
    if (/Maxthon\//.test(ua)) return "Maxthon";
    if (/DuckDuckGo\//.test(ua)) return "DuckDuckGo";
    if (/Whale\//.test(ua)) return "Whale";
    if (/Puffin\//.test(ua)) return "Puffin";

    // Major browsers
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return "Chrome";
    if (/Chromium\//.test(ua)) return "Chromium";

    // Safari needs to be after Chrome since many browsers include Safari in UA
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua))
      return "Safari";

    // Internet Explorer
    if (/MSIE|Trident\//.test(ua)) return "Internet Explorer";

    // Less common browsers
    if (/SeaMonkey\//.test(ua)) return "SeaMonkey";
    if (/Thunderbird\//.test(ua)) return "Thunderbird";
    if (/AOLShield\//.test(ua)) return "AOL Shield";
    if (/Coast\//.test(ua)) return "Coast";
    if (/Focus\//.test(ua)) return "Focus";
    if (/Klar\//.test(ua)) return "Klar";
    if (/Falkon\//.test(ua)) return "Falkon";
    if (/Konqueror\//.test(ua)) return "Konqueror";
    if (/Kindle\//.test(ua)) return "Kindle";

    // Default case
    return "Browser";
  }

  /// override in expo
  protected static getOSInfo(): string {
    const ua = navigator.userAgent;
    if (/Windows NT 10/.test(ua)) {
      return "Windows10";
    } else if (/Windows NT 6.3/.test(ua)) {
      return "Windows8.1";
    } else if (/Windows NT 6.2/.test(ua)) {
      return "Windows8";
    } else if (/Windows NT 6.1/.test(ua)) {
      return "Windows7";
    } else if (/Mac OS X/.test(ua)) {
      const matches = ua.match(/Mac OS X (\d+[._]\d+[._\d]*)/);
      if (matches) {
        return `macOS${matches[1].replace(/_/g, ".")}`;
      }
      return "macOS";
    } else if (/Android/.test(ua)) {
      const matches = ua.match(/Android (\d+\.\d+)/);
      if (matches) {
        return `Android${matches[1]}`;
      }
      return "Android";
    } else if (/iOS/.test(ua) || /iPhone|iPad|iPod/.test(ua)) {
      const matches = ua.match(/OS (\d+_\d+)/);
      if (matches) {
        return `iOS${matches[1].replace(/_/g, ".")}`;
      }
      return "iOS";
    } else if (/Linux/.test(ua)) {
      return "Linux";
    }
    return "Unknown";
  }

  private static getOSInfoSafe(): string {
    return this.getOSInfo().slice(0, 25);
  }

  /// override in expo
  protected static isDebug(): boolean {
    return (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    );
  }

  private static safe(
    value: string,
    keepUnitSeparator: boolean = false
  ): string {
    if (keepUnitSeparator) {
      return value.replace(new RegExp(RECORD_SEPARATOR, "g"), "");
    }
    return value
      .replace(new RegExp(RECORD_SEPARATOR, "g"), "")
      .replace(new RegExp(UNIT_SEPARATOR, "g"), "");
  }

  private static stringForDouble(value: number): string {
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

  private static async enqueueEvent(event: EventTask) {
    this._queue.push(event);
    await this.saveQueue();

    if (!this._isProcessing) {
      await this.processQueue();
    }
  }

  private static async processQueue(): Promise<void> {
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

  private static async sendEvent(event: EventTask): Promise<boolean> {
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

  private static async saveQueue() {
    try {
      await this.asyncStorage.setItem(
        "tools.quanta.queue.tasks",
        JSON.stringify(this._queue)
      );
    } catch (e) {
      this.debugWarn("Failed to save queue to storage:", e);
    }
  }

  private static async loadQueue() {
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

  private static setAbJson(abJson: string) {
    this._abLetters = this.getAbLetters(abJson);
    this._abDict = this.getAbDict(abJson);
  }

  private static getAbLetters(abJson: string): string {
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

  private static getAbDict(abJson: string): Record<string, string> {
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

  private static stringToNumber(input: string): number {
    // Simple hash function similar to the Swift version
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash % 100);
  }

  private static generateUuid(): string {
    // Simple implementation of RFC4122 version 4 UUIDs
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0,
          v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  private static shortenUuid(uuidStr: string): string {
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

  private static isValidUUID(str: string): boolean {
    const pattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return pattern.test(str);
  }

  private static shouldLog(): boolean {
    if (this.loggingEnabled === null) {
      return this.isDebug();
    }
    return this.loggingEnabled;
  }

  private static loggingEnabled: boolean | null = null;
  public static enableLogging() {
    this.loggingEnabled = true;
  }
  public static disableLogging() {
    this.loggingEnabled = false;
  }

  private static debugLog(...args: any[]) {
    if (!this.shouldLog()) return;
    console.log(...args);
  }

  private static debugWarn(...args: any[]) {
    if (!this.shouldLog()) return;
    console.warn(...args);
  }

  private static debugError(...args: any[]) {
    if (!this.shouldLog()) return;
    console.error(...args);
  }

  /**
   * Checks if the app has been claimed and shows welcome message if not
   */
  private static async checkClaimed(): Promise<void> {
    if (!this._appId) return;

    try {
      const response = await fetch(
        `https://quanta.tools/api/claimed/${this._appId}`
      );
      if (!response.ok) return;

      const data = await response.json();
      if (!data.unClaimed) return;

      // App is unclaimed, show welcome message
      console.log(
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
      console.log("Welcome to Quanta! 🥳");
      console.log("Your analytics are fully set up.");
      console.log(
        "See your first events coming in and attach this app to your Quanta account at"
      );
      console.log(`https://quanta.tools/setup/${this._appId}`);
      console.log("");
      console.log(
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

export { Quanta };
export default Quanta;
