import assert from "node:assert/strict";
import test from "node:test";
import {
  PeerWatchState,
  createPeerWatcher,
  peerWatchThresholds,
  type PeerWatchProbeResult
} from "./peer-watch.js";

const peer = { nodeId: "srv-test", address: "192.0.2.91", mode: "direct", state: "owner" as const };
const probe = (
  channels: Partial<Pick<PeerWatchProbeResult, "beacon" | "http" | "mqtt">>
): PeerWatchProbeResult => ({
  beacon: false,
  http: false,
  mqtt: false,
  ...channels,
  ...peer
});

test("eşikler dokümandaki değerlerde kalır", () => {
  assert.deepEqual(peerWatchThresholds, {
    beaconIntervalMs: 2_000,
    beaconStaleMs: 15_000,
    pollIntervalMs: 10_000,
    probeTimeoutMs: 2_000,
    takeoverFailures: 9,
    recoverySuccesses: 3,
    claimJitterMaxMs: 15_000
  });
});

test("tek veya iki kanal düşünce başarısızlık sayacı ilerlemez", () => {
  let clock = 1_000;
  const state = new PeerWatchState({ now: () => clock, logger: () => undefined });
  for (const channels of [{ beacon: true }, { http: true }, { mqtt: true }, { http: true, mqtt: true }]) {
    clock += peerWatchThresholds.pollIntervalMs;
    const status = state.record(probe(channels));
    assert.equal(status.consecutiveFailures, 0);
    assert.equal(status.readyToTakeOver, false);
    assert.equal(status.lastSeenAt, clock);
  }
  const status = state.status();
  assert.equal(status.downChannels.includes("beacon"), true);
  assert.equal(status.failuresToTakeover, peerWatchThresholds.takeoverFailures);
  assert.deepEqual(status.peer, { nodeId: "srv-test", address: "192.0.2.91", state: "owner", mode: "direct" });
});

test("üç kanal birden düşünce eşikte devralmaya hazır işaretlenir, eylem yapılmaz", () => {
  let clock = 0;
  const logs: string[] = [];
  const state = new PeerWatchState({ now: () => clock, logger: (message) => logs.push(message) });
  state.record(probe({ beacon: true, http: true, mqtt: true }));
  for (let index = 1; index <= peerWatchThresholds.takeoverFailures; index += 1) {
    clock += peerWatchThresholds.pollIntervalMs;
    const status = state.record(probe({}));
    assert.equal(status.consecutiveFailures, index);
    assert.equal(status.readyToTakeOver, index >= peerWatchThresholds.takeoverFailures);
    assert.equal(status.action, "none");
  }
  const status = state.status();
  assert.equal(status.readyToTakeOver, true);
  assert.equal(status.failuresToTakeover, 0);
  assert.deepEqual(status.downChannels, ["beacon", "http", "mqtt"]);
  assert.equal(status.lastSeenAgeMs, peerWatchThresholds.takeoverFailures * peerWatchThresholds.pollIntervalMs);
  assert.equal(logs.length, 1);
  // Devralma yok: durum makinesi hiçbir eylem ucu sunmuyor (Faz 2 kapsamı).
  assert.deepEqual(
    Object.getOwnPropertyNames(Object.getPrototypeOf(state)).sort(),
    ["constructor", "record", "status"]
  );
});

test("hiç görülmemiş karşı düğüm için sayaç ilerlemez", () => {
  const state = new PeerWatchState({ logger: () => undefined });
  for (let index = 0; index < 20; index += 1) {
    state.record({ beacon: false, http: false, mqtt: false });
  }
  const status = state.status();
  assert.equal(status.peer, null);
  assert.equal(status.consecutiveFailures, 0);
  assert.equal(status.readyToTakeOver, false);
});

test("araya giren başarı sayacı sıfırlar, hazır işareti histerezisle kalkar", () => {
  let clock = 0;
  const state = new PeerWatchState({ now: () => clock, logger: () => undefined });
  state.record(probe({ http: true }));
  for (let index = 0; index < 5; index += 1) {
    clock += peerWatchThresholds.pollIntervalMs;
    state.record(probe({}));
  }
  assert.equal(state.status().consecutiveFailures, 5);
  clock += peerWatchThresholds.pollIntervalMs;
  assert.equal(state.record(probe({ mqtt: true })).consecutiveFailures, 0);

  for (let index = 0; index < peerWatchThresholds.takeoverFailures; index += 1) {
    clock += peerWatchThresholds.pollIntervalMs;
    state.record(probe({}));
  }
  assert.equal(state.status().readyToTakeOver, true);
  for (let index = 1; index <= peerWatchThresholds.recoverySuccesses; index += 1) {
    clock += peerWatchThresholds.pollIntervalMs;
    const status = state.record(probe({ beacon: true }));
    assert.equal(status.readyToTakeOver, index < peerWatchThresholds.recoverySuccesses);
  }
});

test("izleyici durdurulduğunda zamanlayıcı temizlenir ve yoklama durur", async () => {
  let probes = 0;
  const watcher = createPeerWatcher({
    intervalMs: 50,
    logger: () => undefined,
    probe: async () => {
      probes += 1;
      return probe({ beacon: true });
    }
  });
  watcher.start();
  await watcher.probeOnce();
  watcher.stop();
  const seen = probes;
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(probes, seen);
  assert.equal(watcher.status().watching, true);
});

test("yoklama hatası üç kanalın da düşmesi sayılır ama eylem doğurmaz", async () => {
  const watcher = createPeerWatcher({
    intervalMs: 10_000,
    logger: () => undefined,
    probe: async () => {
      throw new Error("ağ yok");
    }
  });
  const status = await watcher.probeOnce();
  watcher.stop();
  assert.deepEqual(status.downChannels, ["beacon", "http", "mqtt"]);
  assert.equal(status.action, "none");
  assert.equal(status.readyToTakeOver, false);
});
