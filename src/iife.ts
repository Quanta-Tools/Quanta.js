// Export the Quanta class as the default and named export
import Quanta from "./quanta";
import { installFetchPolyfill } from "./polyfill";

// Install fetch polyfill early
if (typeof window !== "undefined") {
  installFetchPolyfill();
}
// Auto-initialize when loaded via script tag
if (typeof window !== "undefined") {
  // if script tag loaded, initialize
  Quanta.initialize();
  (window as unknown as { quanta: typeof Quanta }).quanta = Quanta;

  // if script tag not loaded, wait
  window.addEventListener("DOMContentLoaded", () => {
    Quanta.initialize();
  });
}
