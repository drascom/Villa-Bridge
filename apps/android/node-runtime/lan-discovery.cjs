"use strict";

const dgram = require("node:dgram");
const http = require("node:http");
const os = require("node:os");

const DISCOVERY_PROTOCOL = "villa-bridge-lan";
const DISCOVERY_VERSION = 1;
const DISCOVERY_QUERY = "VILLA_BRIDGE_DISCOVER_V1";
const DISCOVERY_PORT = 8093;

function validPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function ipv4ToNumber(value) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((result, part) => ((result << 8) | part) >>> 0, 0);
}

function numberToIpv4(value) {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function broadcastTargets(interfaces = os.networkInterfaces()) {
  const targets = new Set(["255.255.255.255"]);
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      const address = ipv4ToNumber(entry.address);
      const netmask = ipv4ToNumber(entry.netmask);
      if (address === null || netmask === null) continue;
      targets.add(numberToIpv4((address & netmask) | (~netmask >>> 0)));
    }
  }
  return [...targets];
}

function localIpv4Addresses(interfaces = os.networkInterfaces()) {
  const addresses = new Set();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4") addresses.add(entry.address);
    }
  }
  return addresses;
}

function parseDiscoveryRecord(message) {
  try {
    const value = JSON.parse(Buffer.isBuffer(message) ? message.toString("utf8") : String(message));
    const dashboardPort = validPort(value?.dashboardPort);
    if (
      value?.protocol !== DISCOVERY_PROTOCOL ||
      value?.version !== DISCOVERY_VERSION ||
      value?.role !== "server" ||
      typeof value?.mode !== "string" ||
      !dashboardPort
    ) {
      return null;
    }
    return { ...value, dashboardPort };
  } catch {
    return null;
  }
}

function verifyVillaBridgeServer(address, record, timeoutMs = 700) {
  return new Promise((resolve) => {
    const request = http.get({
      host: address,
      port: record.dashboardPort,
      path: "/api/discovery",
      timeout: timeoutMs
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > 8 * 1024) {
          response.destroy();
          resolve(false);
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          resolve(false);
          return;
        }
        const verified = parseDiscoveryRecord(Buffer.concat(chunks));
        resolve(
          verified !== null &&
          verified.dashboardPort === record.dashboardPort &&
          verified.mode === record.mode
        );
      });
    });
    request.once("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.once("error", () => resolve(false));
  });
}

function discoverVillaBridgeServer(options = {}) {
  const timeoutMs = Math.max(100, Number(options.timeoutMs) || 2400);
  const retryMs = Math.max(100, Number(options.retryMs) || 400);
  const discoveryPort = validPort(options.discoveryPort) || DISCOVERY_PORT;
  const targets = options.targets || broadcastTargets(options.interfaces);
  const localAddresses = localIpv4Addresses(options.interfaces);
  const allowLoopback = options.allowLoopback === true;
  const verify = options.verify || verifyVillaBridgeServer;

  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    const pending = new Set();
    let finished = false;
    let queryTimer = null;
    const done = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (queryTimer) clearInterval(queryTimer);
      socket.close();
      resolve(result);
    };
    const timer = setTimeout(() => done(null), timeoutMs);

    socket.on("message", (message, remote) => {
      const record = parseDiscoveryRecord(message);
      if (
        !record ||
        pending.has(remote.address) ||
        (!allowLoopback && (localAddresses.has(remote.address) || remote.address.startsWith("127.")))
      ) {
        return;
      }
      pending.add(remote.address);
      Promise.resolve(verify(remote.address, record))
        .then((verified) => {
          if (!verified || finished) return;
          done({
            ...record,
            address: remote.address,
            dashboardUrl: `http://${remote.address}:${record.dashboardPort}/`
          });
        })
        .catch(() => undefined);
    });
    socket.once("error", () => done(null));
    socket.bind(0, "0.0.0.0", () => {
      try {
        socket.setBroadcast(true);
        const query = Buffer.from(DISCOVERY_QUERY);
        const sendQuery = () => {
          for (const target of targets) socket.send(query, discoveryPort, target);
        };
        sendQuery();
        queryTimer = setInterval(sendQuery, retryMs);
        queryTimer.unref();
      } catch {
        done(null);
      }
    });
  });
}

module.exports = {
  DISCOVERY_PORT,
  DISCOVERY_PROTOCOL,
  DISCOVERY_QUERY,
  DISCOVERY_VERSION,
  broadcastTargets,
  discoverVillaBridgeServer,
  parseDiscoveryRecord,
  verifyVillaBridgeServer
};
