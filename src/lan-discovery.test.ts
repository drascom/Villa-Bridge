import assert from "node:assert/strict";
import { createSocket } from "node:dgram";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyCoordinatorOwnership,
  createVillaBridgeDiscoveryRecord,
  ownershipStateForCoordinator,
  parseVillaBridgeDiscoveryRecord,
  queryLanDiscovery,
  resolveVillaBridgeNodeId,
  resolveVillaBridgeNodeRole,
  startLanDiscoveryResponder,
  villaBridgeCoordinatorId,
  villaBridgeDiscoveryProtocol,
  villaBridgeDiscoveryQuery,
  villaBridgeDiscoveryVersion,
  villaBridgeNodePriority
} from "./lan-discovery.js";

const queryResponder = (port: number, query: string): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const client = createSocket("udp4");
    const timeout = setTimeout(() => {
      client.close();
      reject(new Error("Discovery response timed out."));
    }, 750);
    client.once("error", reject);
    client.once("message", (message) => {
      clearTimeout(timeout);
      client.close();
      resolve(JSON.parse(message.toString("utf8")) as Record<string, unknown>);
    });
    client.send(Buffer.from(query), port, "127.0.0.1");
  });

test("LAN discovery responder advertises the ownership record", async (context) => {
  const record = createVillaBridgeDiscoveryRecord("server", "direct", 8091, {
    nodeId: "srv-test",
    state: "owner",
    epoch: 7,
    coordinatorId: villaBridgeCoordinatorId("tcp://192.0.2.248:6638")
  });
  const responder = await startLanDiscoveryResponder(record, 0);
  assert.ok(responder);
  context.after(() => responder.close());

  const before = Date.now();
  const response = await queryResponder(responder.port, villaBridgeDiscoveryQuery);
  const { sentAt, ...rest } = response;
  assert.deepEqual(rest, {
    protocol: villaBridgeDiscoveryProtocol,
    version: villaBridgeDiscoveryVersion,
    role: "server",
    mode: "direct",
    dashboardPort: 8091,
    nodeId: "srv-test",
    state: "owner",
    epoch: 7,
    coordinatorId: villaBridgeCoordinatorId("tcp://192.0.2.248:6638"),
    priority: 0
  });
  assert.ok(typeof sentAt === "number" && sentAt >= before);
});

test("the announcer runs for every participating role", async (context) => {
  const record = createVillaBridgeDiscoveryRecord("android", "direct", 8091, { nodeId: "tab-test" });
  const responder = await startLanDiscoveryResponder(record, 0);
  assert.ok(responder);
  context.after(() => responder.close());

  const response = await queryResponder(responder.port, villaBridgeDiscoveryQuery);
  assert.equal(response.role, "android");
  assert.equal(response.state, "standby");
  assert.equal(response.priority, 1);
  assert.equal(response.nodeId, "tab-test");
});

test("an explicitly disabled node stays silent", async () => {
  const record = createVillaBridgeDiscoveryRecord("disabled", "direct", 8091);
  assert.equal(await startLanDiscoveryResponder(record, 0), null);
  assert.equal(resolveVillaBridgeNodeRole("disabled"), "disabled");
  assert.equal(resolveVillaBridgeNodeRole("server"), "server");
});

test("node identity is stable and the server always wins the fixed priority", () => {
  assert.equal(resolveVillaBridgeNodeId("server", undefined, "villa"), resolveVillaBridgeNodeId("server", "", "villa"));
  assert.match(resolveVillaBridgeNodeId("server", undefined, "villa"), /^srv-[0-9a-f]{10}$/);
  assert.match(resolveVillaBridgeNodeId("android", undefined, "tablet"), /^tab-[0-9a-f]{10}$/);
  assert.notEqual(
    resolveVillaBridgeNodeId("server", undefined, "villa"),
    resolveVillaBridgeNodeId("server", undefined, "tablet")
  );
  assert.equal(resolveVillaBridgeNodeId("server", "custom-node"), "custom-node");
  assert.ok(villaBridgeNodePriority("server") < villaBridgeNodePriority("android"));
  assert.equal(villaBridgeCoordinatorId(undefined), null);
  assert.equal(villaBridgeCoordinatorId("tcp://A:1"), villaBridgeCoordinatorId(" tcp://a:1 "));
});

test("the announcer reflects ownership changes made after it started", async (context) => {
  const record = createVillaBridgeDiscoveryRecord("server", "direct", 8091, { nodeId: "srv-late" });
  const responder = await startLanDiscoveryResponder(record, 0);
  assert.ok(responder);
  context.after(() => responder.close());

  assert.equal((await queryResponder(responder.port, villaBridgeDiscoveryQuery)).state, "standby");
  record.state = "owner";
  assert.equal((await queryResponder(responder.port, villaBridgeDiscoveryQuery)).state, "owner");
});

test("the node announces itself before it claims the coordinator", async () => {
  const server = await readFile(new URL("./index.js", import.meta.url), "utf8");
  const listenAt = server.indexOf("app.listen(");
  const announceAt = server.indexOf("startLanDiscoveryResponder(discoveryRecord)");
  const startAt = server.indexOf("await source.start()");
  assert.ok(listenAt > 0 && announceAt > 0 && startAt > 0);
  assert.ok(listenAt < startAt, "HTTP dinleme source.start() öncesinde olmalı.");
  assert.ok(announceAt < startAt, "Duyurucu source.start() öncesinde başlamalı.");

  // source.start() hatası süreci öldürmez: durum işaretlenir, HTTP ve duyuru sürer.
  assert.match(server.slice(Math.max(0, startAt - 120), startAt), /try \{\s*$/);
  const guarded = server.slice(startAt, startAt + 900);
  assert.match(guarded, /catch \(error\)/, "source.start() bir try/catch içinde olmalı.");
  assert.match(guarded, /applyCoordinatorStatus\("coordinator-unavailable"\)/);
  assert.doesNotMatch(guarded, /process\.exit/);
  assert.match(server, /await discoveryResponder\?\.close\(\)/);
});

test("ownership follows the coordinator, not the node role", () => {
  for (const role of ["server", "android"] as const) {
    const record = createVillaBridgeDiscoveryRecord(role, "direct", 8091, { nodeId: `${role}-node` });
    assert.equal(record.state, "standby");
    assert.equal(record.epoch, 0);

    // Koordinatör gerçekten alındıysa düğüm `owner`; rolü ne olursa olsun.
    applyCoordinatorOwnership(record, "ready");
    assert.equal(record.state, "owner");
    assert.equal(record.epoch, 1, "Sahiplik kazanıldığında epoch artar.");
    applyCoordinatorOwnership(record, "ready");
    assert.equal(record.epoch, 1, "Aynı sahiplik epoch'u tekrar artırmaz.");

    // Koordinatör alınamadıysa düğüm `standby`; epoch bırakırken artmaz.
    applyCoordinatorOwnership(record, "coordinator-unavailable");
    assert.equal(record.state, "standby");
    assert.equal(record.epoch, 1);
    applyCoordinatorOwnership(record, "starting");
    assert.equal(record.state, "standby");

    applyCoordinatorOwnership(record, "ready");
    assert.equal(record.epoch, 2);
  }
  assert.equal(ownershipStateForCoordinator("ready"), "owner");
  assert.equal(ownershipStateForCoordinator("starting"), "standby");
  assert.equal(ownershipStateForCoordinator("coordinator-unavailable"), "standby");
});

test("discovery records are parsed defensively and can be queried over UDP", async (context) => {
  assert.equal(parseVillaBridgeDiscoveryRecord("{"), null);
  assert.equal(parseVillaBridgeDiscoveryRecord(JSON.stringify({ protocol: "other" })), null);

  const record = createVillaBridgeDiscoveryRecord("server", "direct", 8091, {
    nodeId: "srv-query",
    state: "owner",
    epoch: 3
  });
  const responder = await startLanDiscoveryResponder(record, 0);
  assert.ok(responder);
  context.after(() => responder.close());

  const peer = await queryLanDiscovery({ address: "127.0.0.1", port: responder.port, timeoutMs: 1000 });
  assert.ok(peer);
  assert.equal(peer.nodeId, "srv-query");
  assert.equal(peer.state, "owner");
  assert.equal(peer.epoch, 3);
  assert.equal(peer.address, "127.0.0.1");

  // Kendi kaydını yok sayar; kimse cevap vermezse `null` döner.
  assert.equal(
    await queryLanDiscovery({
      address: "127.0.0.1",
      port: responder.port,
      timeoutMs: 400,
      selfNodeId: "srv-query"
    }),
    null
  );
});
