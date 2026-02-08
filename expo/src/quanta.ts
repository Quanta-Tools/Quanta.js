// Add type declaration for __DEV__
declare const __DEV__: boolean | undefined;

// Import just what you need from base package
import SecureStore from "expo-secure-store";
import Device from "expo-device";
import Constants from "expo-constants";
import Localization from "expo-localization";
import Application from "expo-application";
// Import normally - our plugin will intercept this import
import { AbstractQuantaBase } from "./abstract";

class QuantaExpoType extends AbstractQuantaBase {
  init() {
    this.initializeAsync(undefined, true).catch(() => {});
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

  isDebug(): boolean {
    return __DEV__ ?? false;
  }

  parseScriptTagAttributes(): void {
    // No script tag attributes in Expo
  }
}

export const Quanta = new QuantaExpoType();
export { AbstractQuantaBase };
