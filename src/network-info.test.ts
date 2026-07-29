import assert from "node:assert/strict";
import test from "node:test";
import { networkInfoFromInterfaces } from "./network-info.js";

test("LAN IPv4 adresleri deterministik sıralanır ve Wi-Fi tercih edilir", () => {
  const result = networkInfoFromInterfaces({
    vpn0: [
      { address: "10.8.0.2", family: "IPv4", internal: false }
    ],
    lo: [
      { address: "127.0.0.1", family: "IPv4", internal: true }
    ],
    eth0: [
      { address: "172.20.0.4", family: 4, internal: false }
    ],
    wlan0: [
      { address: "fe80::1", family: "IPv6", internal: false },
      { address: "192.168.1.42", family: "IPv4", internal: false }
    ]
  });

  assert.deepEqual(result, {
    addresses: ["192.168.1.42", "172.20.0.4", "10.8.0.2"],
    preferredAddress: "192.168.1.42"
  });
});

test("tekrarlanan, geçersiz ve loopback adresleri elenir", () => {
  const result = networkInfoFromInterfaces({
    en0: [
      { address: "192.168.0.20", family: "IPv4", internal: false }
    ],
    bridge0: [
      { address: "192.168.0.20", family: "IPv4", internal: false },
      { address: "not-an-address", family: "IPv4", internal: false },
      { address: "127.0.0.1", family: "IPv4", internal: false }
    ]
  });

  assert.deepEqual(result, {
    addresses: ["192.168.0.20"],
    preferredAddress: "192.168.0.20"
  });
});

test("uygun LAN IPv4 adresi yoksa boş metadata döner", () => {
  assert.deepEqual(networkInfoFromInterfaces({
    lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    wlan0: [{ address: "fe80::1", family: "IPv6", internal: false }]
  }), {
    addresses: [],
    preferredAddress: null
  });
});

test("özel ağ adresi link-local Wi-Fi adresine tercih edilir", () => {
  assert.deepEqual(networkInfoFromInterfaces({
    wlan0: [{ address: "169.254.10.4", family: "IPv4", internal: false }],
    eth0: [{ address: "192.168.50.8", family: "IPv4", internal: false }]
  }), {
    addresses: ["192.168.50.8", "169.254.10.4"],
    preferredAddress: "192.168.50.8"
  });
});
