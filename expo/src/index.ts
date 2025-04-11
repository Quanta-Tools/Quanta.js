// Add type declaration for __DEV__
declare const __DEV__: boolean | undefined;

import { Quanta as QuantaBase } from "quanta.tools";
import SecureStore from "expo-secure-store";
import Device from "expo-device";
import Constants from "expo-constants";
import Localization from "expo-localization";
import Application from "expo-application";

export class Quanta extends QuantaBase {
  protected static makeAsyncStorage() {
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

  protected static setupUrlChangeListeners() {}
  protected static async handleUrlChange() {}

  public static async sendViewEvent() {
    await this.logAsync("launch");
  }

  protected static getScriptTag(): HTMLScriptElement | null {
    return null;
  }

  protected static getAppIdFromScriptTag(): string | null {
    return null;
  }

  protected static isServerSide() {
    return false;
  }

  protected static systemLanguageProvider(): string {
    return Localization.getLocales()[0].languageTag;
  }

  protected static getBundleId(): string {
    return Application.applicationId || "";
  }

  protected static getVersion(): string {
    return (
      Application.nativeApplicationVersion ||
      Constants.expoConfig?.version ||
      "1.0.0"
    );
  }

  protected static getDeviceInfo(): string {
    return Device.modelName || "Expo Device";
  }

  protected static getOSInfo(): string {
    return `${Device.osName ?? "Expo"} ${Device.osVersion ?? "?"}`;
  }

  protected static isDebug(): boolean {
    return __DEV__ ?? false;
  }
}
export default Quanta;
