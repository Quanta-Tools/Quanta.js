import { AbstractQuantaBase } from "./abstract";

function fullPath(url: Location | URL) {
  return url.href.slice(url.origin.length);
}

export class QuantaWebType extends AbstractQuantaBase {
  init() {
    this.initializeAsync(undefined, true).catch(() => {});
  }

  public async sendViewEvent() {
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

    // only set referrer if its domain differs from current page
    if (document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        if (refUrl.hostname !== window.location.hostname) {
          props.referrer = document.referrer;
        }
      } catch {
        // invalid referrer URL, better safe than sorry:
        props.referrer = document.referrer;
      }
    }

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
  async handleUrlChange(): Promise<void> {
    const newPath = fullPath(window.location);
    if (newPath === this._currentPath) return;
    this._currentPath = newPath;
    this._isFirstViewEvent = false; // First view is only the initial page load
    await this.maybeSendViewEvent();
  }
  makeAsyncStorage() {
    return {
      getItem: async (key: string) => {
        return localStorage.getItem(key);
      },
      setItem: async (key: string, value: string) => {
        return localStorage.setItem(key, value);
      },
    };
  }
  setupUrlChangeListeners() {
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
    const quanta = this;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      quanta.handleUrlChange().catch(console.error);
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(quanta, args);
      quanta.handleUrlChange().catch(console.error);
    };
  }
  getAppIdFromScriptTag() {
    if (typeof window === "undefined") return null;
    const src = document.currentScript?.dataset.src || null;
    if (!src) return null;

    // Match the pattern https://js.quanta.tools/app/{appId}.js
    const match = src.match(
      /^((https?:)?\/\/)?js\.quanta\.tools\/app\/([^\/]+)\.js(\?[^\?]*)?$/i
    );
    if (match && match[3]) {
      return match[3];
    }
    this.debugError(
      "Failed to extract Quanta app ID from script tag. Please make sure the script tag is loaded correctly:"
    );
    this.debugError(
      `<script src="https://js.quanta.tools/app/{appId}.js"></script>`
    );

    return null;
  }
  isServerSide() {
    return typeof window === "undefined";
  }
  systemLanguageProvider() {
    return navigator.language;
  }
  getBundleId() {
    return window.location.hostname;
  }
  getVersion() {
    return document.currentScript?.dataset?.appVersion ?? "1.0.0";
  }
  getDeviceInfo() {
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
  getOSInfo() {
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
  isDebug() {
    return (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    );
  }
  parseScriptTagAttributes() {
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
}

const Quanta = new QuantaWebType();

export { Quanta };
export default Quanta;
