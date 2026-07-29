# Villa Bridge for Android

The Android application turns an always-powered tablet into a standalone
Villa Bridge host. The foreground service embeds Node.js Mobile, the compiled
Villa Bridge core, an Aedes MQTT broker, the direct Zigbee coordinator client,
and Matterbridge with `matterbridge-zigbee2mqtt`. Linux and Raspberry Pi remain
supported deployment targets for the same core.

## Runtime Architecture

| Port | Service |
| --- | --- |
| `127.0.0.1:8091` | Villa Bridge dashboard and device API |
| `127.0.0.1:8092` | Android readiness, diagnostics, and local-only probes |
| LAN IP `:1883` | Embedded Aedes MQTT 3.1.1 broker for Home Assistant |
| `8283` | Matterbridge frontend/WebSocket used by the core |
| UDP `5540` | Matter commissioning server |

In direct mode, the core connects from the tablet to the configured TCP
coordinator, commonly an SLZB endpoint on port `6638`. It publishes the
Zigbee2MQTT-compatible retained topics consumed by Matterbridge. Matterbridge
then exposes the devices to Alexa, Apple Home, and other Matter controllers.
The broker listens on all tablet interfaces, while the core and Matterbridge
connect through `127.0.0.1`. When the provisioned Zigbee2MQTT YAML contains
both `mqtt.user` and `mqtt.password`, those credentials are mandatory for all
MQTT clients, including Home Assistant. Omitting either value preserves
anonymous compatibility and is unsuitable for an untrusted LAN.

The native start screen follows the runtime diagnostics endpoint and reports
the active MQTT, Zigbee, Matter, and dashboard stages. Settings can stop the
entire runtime while leaving a native **Start Villa Bridge** control available.
The desired stopped/running state survives app and tablet restarts.

To keep first launch practical on low-power tablets, the Node project is
packaged as one compressed `tgz` asset. Source maps and TypeScript declaration
files are removed from the runtime-only bundle, then the archive is streamed
into app-private storage with path traversal checks.

## Build and Test

Host requirements are JDK 17, Android SDK 35, NDK `27.2.12479018`, CMake
`3.22.1`, Node.js 22, npm, and `adb`.

```sh
npm install
npm test
npx --yes node@18.20.4 --test \
  apps/android/node-runtime/main.test.cjs \
  apps/android/node-runtime/orchestration.test.cjs
npm run android:build
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  apps/android/gradlew -p apps/android lintDebug testDebugUnitTest
```

Install only on the explicitly approved Nokia T10 test tablet:

```sh
adb devices -l
adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.villabridge.android/.MainActivity
```

Do not install on another Android device or operate a live Zigbee device
without explicit approval. During physical verification, only the designated
**Balcony LED Controller** may be switched; all other device checks must remain
read-only.

## Secure Provisioning

Use [android-provisioning.json](provisioning/android-provisioning.json) and
[villa-bridge.yaml](provisioning/villa-bridge.yaml) as templates. Never edit
the templates with real network keys or commit a live Zigbee2MQTT
`configuration.yaml`.

The runtime reads these private files from its device-protected `villa-data`
directory:

```text
villa-data/
├── android-provisioning.json
├── config/villa-bridge.yaml
└── zigbee/configuration.yaml
```

For a debug installation, stop the app and stream files directly into its
private storage; this avoids leaving credentials in shared tablet storage:

```sh
adb shell am force-stop com.villabridge.android
adb shell run-as com.villabridge.android mkdir -p \
  /data/user_de/0/com.villabridge.android/files/villa-data/config \
  /data/user_de/0/com.villabridge.android/files/villa-data/zigbee

adb exec-out run-as com.villabridge.android sh -c \
  'cat > /data/user_de/0/com.villabridge.android/files/villa-data/android-provisioning.json' \
  < apps/android/provisioning/android-provisioning.json
adb exec-out run-as com.villabridge.android sh -c \
  'cat > /data/user_de/0/com.villabridge.android/files/villa-data/config/villa-bridge.yaml' \
  < apps/android/provisioning/villa-bridge.yaml
adb exec-out run-as com.villabridge.android sh -c \
  'cat > /data/user_de/0/com.villabridge.android/files/villa-data/zigbee/configuration.yaml' \
  < /secure/path/to/zigbee2mqtt-configuration.yaml
adb shell run-as com.villabridge.android chmod 700 \
  /data/user_de/0/com.villabridge.android/files/villa-data \
  /data/user_de/0/com.villabridge.android/files/villa-data/config \
  /data/user_de/0/com.villabridge.android/files/villa-data/zigbee
adb shell run-as com.villabridge.android chmod 600 \
  /data/user_de/0/com.villabridge.android/files/villa-data/android-provisioning.json \
  /data/user_de/0/com.villabridge.android/files/villa-data/config/villa-bridge.yaml \
  /data/user_de/0/com.villabridge.android/files/villa-data/zigbee/configuration.yaml
```

The Zigbee configuration must contain the cloned network parameters and TCP
coordinator settings required by direct mode. If either configuration file is
absent or invalid, `/api/ready` returns `503` with an `unprovisioned` reason
instead of starting partially.

For Home Assistant, use the tablet's stable LAN address, port `1883`, and the
same `mqtt.user`/`mqtt.password` values. Do not put credentials in screenshots,
logs, committed YAML, or shell history.

Provisioning files, credentials, and network keys must never enter Git. Keep
app-private device-protected directories at mode `0700` and files at `0600`.
The debug Matterbridge frontend on port `8283` may be visible to the LAN; do
not use the debug build on an untrusted network. A release build must restrict
or authenticate that listener before distribution.

## Inspect the Runtime

```sh
adb forward tcp:18091 tcp:8091
adb forward tcp:18092 tcp:8092
curl --fail http://127.0.0.1:18092/api/ready
curl --fail http://127.0.0.1:18091/api/health
adb logcat -s VillaCoreService:V VillaNode:V AndroidRuntime:E
```

A ready system reports successful MQTT self-test, `core.ready: true`, and
`matter.ready: true`. Follow the
[Android test checklist](../../docs/android-test-checklist.md) for the complete
non-destructive and approved-device checks.

## Release Limitations

- The APK embeds Node.js Mobile `18.20.4`; Android therefore pins
  `zigbee-herdsman@6.2.0` and `zigbee-herdsman-converters@25.50.0`. The desktop
  dependency set is newer and requires Node 20+. Device-definition parity must
  be audited before release.
- The pinned `libnode.so` has 4 KiB ELF segment alignment. A production build
  for newer 16 KiB-page Android devices requires a rebuilt native runtime.
- The pinned Matterbridge/Node 18 dependency tree currently has unresolved npm
  audit findings. Run `npm audit --omit=dev` and resolve or formally assess all
  high/moderate findings before distribution.
- Release packaging must restrict access to Matterbridge port `8283`; the debug
  listener is not an acceptable security boundary on an untrusted LAN.
- Successful local tests do not by themselves prove coordinator recovery,
  every device mapping, Matter commissioning, or long-running tablet power
  behavior; complete the checklist on the approved hardware.
