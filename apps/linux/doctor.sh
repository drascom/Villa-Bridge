#!/bin/sh
set -eu

DATA_DIR="${VILLA_BRIDGE_DATA_DIR:-/var/lib/villa-bridge}"
FAILED=0

check() {
  if "$@" >/dev/null 2>&1; then
    printf 'OK   %s\n' "$*"
  else
    printf 'FAIL %s\n' "$*"
    FAILED=1
  fi
}

echo "Villa Bridge Linux doctor"
echo "Host: $(uname -s) $(uname -m)"
if command -v node >/dev/null 2>&1; then
  echo "Node: $(node --version)"
else
  echo "Node: missing"
  FAILED=1
fi

check test -f "$DATA_DIR/provisioning.json"
check test -f "$DATA_DIR/config/villa-bridge.yaml"
check test -f "$DATA_DIR/zigbee/configuration.yaml"
check systemctl is-enabled villa-bridge.service
check systemctl is-active villa-bridge.service

if command -v curl >/dev/null 2>&1; then
  check curl --fail --silent --max-time 3 http://127.0.0.1:8092/api/ready
  check curl --fail --silent --max-time 3 http://127.0.0.1:8091/api/health
fi

if [ "$FAILED" -ne 0 ]; then
  echo "One or more checks need attention."
  exit 1
fi
echo "All Linux runtime checks passed."
