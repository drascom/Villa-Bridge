#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/../.." && pwd)"
DATA_DIR="${VILLA_BRIDGE_DATA_DIR:-/var/lib/villa-bridge}"
SERVICE_USER="${VILLA_BRIDGE_USER:-villa-bridge}"
SERVICE_GROUP="${VILLA_BRIDGE_GROUP:-villa-bridge}"
UNIT_PATH="/etc/systemd/system/villa-bridge.service"
START_SERVICE=false

if [ "${1:-}" = "--start" ]; then
  START_SERVICE=true
elif [ "$#" -gt 0 ]; then
  echo "Usage: $0 [--start]" >&2
  exit 2
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root." >&2
  exit 1
fi

for command in node npm systemctl sed; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    echo "On Debian, run apps/linux/install-node.sh before this installer." >&2
    exit 1
  fi
done

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Villa Bridge requires Node.js 22 or newer; found $(node --version)." >&2
  exit 1
fi

case "$(uname -m)" in
  aarch64|arm64) RUNTIME_PLATFORM="raspberry-pi" ;;
  *) RUNTIME_PLATFORM="linux" ;;
esac

if ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
  groupadd --system "$SERVICE_GROUP"
fi
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --gid "$SERVICE_GROUP" --home-dir "$DATA_DIR" \
    --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "Building the shared Villa Bridge core..."
(cd "$PROJECT_ROOT" && npm ci && npm run build)
echo "Installing the shared MQTT and Matter runtime..."
(cd "${PROJECT_ROOT}/apps/runtime" && npm ci --omit=dev)

install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0700 \
  "$DATA_DIR" "$DATA_DIR/config" "$DATA_DIR/zigbee"
if [ ! -f "$DATA_DIR/provisioning.json" ]; then
  install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
    "${SCRIPT_DIR}/provisioning/provisioning.json" "$DATA_DIR/provisioning.json"
fi
if [ ! -f "$DATA_DIR/config/villa-bridge.yaml" ]; then
  install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
    "${SCRIPT_DIR}/provisioning/villa-bridge.yaml" \
    "$DATA_DIR/config/villa-bridge.yaml"
fi
if [ ! -f "$DATA_DIR/zigbee/configuration.example.yaml" ]; then
  install -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0600 \
    "${SCRIPT_DIR}/provisioning/configuration.example.yaml" \
    "$DATA_DIR/zigbee/configuration.example.yaml"
fi

escape_sed() {
  printf '%s' "$1" | sed 's/[&|]/\\&/g'
}

TEMP_UNIT="$(mktemp)"
trap 'rm -f "$TEMP_UNIT"' EXIT HUP INT TERM
sed \
  -e "s|@SERVICE_USER@|$(escape_sed "$SERVICE_USER")|g" \
  -e "s|@SERVICE_GROUP@|$(escape_sed "$SERVICE_GROUP")|g" \
  -e "s|@PROJECT_ROOT@|$(escape_sed "$PROJECT_ROOT")|g" \
  -e "s|@NODE@|$(escape_sed "$(command -v node)")|g" \
  -e "s|@DATA_DIR@|$(escape_sed "$DATA_DIR")|g" \
  -e "s|@RUNTIME_PLATFORM@|${RUNTIME_PLATFORM}|g" \
  "${SCRIPT_DIR}/systemd/villa-bridge.service.in" > "$TEMP_UNIT"
install -o root -g root -m 0644 "$TEMP_UNIT" "$UNIT_PATH"
systemctl daemon-reload
systemctl enable villa-bridge.service

if [ "$START_SERVICE" = true ]; then
  if [ ! -f "$DATA_DIR/zigbee/configuration.yaml" ]; then
    echo "Not starting: add the private Zigbee configuration first." >&2
    echo "Template: $DATA_DIR/zigbee/configuration.example.yaml" >&2
    exit 3
  fi
  systemctl restart villa-bridge.service
fi

echo "Linux runtime installed for ${RUNTIME_PLATFORM}."
echo "Private data: $DATA_DIR"
echo "Start after provisioning: systemctl start villa-bridge"
