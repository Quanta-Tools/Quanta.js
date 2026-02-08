// Add type declaration for __DEV__
declare const __DEV__: boolean | undefined;

// Import just what you need from base package
import * as SecureStore from "expo-secure-store";
import * as Device from "expo-device";
import Constants from "expo-constants";
import * as Localization from "expo-localization";
import * as Application from "expo-application";
// Import normally - our plugin will intercept this import
import { AbstractQuantaBase } from "./abstract";

class QuantaExpoType extends AbstractQuantaBase {
  private _isTestFlight = false;

  init() {
    if (__DEV__) {
      console.warn("[Quanta] init called, appId from config:", Constants.expoConfig?.extra?.QuantaId);
    }
    (async () => {
      await this.detectTestFlight();
      await this.initializeAsync(undefined, true);
    })().catch((e) => {
      if (__DEV__) console.error("[Quanta] Init failed:", e);
    });
  }

  private async detectTestFlight() {
    try {
      const releaseType = await Application.getIosApplicationReleaseTypeAsync();
      // DEVELOPMENT = 3, AD_HOC = 4 are TestFlight/sandbox builds
      this._isTestFlight = releaseType === 3 || releaseType === 4;
    } catch {
      // Not on iOS or API not available
    }
  }

  makeAsyncStorage() {
    return {
      setItem: async (key: string, value: string) => {
        await SecureStore.setItemAsync(key, value);
      },
      getItem: async (key: string) => {
        const value = await SecureStore.getItemAsync(key);
        return value || "";
      },
    };
  }

  setupUrlChangeListeners() {}
  async handleUrlChange() {}

  public async sendViewEvent() {
    await this.logAsync("launch");
  }

  getAppIdFromScriptTag(): string | null {
    return Constants.expoConfig?.extra?.QuantaId ?? null;
  }

  isServerSide() {
    return false;
  }

  systemLanguageProvider(): string {
    return Localization.getLocales()[0].languageTag;
  }

  getBundleId(): string {
    return Application.applicationId || "";
  }

  getVersion(): string {
    return (
      Application.nativeApplicationVersion ||
      Constants.expoConfig?.version ||
      "1.0.0"
    );
  }

  getDeviceInfo(): string {
    return Device.modelName || "Expo Device";
  }

  getOSInfo(): string {
    return `${Device.osName ?? "Expo"} ${Device.osVersion ?? "?"}`;
  }

  getDebugFlags(): number {
    let flags = 0;
    if (__DEV__) flags |= 1;
    if (!Device.isDevice) flags |= 2;
    if (this._isTestFlight) flags |= 4;
    return flags;
  }

  parseScriptTagAttributes(): void {
    // No script tag attributes in Expo
  }
}

export const Quanta = new QuantaExpoType();
Quanta.init();
export { AbstractQuantaBase };
