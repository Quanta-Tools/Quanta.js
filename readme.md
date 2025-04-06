# Quanta.js

Quanta.js is a lightweight analytics SDK for web applications. It's a JavaScript port of the Quanta Swift SDK, providing the same powerful analytics capabilities for websites and web applications.

## Features

- Simple event tracking with custom parameters
- Automatic page view tracking
- User identification and session management
- A/B testing support
- Revenue tracking
- Lightweight and performant

## Installation

### Option 1: Script Tag (Recommended)

Add the following script tag to your HTML:

```html
<script src="https://js.quanta.tools/app/{YOUR_APP_ID}.js"></script>
```

Replace `{YOUR_APP_ID}` with your Quanta application ID.

<!--
### Option 2: NPM

```bash
npm install @quanta/js
```

Then import it into your application:

```js
import Quanta from "@quanta/js";

// Initialize with your app ID
Quanta.initialize();
``` -->

## Usage

### Basic Event Tracking

```js
// Track a simple event
window.quanta.log("button_click");

// Track an event with parameters
window.quanta.log("product_view", { product_id: "123", category: "shoes" });

// Track an event with revenue
window.quanta.logWithRevenue("purchase", 29.99, { product_id: "123" });
```

### View Tracking

By default, Quanta automatically tracks page views when the page loads and when navigation occurs (through history API). You can disable this behavior using configuration attributes.

### User Identification

Quanta assigns each user a unique ID on their first visit. You can access or set this ID:

```js
// Get the current user ID
const userId = window.quanta.getId();

// Set a custom user ID
window.quanta.setId("user-123");
```

## Configuration

You can configure Quanta.js behavior using data attributes on the script tag:

```html
<script
  src="https://js.quanta.tools/app/{YOUR_APP_ID}.js"
  data-skip-first-view-event
  data-enable-debug-logs
></script>
```

Available attributes:

| Attribute                          | Description                                               |
| ---------------------------------- | --------------------------------------------------------- |
| `data-skip-first-view-event`       | Skip tracking the initial page view                       |
| `data-skip-navigation-view-events` | Skip tracking navigation events after the first page view |
| `data-skip-all-view-events`        | Disable all automatic page view tracking                  |
| `data-enable-debug-logs`           | Enable debug logging to the console                       |

<!-- ## A/B Testing

Quanta.js includes built-in support for A/B testing:

```js
// Get the variant (A, B, C, etc.) for a specific experiment
const variant = window.quanta.abTest("pricing_experiment");

if (variant === "A") {
  // Show variant A
} else if (variant === "B") {
  // Show variant B
}

// Track an event with the experiment information
window.quanta.log("checkout", { pricing_variant: variant });
``` -->

## API Reference

<!--
### Core Methods

#### `Quanta.initialize()`

Initialize the Quanta SDK. This is called automatically when using the script tag.

#### `Quanta.log(event, addedArguments?)`

Track an event with optional parameters.

- `event`: String - The name of the event (max 200 chars)
- `addedArguments`: Object or String - Additional event parameters

#### `Quanta.logWithRevenue(event, revenue, addedArguments?)`

Track an event with revenue and optional parameters.

- `event`: String - The name of the event
- `revenue`: Number - The revenue amount
- `addedArguments`: Object or String - Additional event parameters

#### `Quanta.getId()`

Get the current user ID.

#### `Quanta.setId(id)`

Set a custom user ID.

- `id`: String - The custom user ID to set

#### `Quanta.abTest(experimentName)`

Get the variant for an A/B test experiment.

- `experimentName`: String - The name of the experiment
- Returns: String - The variant (A, B, C, etc.)

### Debug Methods

#### `Quanta.enableLogging()`

Enable debug logging to the console.

#### `Quanta.disableLogging()`

Disable debug logging to the console. -->

## Browser Compatibility

Quanta.js works in all modern browsers that support:

- `localStorage`
- `fetch` API (polyfilled for older browsers)
- History API

## Data Privacy and Compliance

Quanta.js is designed with privacy in mind. User IDs are generated as random UUIDs and then shortened for efficiency. No personal information is collected unless explicitly passed in event parameters. Quanta is GDPR compliant.

## Best Practices

1. Keep event names consistent across your application
2. Use clear, descriptive event names and parameter keys
3. Don't include sensitive or personally identifiable information in event parameters
4. Use revenue tracking for all monetization events

## Support

Visit [quanta.tools](https://quanta.tools) for the iOS SDK, dashboard access, and support resources.
