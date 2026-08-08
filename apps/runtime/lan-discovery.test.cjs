"use strict";

const assert = require("node:assert/strict");
const dgram = require("node:dgram");
const http = require("node:http");
const test = require("node:test");
const {
  DISCOVERY_PROTOCOL,
  DISCOVERY_QUERY,
  DISCOVERY_VERSION,
  broadcastTargets,
  discoverVillaBridgeServer,
  normalizeDiscoveryRecord,
  parseDiscoveryRecord,
  resolveVillaBridgeNodeId
} = require("./lan-discovery.cjs");

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address()));
  });
}

function bind(socket, port = 0) {
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(port, "127.0.0.1", () => resolve(socket.address()));
  });
}

test("Android discovery validates the Villa Bridge protocol", () => {
  const record = {
    protocol: DISCOVERY_PROTOCOL,
    version: DISCOVERY_VERSION,
    role: "server",
    mode: "direct",
    dashboardPort: 8091,
    nodeId: "srv-91",
    state: "owner",
    epoch: 4,
    coordinatorId: "abcdef0123456789",
    priority: 0,
    sentAt: 1_760_000_000_000
  };
  assert.deepEqual(parseDiscoveryRecord(JSON.stringify(record)), record);
  assert.equal(parseDiscoveryRecord(JSON.stringify({ ...record, role: "android" })), null);
  assert.equal(parseDiscoveryRecord("not-json"), null);
  assert.equal(
    normalizeDiscoveryRecord(JSON.stringify({ ...record, role: "android", priority: undefined })).priority,
    1
  );
  assert.equal(normalizeDiscoveryRecord(JSON.stringify({ ...record, role: "peer" })), null);
  assert.deepEqual(
    broadcastTargets({
      wlan0: [{ family: "IPv4", internal: false, address: "192.168.4.20", netmask: "255.255.255.0" }]
    }),
    ["255.255.255.255", "192.168.4.255"]
  );
});

test("a legacy record without ownership fields falls back to safe unknowns", () => {
  const legacy = {
    protocol: DISCOVERY_PROTOCOL,
    version: DISCOVERY_VERSION,
    role: "server",
    mode: "direct",
    dashboardPort: 8091
  };
  assert.deepEqual(parseDiscoveryRecord(JSON.stringify(legacy)), {
    ...legacy,
    nodeId: null,
    state: null,
    epoch: 0,
    coordinatorId: null,
    priority: 0,
    sentAt: null
  });
  // Bozuk alanlar da "bilinmiyor"a düşer, kayıt yine kullanılabilir kalır.
  const damaged = parseDiscoveryRecord(JSON.stringify({
    ...legacy,
    nodeId: "   ",
    state: "sahip",
    epoch: -3,
    sentAt: "dün"
  }));
  assert.equal(damaged.nodeId, null);
  assert.equal(damaged.state, null);
  assert.equal(damaged.epoch, 0);
  assert.equal(damaged.sentAt, null);
});

test("a node ignores its own announcement", async (context) => {
  const identity = {
    protocol: DISCOVERY_PROTOCOL,
    version: DISCOVERY_VERSION,
    role: "server",
    mode: "direct",
    dashboardPort: 8091,
    nodeId: "tab-self",
    state: "owner",
    epoch: 1,
    coordinatorId: null,
    priority: 1,
    sentAt: Date.now()
  };
  const responder = dgram.createSocket("udp4");
  responder.on("message", (message, remote) => {
    if (message.toString("utf8") !== DISCOVERY_QUERY) return;
    responder.send(Buffer.from(JSON.stringify(identity)), remote.port, remote.address);
  });
  const udpAddress = await bind(responder);
  context.after(() => new Promise((resolve) => responder.close(resolve)));

  const options = {
    discoveryPort: udpAddress.port,
    targets: ["127.0.0.1"],
    allowLoopback: true,
    timeoutMs: 600,
    verify: () => true
  };
  assert.equal(await discoverVillaBridgeServer({ ...options, selfNodeId: "tab-self" }), null);
  const peer = await discoverVillaBridgeServer({ ...options, selfNodeId: "srv-91" });
  assert.equal(peer.nodeId, "tab-self");

  assert.equal(resolveVillaBridgeNodeId("android", undefined, "tablet"), resolveVillaBridgeNodeId("android", "", "tablet"));
  assert.match(resolveVillaBridgeNodeId("android", undefined, "tablet"), /^tab-[0-9a-f]{10}$/);
  assert.equal(resolveVillaBridgeNodeId("android", "custom-node"), "custom-node");
});

test("Android enters monitor mode only after UDP and HTTP identity checks", async (context) => {
  const identity = {
    protocol: DISCOVERY_PROTOCOL,
    version: DISCOVERY_VERSION,
    role: "server",
    mode: "direct",
    dashboardPort: 0
  };
  const web = http.createServer((request, response) => {
    if (request.url !== "/api/discovery") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(identity));
  });
  const webAddress = await listen(web);
  identity.dashboardPort = webAddress.port;
  context.after(() => new Promise((resolve) => web.close(resolve)));

  const responder = dgram.createSocket("udp4");
  responder.on("message", (message, remote) => {
    if (message.toString("utf8") !== DISCOVERY_QUERY) return;
    responder.send(Buffer.from(JSON.stringify(identity)), remote.port, remote.address);
  });
  const udpAddress = await bind(responder);
  context.after(() => new Promise((resolve) => responder.close(resolve)));

  const peer = await discoverVillaBridgeServer({
    discoveryPort: udpAddress.port,
    targets: ["127.0.0.1"],
    allowLoopback: true,
    timeoutMs: 750
  });

  assert.equal(peer.address, "127.0.0.1");
  assert.equal(peer.dashboardUrl, `http://127.0.0.1:${webAddress.port}/`);
  assert.equal(peer.role, "server");
});
