# Villa Bridge Android Thin Client

The Android application is a tablet shell for the Villa Bridge web interface. It does not run
Node.js, MQTT, Zigbee, Matter, discovery, failover, or any other home-automation service. The
Raspberry Pi/Linux installation remains the only controller and the only owner of the Zigbee
coordinator.

The app opens `https://home.drascom.uk/` in a locked-down WebView. If the server or network is
temporarily unavailable, it keeps the native connection screen visible and retries every five
seconds. Links outside the Villa Bridge origin open in the system browser.

## Tablet features

The JavaScript bridge is deliberately limited to capabilities that belong to the display device:

- full-screen and keep-awake presentation;
- panel-controlled brightness and screensaver dimming;
- Wi-Fi settings shortcut;
- trusted-origin downloads through Android's download manager;
- coarse location permission for the panel's optional location picker.

The bridge reports `clientMode() === "thin-client"`. It never starts, stops, restarts, or reports
the health of the Villa Bridge server.

## Build

Requirements are JDK 17 and Android SDK 35. The NDK, CMake, Node.js Mobile and generated runtime
assets are no longer required.

```sh
npm run android:build
```

The debug APK is written to:

```text
apps/android/app/build/outputs/apk/debug/app-debug.apk
```

Install only on a user-approved device:

```sh
adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.villabridge.android/.MainActivity
```

The app contains no Zigbee credentials, MQTT password, device identifiers, or local automation
state. Authentication is the normal secure cookie issued by the HTTPS server and stored by the
WebView.
