// Add type declaration for __DEV__
declare const __DEV__: boolean | undefined;

import { Quanta as QuantaBase } from "quanta.tools";
import SecureStore from "expo-secure-store";
import Device from "expo-device";
import Constants from "expo-constants";
import Localization from "expo-localization";
import Application from "expo-application";
export { useScreenTracking } from "./useScreenTracking";

export class Quanta extends QuantaBase {
  protected static override makeAsyncStorage() {
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

  public static override asyncStorage = this.makeAsyncStorage();

  protected static override setupUrlChangeListeners() {}
  protected static override async handleUrlChange() {}

  public static async sendViewEvent() {
    await this.logAsync("launch");
  }

  protected static override getScriptTag(): HTMLScriptElement | null {
    return null;
  }

  protected static override getAppIdFromScriptTag(): string | null {
    return null;
  }

  protected static override isServerSide() {
    return false;
  }

  protected static override systemLanguageProvider(): string {
    return Localization.getLocales()[0].languageTag;
  }

  protected static override getBundleId(): string {
    return Application.applicationId || "";
  }

  protected static override getVersion(): string {
    return (
      Application.nativeApplicationVersion ||
      Constants.expoConfig?.version ||
      "1.0.0"
    );
  }

  protected static override getDeviceInfo(): string {
    return Device.modelName || "Expo Device";
  }

  protected static override getOSInfo(): string {
    return `${Device.osName ?? "Expo"} ${Device.osVersion ?? "?"}`;
  }

  protected static override isDebug(): boolean {
    return __DEV__ ?? false;
  }
}
export default Quanta;
