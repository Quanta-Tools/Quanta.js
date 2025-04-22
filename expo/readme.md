# Quanta.js for Expo

A lightweight analytics and screen tracking SDK for React Native and Expo applications. Track screen views, session durations, and handle app state transitions with minimal setup.

## Installation

```bash
# Using npm
npm install expo-quanta

# Using pnpm
pnpm install expo-quanta

# Using yarn
yarn add expo-quanta
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

Use the `useQuanta` hook to track user time spent on screens:

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

The more advanced hook for tracking screen views and time spent on each screen, providing greater control over tracking.

#### Methods

##### `startScreenView(screenId: string, args?: Record<string, string>)`

Start tracking a screen view.

```javascript
const { startScreenView, endScreenView } = useScreenTracking();

// Start tracking a screen
const handle = startScreenView("ProductDetailsScreen", {
  productId: "123",
  category: "electronics",
});

// Later, in cleanup:
return () => {
  endScreenView(handle);
};
```

##### `endScreenView(handle: any)`

End tracking a screen view.

```javascript
const { startScreenView, endScreenView } = useScreenTracking();

// Example in a useEffect
useEffect(() => {
  const handle = startScreenView("MyScreen", { param: "value" });
  return () => {
    endScreenView(handle);
  };
}, [startScreenView, endScreenView]);
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

### Usage with useEffect

For more control over screen tracking, use `useScreenTracking` with `useEffect`:

```javascript
import { useScreenTracking } from "expo-quanta";

function MyScreen() {
  const { startScreenView, endScreenView } = useScreenTracking();

  useEffect(() => {
    const handle = startScreenView("MyScreenName", { customProperty: "value" });

    return () => {
      endScreenView(handle);
    };
  }, [startScreenView, endScreenView]);

  return (
    <View>
      <Text>My Screen Content</Text>
    </View>
  );
}
```

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
  // Track current screen with handle
  const handle = startScreenView("ProductScreen");

  // Later when navigating away
  endScreenView(handle);

  // Start tracking checkout process
  const checkoutHandle = startScreenView("CheckoutScreen");

  // Navigate to checkout
  navigation.navigate("Checkout");
}
```

## Troubleshooting

### Sessions Not Being Tracked

Make sure you're properly using the hooks:

```javascript
// For simple cases, use useQuanta
useQuanta("MyScreen", { property: "value" });

// For more control, use useScreenTracking with useEffect
const { startScreenView, endScreenView } = useScreenTracking();

useEffect(() => {
  const handle = startScreenView("MyScreen", { property: "value" });
  return () => {
    endScreenView(handle);
  };
}, [startScreenView, endScreenView]);
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
