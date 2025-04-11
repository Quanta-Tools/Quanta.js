import { Quanta } from "../src/quanta.ts";

// Simple test runner
const runTest = (name: string, userAgent: string, expected: string) => {
  // Store the original navigator descriptor
  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
    global,
    "navigator"
  );

  // Mock navigator with Object.defineProperty
  Object.defineProperty(global, "navigator", {
    value: {
      userAgent: userAgent,
      brave: userAgent.includes("Brave") ? { isBrave: true } : undefined,
    },
    configurable: true,
  });

  // @ts-ignore: accessing private method
  const result = Quanta["getDeviceInfo"]();

  // Restore original navigator
  if (originalNavigatorDescriptor) {
    Object.defineProperty(global, "navigator", originalNavigatorDescriptor);
  } else {
    delete (global as any).navigator;
  }

  const success = result === expected;
  console.log(
    `${success ? "✅" : "❌"} ${name}: ${
      success ? "PASS" : "FAIL"
    } - Expected "${expected}", got "${result}"`
  );

  return success;
};

console.log("=== BROWSER DETECTION TESTS ===");

// Chrome
runTest(
  "Chrome on Windows",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
  "Chrome"
);

runTest(
  "Chrome on macOS",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36",
  "Chrome"
);

runTest(
  "Chrome on Android",
  "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36",
  "Chrome"
);

// Edge
runTest(
  "Edge on Windows",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 Edg/96.0.1054.62",
  "Edge"
);

runTest(
  "Edge on macOS",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.55 Safari/537.36 Edg/96.0.1054.43",
  "Edge"
);

// Firefox
runTest(
  "Firefox on Windows",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:95.0) Gecko/20100101 Firefox/95.0",
  "Firefox"
);

runTest(
  "Firefox on Android",
  "Mozilla/5.0 (Android 12; Mobile; rv:95.0) Gecko/95.0 Firefox/95.0",
  "Firefox"
);

// Safari
runTest(
  "Safari on macOS",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15",
  "Safari"
);

runTest(
  "Safari on iOS",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Mobile/15E148 Safari/604.1",
  "Safari"
);

// Opera
runTest(
  "Opera on Windows",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36 OPR/82.0.4227.23",
  "Opera"
);

runTest(
  "Opera Mini",
  "Opera/9.80 (Android; Opera Mini/7.5.54678/28.2555; U; ru) Presto/2.10.289 Version/12.02",
  "Opera"
);

// Internet Explorer
runTest(
  "Internet Explorer 11",
  "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko",
  "Internet Explorer"
);

runTest(
  "Internet Explorer 10",
  "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)",
  "Internet Explorer"
);

// Vivaldi
runTest(
  "Vivaldi",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36 Vivaldi/4.3",
  "Vivaldi"
);

// Samsung Browser
runTest(
  "Samsung Browser",
  "Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/16.0 Chrome/92.0.4515.166 Mobile Safari/537.36",
  "Samsung Browser"
);

// Brave
runTest(
  "Brave Browser",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 Brave/1.32.113",
  "Brave"
);

// Chromium
runTest(
  "Chromium",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/94.0.4606.81 Safari/537.36",
  "Chromium"
);

// UC Browser
runTest(
  "UC Browser",
  "Mozilla/5.0 (Linux; U; Android 9; en-US; SM-G973F Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.3.8.1305 Mobile Safari/537.36",
  "UC Browser"
);

// QQ Browser
runTest(
  "QQ Browser",
  "Mozilla/5.0 (Linux; U; Android 9; zh-cn; MI 9 Build/PKQ1.181121.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/71.0.3578.141 Mobile Safari/537.36 XiaoMi/MiuiBrowser/11.8.14 QQBrowser/10.5.3.3018",
  "QQ Browser"
);

// Maxthon
runTest(
  "Maxthon Browser",
  "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Maxthon/5.3.8.2000 Chrome/61.0.3163.100 Safari/537.36",
  "Maxthon"
);

// Yandex
runTest(
  "Yandex Browser",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 YaBrowser/21.11.0 Yowser/2.5 Safari/537.36",
  "Yandex"
);

// DuckDuckGo
runTest(
  "DuckDuckGo Browser",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 DuckDuckGo/7 Safari/605.1.15",
  "DuckDuckGo"
);

// Whale
runTest(
  "Whale Browser",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Whale/2.10.124.26 Safari/537.36",
  "Whale"
);

// Default case
runTest("Unknown browser", "Some unknown user agent string", "Browser");

console.log("=== TESTS COMPLETE ===");
