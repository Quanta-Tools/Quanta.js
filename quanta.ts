import { installFetchPolyfill } from "./polyfill";

const RECORD_SEPARATOR = "\u001E";
const UNIT_SEPARATOR = "\u001F";

// Install fetch polyfill early
if (typeof window !== "undefined") {
  installFetchPolyfill();
}

/**
 * Quanta Analytics SDK for Web
 */
class Quanta {
  private static _initialized = false;
  private static _id = "";
  private static _appId = "";
  private static _abLetters = "";
  private static _abDict: Record<string, string> = {};
  private static _queue: EventTask[] = [];
  private static _isProcessing = false;
  private static _installDate = 0;

  /**
   * Initialize the Quanta SDK
   * @param appId Your Quanta application ID (optional if loaded via script tag)
   */
  static initialize(): void {
    if (this._initialized) return;

    // Auto-detect app ID from script tag if not provided
    this._appId = this.getAppIdFromScriptTag();

    if (!this._appId) {
      console.warn("No Quanta app ID provided. Analytics will not be sent.");
      return;
    }

    console.log("Quanta initialized");
    this._initialized = true;

    // Load or generate user ID
    this._id = this.loadOrCreateId();
    this._installDate = this.loadOrCreateInstallDate();

    // Load AB test settings
    const abJson = localStorage.getItem("tools.quanta.ab") || "";
    this._abLetters = this.getAbLetters(abJson);
    this._abDict = this.getAbDict(abJson);

    // Load any queued events
    this.loadQueue();

    // Process any queued events
    this.processQueue();

    // Send launch event
    this.log("launch");
  }

  /**
   * Extract app ID from the script tag URL
   * Expected format: https://js.quanta.tools/app/{appId}.js
   */
  private static getAppIdFromScriptTag(): string {
    try {
      // Find all script tags
      const scripts = document.getElementsByTagName("script");

      // Look for the Quanta script tag
      for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].src;
        if (!src) continue;

        // Match the pattern https://js.quanta.tools/app/{appId}.js
        const match = src.match(
          /^((https?:)?\/\/)?js\.quanta\.tools\/app\/([^\/]+)\.js$/i
        );
        if (match && match[3]) {
          return match[3];
        }
      }
    } catch (e) {
      console.error("Failed to extract Quanta app ID from script tag:", e);
      return "";
    }

    console.error(
      "Failed to extract Quanta app ID from script tag. Please make sure the script tag is loaded correctly:"
    );
    console.error(
      `<script src="https://js.quanta.tools/app/{appId}.js"></script>`
    );

    return "";
  }

  /**
   * Log an event to Quanta
   * @param event Event name
   * @param addedArguments Additional event parameters
   */
  static log(event: string, addedArguments: Record<string, string> = {}): void {
    this.logWithRevenue(event, 0, addedArguments);
  }

  /**
   * Log an event with revenue to Quanta
   * @param event Event name
   * @param revenue Revenue amount
   * @param addedArguments Additional event parameters
   */
  static logWithRevenue(
    event: string,
    revenue: number = 0,
    addedArguments: Record<string, string> = {}
  ): void {
    if (!this._initialized) {
      this.initialize();
    }

    if (event.length > 200) {
      console.warn(
        "Event name is too long. Event name + args should be 200 characters or less. It will be truncated."
      );
      event = event.substring(0, 200);
    }

    let argString = "";
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

    // Check if event + args exceeds length limit
    if (event.length + argString.length > 200) {
      console.warn(
        "Added arguments are too long. Event name + args should be 200 characters or less. They will be truncated."
      );
      argString = argString.substring(0, 200 - event.length);
    }

    const userData = this.getUserData();
    const revenueString = this.stringForDouble(revenue);

    this.enqueueEvent({
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
  static abTest(experimentName: string): string {
    if (!this._initialized) {
      this.initialize();
    }
    return this._abDict[experimentName.toLowerCase()] || "A";
  }

  /**
   * Set the user ID
   * @param id User ID
   */
  static setId(id: string): void {
    if (this._id === "") {
      if (this.isValidUUID(id)) {
        this._id = this.shortenUuid(id);
      } else {
        this._id = id;
        if (this._id.length !== 22) {
          console.warn(
            `The ID ${this._id} does not look like a valid UUID or Quanta ID. Only use UUIDs or shortened Quanta IDs as user IDs.`
          );
        }
      }
      localStorage.setItem("tools.quanta.id", this._id);
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

  private static loadOrCreateId(): string {
    const storedId = localStorage.getItem("tools.quanta.id");
    if (storedId) {
      return storedId;
    }
    const newId = this.shortenUuid(this.generateUuid());
    localStorage.setItem("tools.quanta.id", newId);
    return newId;
  }

  private static loadOrCreateInstallDate(): number {
    const storedDate = localStorage.getItem("tools.quanta.install");
    if (storedDate) {
      return parseInt(storedDate, 10);
    }
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem("tools.quanta.install", now.toString());
    return now;
  }

  private static getUserData(): string {
    const device = this.getDeviceInfo();
    const os = this.getOSInfo();
    const bundleId = window.location.hostname;
    const debugFlags = this.isDebug() ? 1 : 0;
    const version = "1.0.0";
    const language = navigator.language.replace("-", "_");

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

  private static getDeviceInfo(): string {
    // Basic detection of device type for web
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) {
      return "iOS-Web";
    } else if (/Android/.test(ua)) {
      return "Android-Web";
    } else if (/Windows/.test(ua)) {
      return "Windows-Web";
    } else if (/Mac/.test(ua)) {
      return "Mac-Web";
    } else if (/Linux/.test(ua)) {
      return "Linux-Web";
    }
    return "Web";
  }

  private static getOSInfo(): string {
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

  private static isDebug(): boolean {
    return (
      window.location.hostname.split(":")[0] === "localhost" ||
      window.location.hostname.split(":")[0] === "127.0.0.1"
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
      console.warn(
        "Value exceeds maximum allowed revenue of 999,999.99. Will be capped."
      );
      return this.stringForDouble(999999.99);
    }

    // Handle lower bound
    if (value < -999999.99) {
      console.warn(
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

  private static enqueueEvent(event: EventTask): void {
    this._queue.push(event);
    this.saveQueue();

    if (!this._isProcessing) {
      this.processQueue();
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
        this.saveQueue();
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

      const abVersion = localStorage.getItem("tools.quanta.ab.version");
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
            localStorage.setItem("tools.quanta.ab", responseText);
            this.setAbJson(responseText);
          }

          const abVersionHeader = response.headers.get("X-AB-Version");
          if (abVersionHeader) {
            localStorage.setItem("tools.quanta.ab.version", abVersionHeader);
          }
        } catch (e) {
          // Ignore parsing errors
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to send event:", error);
      return false;
    }
  }

  private static saveQueue(): void {
    try {
      localStorage.setItem(
        "tools.quanta.queue.tasks",
        JSON.stringify(this._queue)
      );
    } catch (e) {
      console.warn("Failed to save queue to localStorage:", e);
    }
  }

  private static loadQueue(): void {
    try {
      const queueData = localStorage.getItem("tools.quanta.queue.tasks");
      if (queueData) {
        const parsed = JSON.parse(queueData);
        this._queue = parsed.map((item: any) => ({
          ...item,
          time: new Date(item.time),
        }));
      }
    } catch (e) {
      console.warn("Failed to load queue from localStorage:", e);
    }
  }

  private static setAbJson(abJson: string): void {
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
      console.warn("Failed to parse AB test JSON:", e);
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
      console.warn("Failed to parse AB test JSON:", e);
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
      bytes[i] = parseInt(uuid.substr(i * 2, 2), 16);
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

// Auto-initialize when loaded via script tag
if (typeof window !== "undefined") {
  // Use setTimeout to ensure the DOM is ready and all script tags are available
  window.addEventListener("DOMContentLoaded", () => {
    Quanta.initialize();
  });
}

// Export the Quanta namespace
export default Quanta;
