# Quanta.js for Expo

A lightweight analytics and screen tracking SDK for React Native and Expo applications. Track screen views, session durations, and handle app state transitions with minimal setup.

## Installation

```bash
# Using npm
npm install expo-quanta

# Using pnpm
npm install expo-quanta

# Using yarn
yarn add expo-quanta

# Using pnpm
pnpm add expo-quanta
```

## Set AppID

You can either call

```ts
import { Quanta } from "expo-quanta";

Quanta.initialize("your app id");
```

in your App's initialization routine, or you can add

```diff
{
  "expo": {
    "name": "MyApp",
    "slug": "my-app",
    "version": "1.0.0",
    "extra": {
+     "QuantaId": "your app id"
    }
  }
}
```

to your app's `app.json` file.

## Requirements

The following Expo modules are required:

- expo-secure-store
- expo-device
- expo-constants
- expo-localization
- expo-application

## Basic Usage

### Track Screen Views

Use the `useScreenTracking` hook to track user time spent on screens:

```jsx
import React from "react";
import { View, Text } from "react-native";
import { useQuanta } from "expo-quanta";

function HomeScreen() {
  useQuanta("HomeScreen", { someOther: "args" });

  return (
    <View>
      <Text>Welcome to Home Screen</Text>
    </View>
  );
}
```

## API Reference

### useQuanta Hook

The simplest way to track screen views in functional components. This hook automatically handles tracking when a component mounts and unmounts.

#### Usage

```jsx
import React from "react";
import { View, Text } from "react-native";
import { useQuanta } from "expo-quanta";

function HomeScreen() {
  // Track this screen with optional metadata
  useQuanta("HomeScreen", { category: "main", feature: "dashboard" });

  return (
    <View>
      <Text>Welcome to Home Screen</Text>
    </View>
  );
}
```

#### Parameters

- `screenId: string` - Identifier for the screen being tracked
- `args?: Record<string, string>` - Optional metadata for the screen view (default: `{}`)

The hook automatically:

- Starts tracking when the component mounts
- Records the time spent on the screen
- Handles app background/foreground transitions
- Ends tracking when the component unmounts
- Sends analytics data to Quanta

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

### SessionStorageService

Handles persisting and retrieving session data.

```javascript
import { SessionStorageService } from "expo-quanta";

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
import { Quanta } from "expo-quanta";

// Initialize
Quanta.initialize("your-project-id");

// Track an event
Quanta.log("button_click");
Quanta.log("purchased", { productId: "123" });
```

## Advanced Usage

### Handling App Background/Foreground Transitions

The `useScreenTracking` hook automatically handles app state transitions, pausing sessions when the app goes to the background and resuming when it returns to the foreground.

### Crash Recovery

Session data is periodically persisted and can be retrieved after an app crash:

```javascript
import { SessionStorageService } from "expo-quanta";

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
