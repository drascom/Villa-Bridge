"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  THRESHOLDS,
  createPeerProbe,
  createPeerWatchState,
  startPeerWatcher
} = require("./peer-watch.cjs");

const PEER = { nodeId: "srv-91", address: "192.0.2.91", mode: "direct", state: "owner" };
const probe = (channels) => ({ beacon: false, http: false, mqtt: false, ...channels, ...PEER });

test("peer watch thresholds match the failover plan", () => {
  assert.deepEqual(THRESHOLDS, {
    beaconIntervalMs: 2000,
    beaconStaleMs: 15000,
    pollIntervalMs: 10000,
    probeTimeoutMs: 2000,
    takeoverFailures: 9,
    recoverySuccesses: 3,
    claimJitterMaxMs: 15000
  });
});

test("one or two failing channels never advance the failure counter", () => {
  let clock = 1000;
  const state = createPeerWatchState({ now: () => clock, logger: () => undefined });
  for (const channels of [{ beacon: true }, { http: true }, { mqtt: true }, { beacon: true, mqtt: true }]) {
    clock += THRESHOLDS.pollIntervalMs;
    const status = state.record(probe(channels));
    assert.equal(status.consecutiveFailures, 0);
    assert.equal(status.readyToTakeOver, false);
    assert.equal(status.lastSeenAt, clock);
  }
  assert.deepEqual(state.status().peer, {
    nodeId: "srv-91",
    address: "192.0.2.91",
    state: "owner",
    mode: "direct"
  });
});

test("all three channels failing raise the take-over-ready flag without acting", () => {
  let clock = 0;
  const logs = [];
  const state = createPeerWatchState({ now: () => clock, logger: (message) => logs.push(message) });
  state.record(probe({ beacon: true, http: true, mqtt: true }));
  for (let index = 1; index <= THRESHOLDS.takeoverFailures; index += 1) {
    clock += THRESHOLDS.pollIntervalMs;
    const status = state.record(probe({}));
    assert.equal(status.consecutiveFailures, index);
    assert.equal(status.readyToTakeOver, index >= THRESHOLDS.takeoverFailures);
    assert.equal(status.action, "none");
  }
  const status = state.status();
  assert.deepEqual(status.downChannels, ["beacon", "http", "mqtt"]);
  assert.equal(status.lastSeenAgeMs, THRESHOLDS.takeoverFailures * THRESHOLDS.pollIntervalMs);
  assert.equal(logs.length, 1);
  // Phase 2 exposes observation only: there is no take-over entry point at all.
  assert.deepEqual(Object.keys(state).sort(), ["record", "status"]);
});

test("a peer that was never seen is never declared missing", () => {
  const state = createPeerWatchState({ logger: () => undefined });
  for (let index = 0; index < 20; index += 1) {
    state.record({ beacon: false, http: false, mqtt: false });
  }
  assert.equal(state.status().peer, null);
  assert.equal(state.status().consecutiveFailures, 0);
  assert.equal(state.status().readyToTakeOver, false);
});

test("a single success resets the counter and clears the flag after hysteresis", () => {
  let clock = 0;
  const state = createPeerWatchState({ now: () => clock, logger: () => undefined });
  state.record(probe({ http: true }));
  for (let index = 0; index < THRESHOLDS.takeoverFailures; index += 1) {
    clock += THRESHOLDS.pollIntervalMs;
    state.record(probe({}));
  }
  assert.equal(state.status().readyToTakeOver, true);
  for (let index = 1; index <= THRESHOLDS.recoverySuccesses; index += 1) {
    clock += THRESHOLDS.pollIntervalMs;
    const status = state.record(probe({ http: true }));
    assert.equal(status.consecutiveFailures, 0);
    assert.equal(status.readyToTakeOver, index < THRESHOLDS.recoverySuccesses);
  }
});

test("stopping the watcher clears its timer", async () => {
  let probes = 0;
  const statuses = [];
  const watcher = startPeerWatcher({
    intervalMs: 50,
    logger: () => undefined,
    onStatus: (status) => statuses.push(status),
    probe: async () => {
      probes += 1;
      return probe({ beacon: true });
    }
  });
  await watcher.probeOnce();
  watcher.stop();
  const seen = probes;
  await new Promise((resolve) => setTimeout(resolve, 160));
  assert.equal(probes, seen);
  assert.ok(statuses.length > 0);
  assert.equal(watcher.status().readyToTakeOver, false);
});

test("the three-channel probe tolerates a lost beacon until it goes stale", async () => {
  let clock = 0;
  let beaconAnswers = true;
  const probeOnce = createPeerProbe({
    address: "192.0.2.91",
    dashboardPort: 8091,
    mqttPort: 1883,
    now: () => clock,
    probeBeacon: async () => (beaconAnswers ? { nodeId: "srv-91", mode: "direct", state: "owner" } : null),
    probeHttp: async () => false,
    probeMqtt: async () => false
  });

  const first = await probeOnce();
  assert.equal(first.beacon, true);
  assert.equal(first.nodeId, "srv-91");

  beaconAnswers = false;
  clock += THRESHOLDS.beaconStaleMs - 1;
  assert.equal((await probeOnce()).beacon, true);

  clock += 2;
  const stale = await probeOnce();
  assert.equal(stale.beacon, false);
  assert.equal(stale.address, "192.0.2.91");
});
