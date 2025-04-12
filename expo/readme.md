# Quanta.js for Expo

A lightweight analytics and screen tracking SDK for React Native and Expo applications. Track screen views, session durations, and handle app state transitions with minimal setup.

## Installation

```bash
# Using npm
npm install expo-quanta.tools

# Using pnpm
npm install expo-quanta.tools

# Using yarn
yarn add expo-quanta.tools

# Using pnpm
pnpm add expo-quanta.tools
```

## Requirements

The following Expo modules are required:

- expo-secure-store
- expo-device
- expo-constants
- expo-localization
- expo-application

## Basic Usage

### Initialize Quanta

Initialize Quanta in your app entry point:

```javascript
// App.js or index.js
import { Quanta } from 'expo-quanta.tools';

// Initialize with your project ID
Quanta.init('your-project-id');

export default function App() {
  return (
    // Your app components
  );
}
```

### Track Screen Views

Use the `useScreenTracking` hook to track user time spent on screens:

```jsx
import React, { useEffect } from "react";
import { View, Text } from "react-native";
import { useScreenTracking } from "expo-quanta.tools";

function HomeScreen() {
  const { trackScreen } = useScreenTracking();

  useEffect(() => {
    // Start tracking when component mounts, end when unmounts
    return trackScreen({
      screenId: "HomeScreen",
      args: { source: "direct_navigation" },
    });
  }, []);

  return (
    <View>
      <Text>Welcome to Home Screen</Text>
    </View>
  );
}
```

## API Reference

### useScreenTracking Hook

The main hook for tracking screen views and time spent on each screen.

#### Methods

##### `startScreenView(options: ScreenViewOptions)`

Start tracking a screen view.

```javascript
const { startScreenView } = useScreenTracking();

// Start tracking a screen
const screenId = startScreenView({
  screenId: "ProductDetailsScreen",
  args: { productId: "123", category: "electronics" },
});
```

##### `endScreenView(screenId: string)`

End tracking a screen view.

```javascript
const { endScreenView } = useScreenTracking();

// End tracking a screen
endScreenView("ProductDetailsScreen");
```

##### `trackScreen(options: ScreenViewOptions)`

Helper that combines `startScreenView` and `endScreenView`. Returns a cleanup function for use with `useEffect`.

```javascript
const { trackScreen } = useScreenTracking();

useEffect(() => {
  // Automatically tracks screen from mount to unmount
  return trackScreen({
    screenId: "CheckoutScreen",
    args: { cartValue: "99.99" },
  });
}, []);
```

##### `pauseScreenView(screenId: string)` and `resumeScreenView(screenId: string)`

Manually pause and resume tracking for specific screens.

```javascript
const { pauseScreenView, resumeScreenView } = useScreenTracking();

// Pause tracking while a modal is shown
pauseScreenView("ProductListScreen");

// Resume tracking when modal is closed
resumeScreenView("ProductListScreen");
```

##### `getDeviceInfo()`

Get device and system information for analytics.

```javascript
const { getDeviceInfo } = useScreenTracking();

async function logSystemInfo() {
  const deviceInfo = await getDeviceInfo();
  console.log("Device info:", deviceInfo);
}
```

### SessionStorageService

Handles persisting and retrieving session data.

```javascript
import { SessionStorageService } from "expo-quanta.tools";

// Check for crash evidence (sessions from previous runs)
const hasCrash = await SessionStorageService.hasCrashEvidence();
if (hasCrash) {
  console.log("App crashed during previous session");
}

// Clear all stored sessions
await SessionStorageService.clearSessions();
```

### Quanta Class

Static methods for core analytics.

```javascript
import { Quanta } from "expo-quanta.tools";

// Initialize
Quanta.init("your-project-id");

// Track an event
Quanta.logAsync("button_click", { buttonId: "submit", screenName: "checkout" });

// Send view event
Quanta.sendViewEvent();
```

## Advanced Usage

### Handling App Background/Foreground Transitions

The `useScreenTracking` hook automatically handles app state transitions, pausing sessions when the app goes to the background and resuming when it returns to the foreground.

### Crash Recovery

Session data is periodically persisted and can be retrieved after an app crash:

```javascript
import { SessionStorageService } from "expo-quanta.tools";

async function checkForCrash() {
  if (await SessionStorageService.hasCrashEvidence()) {
    // Get stored sessions from previous run
    const previousSessions = await SessionStorageService.getStoredSessions();
    console.log("Recovered sessions:", previousSessions);

    // Process crash data
    // ...

    // Clear stored sessions
    await SessionStorageService.clearSessions();
  }
}
```

### Custom Session Persistence

You can control session persistence timing for special cases:

```javascript
const { startScreenView, endScreenView } = useScreenTracking();

// For important screens, you might want to ensure session data is persisted immediately
async function navigateToCheckout() {
  // End current screen with immediate persistence
  endScreenView("ProductScreen");

  // Start tracking checkout process
  startScreenView({ screenId: "CheckoutScreen" });

  // Navigate to checkout
  navigation.navigate("Checkout");
}
```

## Troubleshooting

### Sessions Not Being Tracked

Make sure you're properly using the `trackScreen` function in a `useEffect` with an empty dependency array to ensure it runs only on mount and cleanup:

```javascript
useEffect(() => {
  return trackScreen({ screenId: "MyScreen" });
}, []); // Empty array is important!
```

### Missing Device Information

Ensure you have all the required Expo modules installed and set up correctly in your app.json:

```json
"expo": {
  "plugins": [
    "expo-secure-store",
    "expo-device",
    "expo-constants",
    "expo-localization",
    "expo-application"
  ]
}
```
