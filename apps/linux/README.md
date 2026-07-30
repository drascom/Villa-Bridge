# Villa Bridge for Linux and Raspberry Pi

Linux and Raspberry Pi use the same TypeScript core, dashboard, embedded MQTT
broker and Matterbridge orchestration as Android. Only the host lifecycle is
different: Android uses a foreground service; Linux uses `systemd`.

## Supported Hosts

- Debian 12 on x86-64, including LXC
- Raspberry Pi OS/Debian 12 on 64-bit ARM (`arm64`)
- Node.js 22 or newer

Use a 64-bit operating system. The initial Pi target is Pi 4 or newer; smaller
models may work but are not yet performance-tested.

## Install

Clone the repository into a stable path such as `/opt/villa-bridge`, then run:

```sh
sudo apps/linux/install-node.sh
sudo apps/linux/install.sh
```

The installer builds the common core, installs the shared runtime, creates an
unprivileged `villa-bridge` service account, and enables (but does not start)
the service. It never overwrites existing private configuration.

Copy your private Zigbee2MQTT-compatible configuration to:

```text
/var/lib/villa-bridge/zigbee/configuration.yaml
```

Use `configuration.example.yaml` in that directory as a guide. Keep the
coordinator network key and MQTT password private. Ensure no other process owns
the same Zigbee coordinator before starting direct mode.

```sh
sudo systemctl start villa-bridge
sudo apps/linux/doctor.sh
sudo journalctl -u villa-bridge -f
```

Open `http://<host-ip>:8091`. Home Assistant connects to `<host-ip>:1883`
using the MQTT credentials in the private Zigbee configuration. Matter
commissioning uses UDP `5540`.

## Service Management

```sh
sudo systemctl stop villa-bridge
sudo systemctl restart villa-bridge
sudo systemctl disable --now villa-bridge
```

Mutable files stay under `/var/lib/villa-bridge`; the checkout contains only
code. Updating the checkout and rerunning `install.sh` rebuilds the service
without replacing configuration.

## Branch and Release Model

The repository keeps one shared `main` branch. Platform work is developed in a
short-lived topic branch and merged after its target tests pass. Android,
Linux, and Raspberry Pi are release artifacts from the same source revision;
they are not maintained as permanent divergent branches.
