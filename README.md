# Villa Bridge

### One friendly dashboard for your whole smart home.

[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-2f6f57)](https://nodejs.org/)
[![Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-2f6f57)](LICENSE)

Villa Bridge brings Zigbee devices, Matter systems and Home Assistant into one
clear, mobile-first control panel. It hides protocol names, MQTT topics and
endpoint details so the people using the home only see familiar device names
and simple controls.

The project is designed for households that want the flexibility of an open
smart-home stack without making every family member become a home-automation
expert.

## See Villa Bridge in action

The same dashboard adapts from a full desktop control centre to a compact,
touch-friendly mobile view.

![Villa Bridge desktop dashboard](docs/images/villa-bridge-desktop.jpg)

<p align="center">
  <img
    src="docs/images/villa-bridge-mobile-tr.jpg"
    alt="Villa Bridge Turkish mobile dashboard"
    width="390"
  >
</p>

> **Android alpha available:** the native tablet APK has been validated on a
> Nokia T10 as a standalone host for the dashboard, embedded local MQTT, direct
> TCP Zigbee core, and Matterbridge/Matter. It does not require a Raspberry Pi.
> See the [Android alpha guide](apps/android/README.md) for its tested scope,
> installation steps, and current limitations.
>
> **Linux/Pi alpha:** Debian 12 and 64-bit Raspberry Pi hosts use the same
> core and standalone runtime under `systemd`. See the
> [Linux and Raspberry Pi guide](apps/linux/README.md).

## What makes it useful

- **One name everywhere.** A device keeps its UID internally while its friendly
  name is shared with Matter, Alexa, Apple Home and Home Assistant.
- **Everyday controls first.** Pin a complete device or an individual channel to
  Home, then switch it with one tap.
- **Lights that feel natural.** Control power, brightness, colour temperature
  and supported RGB colours from a touch-friendly panel.
- **No protocol hunting.** Add or remove Zigbee devices, inspect signal quality,
  create a Matter pairing code and manage connections in the same interface.
- **Made for real homes.** Responsive grid/list views, English and Turkish
  language support, plus an Android tablet alpha and the original Linux/Pi
  deployment path.

## How it fits together

```mermaid
flowchart LR
    subgraph Zigbee["Zigbee network"]
        Z["Zigbee devices"] <--> C["Coordinator"]
        C -->|"Shadow mode"| Z2M["Zigbee2MQTT"]
    end

    subgraph Android["Android tablet — standalone alpha"]
        AND["Native Android host"]
        AMQTT["Embedded MQTT"]
        AMB["Matterbridge / Matter"]
        AND --> AMQTT
        AND --> AMB
    end

    subgraph Core["Shared Villa Bridge core"]
        V["Unified device model"]
        UI["Responsive web dashboard"] <--> V
    end

    AND <--> V
    C -->|"Direct TCP mode"| AND
    AMQTT <--> V
    V --> AMB

    subgraph Linux["Linux / Raspberry Pi host"]
        L["Node.js service"]
    end
    L <--> V

    C -->|"Direct mode"| V
    Z2M <--> MQTT["MQTT broker"]
    MQTT <--> V
    MQTT -->|"Optional discovery"| HA["Home Assistant"]

    AMB --> MATTER["Matter fabric"]
    MATTER --> ALEXA["Alexa"]
    MATTER --> APPLE["Apple Home"]
```

In **direct mode**, Villa Bridge owns the Zigbee coordinator and provides MQTT
compatibility. In **shadow mode**, Zigbee2MQTT remains in charge and Villa
Bridge follows its device state through the MQTT broker. Matterbridge publishes
the same devices into Matter for Alexa and Apple Home, while Home Assistant
discovery stays optional.

Zigbee remains the source of truth in both modes. Low-level actions use
immutable device UIDs; friendly names are presentation data and can change
safely.

Android, Linux, and Raspberry Pi are built from one `main` branch. The shared
runtime lives in `apps/runtime`; platform folders contain only host-specific
launching, packaging, and lifecycle code.

## Try it locally

You need Node.js 22+, an MQTT broker and an existing Zigbee2MQTT installation
for the default shadow mode.

```sh
git clone https://github.com/drascom/Villa-Bridge.git
cd Villa-Bridge
npm ci
npm run dev
```

Open `http://localhost:8091`. Review `config/default.yaml` before connecting a
real system. Matterbridge is optional unless you want Alexa or Apple Home
pairing.

Home Assistant users can open **Connections**, copy the displayed MQTT details
and enable discovery when ready. Discovery is off by default.

## Add a language

Dashboard translations are independent JSON packages in `public/locales/`.
Copy `en.json`, rename it with a language code such as `de.json`, then update
its `code`, native `name`, and every value under `translations`. Villa Bridge
discovers valid language files at runtime and adds them to the language switch;
no HTML or TypeScript change is required. Keep the same translation keys as the
English package and run `npm test` before submitting the new language.

## Appearance

The dashboard offers **Light**, **Dark**, and **System** appearance modes from
the top bar. The selection is stored on the device. System mode follows the
operating-system theme and updates immediately when it changes.

## Project status

Villa Bridge is under active development. Shadow mode observes an existing
Zigbee2MQTT network. Direct mode takes ownership of the coordinator and is for
experienced installers; never run two coordinator owners at once and always
back up Zigbee network data first.

The Android build is an alpha validated on a Nokia T10. It can host the local
MQTT broker, direct TCP Zigbee core, Matterbridge/Matter services, and dashboard
without a separate server. This validation is device-specific and is not yet a
general production-readiness claim. Linux and Raspberry Pi remain supported
deployment targets.

## Contributing

Ideas, device reports and pull requests are welcome. Read
[AGENTS.md](AGENTS.md), run `npm test`, and include screenshots for visible UI
changes. Please never commit network keys, MQTT credentials or access tokens.

Licensed under the [Apache License 2.0](LICENSE).
