import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DirectZigbeeSource,
  directBridgeInfo,
  endpointNamesForDevice,
  parsePermitJoinSeconds,
  shouldPublishDeviceState,
  zigbeeAvailabilityState
} from "./direct-zigbee-source.js";
import { DeviceStore } from "./device-store.js";

test("Matterbridge permit-join boolean requests map to a bounded Zigbee duration", () => {
  assert.equal(parsePermitJoinSeconds(Buffer.from('{"value":true}')), 180);
  assert.equal(parsePermitJoinSeconds(Buffer.from('{"value":false}')), 0);
  assert.equal(parsePermitJoinSeconds(Buffer.from('{"time":999}')), 254);
  assert.equal(parsePermitJoinSeconds(Buffer.from('{"time":-10}')), 0);
});

test("direct bridge info satisfies the Matterbridge Zigbee2MQTT contract", () => {
  const info = directBridgeInfo(true, 120);
  assert.equal(info.version, "1.0.0");
  assert.equal(info.commit, "villa-bridge-direct");
  assert.equal(Number.isNaN(Number.parseInt(String(info.version), 10)), false);
  assert.equal(info.permit_join, true);
  assert.equal(info.permit_join_timeout, 120);
  assert.deepEqual(info.zigbee_herdsman, { version: "embedded" });
  assert.deepEqual(info.zigbee_herdsman_converters, { version: "embedded" });
  assert.deepEqual(info.config, {
    availability: { enabled: true },
    advanced: {
      output: "json",
      legacy_api: false,
      legacy_availability_payload: false
    }
  });
});

test("endpoint names are derived from UID-scoped channel aliases", () => {
  const aliases = new Map([
    ["0xabc", "Main device"],
    ["0xabc:l1", "Ceiling One"],
    ["0xABC:l2", " Ceiling Two "],
    ["0xdef:l1", "Different device"],
    ["0xabc:l3", "   "]
  ]);

  assert.deepEqual(endpointNamesForDevice("0xAbC", aliases), {
    l1: "Ceiling One",
    l2: "Ceiling Two"
  });
});

test("battery devices remain available longer than routers", () => {
  const now = Date.UTC(2026, 6, 30, 12);
  const twentyMinutesAgo = now - 20 * 60 * 1_000;
  assert.equal(zigbeeAvailabilityState(twentyMinutesAgo, { type: "Router" }, now), "offline");
  assert.equal(
    zigbeeAvailabilityState(twentyMinutesAgo, { type: "EndDevice", powerSource: "Battery" }, now),
    "online"
  );
  assert.equal(zigbeeAvailabilityState(undefined, { type: "Router" }, now), "offline");
});

test("direct durum debounce yalnız aynı payload'u süre içinde bastırır", () => {
  const previous = { payload: '{"state":"ON"}', at: 1_000 };
  assert.equal(shouldPublishDeviceState(previous, '{"state":"ON"}', 2, 2_500), false);
  assert.equal(shouldPublishDeviceState(previous, '{"state":"ON"}', 2, 3_000), true);
  assert.equal(shouldPublishDeviceState(previous, '{"state":"OFF"}', 2, 1_100), true);
  assert.equal(shouldPublishDeviceState(previous, '{"state":"ON"}', 0, 1_100), true);
});

test("Home Assistant discovery toggles live without restarting the source", () => {
  const store = new DeviceStore(new Map());
  store.ingest(
    "bridge/devices",
    Buffer.from(JSON.stringify([{
      ieee_address: "0xabc",
      friendly_name: "Kitchen Light",
      type: "Router",
      supported: true,
      interview_completed: true,
      definition: {
        model: "TEST-LIGHT",
        vendor: "Test",
        exposes: [{ property: "state", access: 7 }]
      }
    }]))
  );
  store.ingest("Kitchen Light", Buffer.from('{"state":"OFF","linkquality":120}'));
  const source = new DirectZigbeeSource(
    {} as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    false
  );
  const published: Array<{ topic: string; payload: string; retain: boolean }> = [];
  Object.assign(source, {
    mqtt: {
      connected: true,
      publish(topic: string, payload: string, options: { retain?: boolean }) {
        published.push({ topic, payload, retain: options.retain === true });
      }
    }
  });

  source.setHomeAssistantDiscovery(true);
  const discovery = published.filter((item) =>
    item.topic.startsWith("homeassistant/") && item.payload.length > 0
  );
  assert.ok(discovery.length > 0);
  assert.ok(discovery.every((item) => item.retain));

  published.length = 0;
  source.setHomeAssistantDiscovery(false);
  assert.ok(published.length > 0);
  assert.ok(published.every((item) => item.payload === "" && item.retain));
});

test("direct kaynak gelişmiş Zigbee işlemlerini Herdsman denetleyicisine iletir", async () => {
  const calls: Array<{ operation: string; value?: unknown }> = [];
  const router = { ieeeAddr: "0xrouter" };
  const fromEndpoint = {
    ID: 2,
    outputClusters: [6, 8],
    async bind(cluster: number, target: unknown) {
      calls.push({ operation: "bind", value: { cluster, target } });
    },
    async unbind(cluster: number, target: unknown) {
      calls.push({ operation: "unbind", value: { cluster, target } });
    }
  };
  const targetEndpoint = { ID: 3, inputClusters: [6] };
  const memberEndpoint = {
    ID: 1,
    inputClusters: [6],
    async addToGroup(target: unknown) {
      calls.push({ operation: "group-add", value: target });
    },
    async removeFromGroup(target: unknown) {
      calls.push({ operation: "group-remove", value: target });
    }
  };
  const group = {
    groupID: 1,
    members: [],
    meta: {},
    save() {},
    async command(cluster: string, command: string, value: unknown) {
      calls.push({
        operation: cluster === "genOnOff" ? "group-command" : "scene",
        value: { cluster, command, value }
      });
    }
  };
  const otaDevice = {
    async checkOta() {
      calls.push({ operation: "ota-check" });
      return {
        available: true,
        current: { fileVersion: 10 },
        availableMeta: { fileVersion: 11 }
      };
    },
    scheduleOta(value: unknown) {
      calls.push({ operation: "ota-schedule", value });
    },
    unscheduleOta() {
      calls.push({ operation: "ota-unschedule" });
    }
  };
  const mapDevices = [
    {
      ieeeAddr: "0xcoordinator",
      type: "Coordinator",
      async lqi() {
        return [{ eui64: "0xrouter", lqi: 180 }];
      }
    },
    {
      ieeeAddr: "0xrouter",
      type: "Router",
      endpoints: [],
      async lqi() {
        return [];
      }
    }
  ];
  const controller = {
    getDeviceByIeeeAddr(id: string) {
      if (id === "0xrouter") return router;
      if (id === "0xfrom") return {
        endpoints: [fromEndpoint],
        getEndpoint: (endpoint: number) => endpoint === 2 ? fromEndpoint : undefined
      };
      if (id === "0xto") return {
        endpoints: [targetEndpoint],
        getEndpoint: (endpoint: number) => endpoint === 3 ? targetEndpoint : undefined
      };
      if (id === "0xmember") return { endpoints: [memberEndpoint] };
      if (id === "0xota") return otaDevice;
      return undefined;
    },
    async permitJoin(seconds: number, selectedRouter: unknown) {
      calls.push({ operation: "permit-join", value: { seconds, selectedRouter } });
    },
    async addInstallCode(value: string) {
      calls.push({ operation: "install-code", value });
    },
    touchlink: {
      async scan() {
        return [{ ieeeAddr: "0xtouch", channel: 15 }];
      },
      async factoryReset(ieeeAddress: string, channel: number) {
        calls.push({ operation: "touchlink-reset", value: { ieeeAddress, channel } });
        return true;
      }
    },
    getGroupByID(id: number) {
      return id === 1 ? group : undefined;
    },
    getGroupsIterator() {
      return [group].values();
    },
    getDevicesIterator() {
      return mapDevices.values();
    }
  };
  const source = new DirectZigbeeSource(
    {
      devices: {},
      groups: { "1": { friendly_name: "Living Room" } }
    } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    new DeviceStore(new Map())
  );
  Object.assign(source, {
    controller,
    definitions: new Map([["0xota", { ota: {} }]])
  });

  await source.permitJoin(120, "0xrouter");
  await source.addInstallCode("install-code-value");
  assert.deepEqual(await source.scanTouchlink(), [{ ieeeAddress: "0xtouch", channel: 15 }]);
  await source.resetTouchlink("0xtouch", 15);
  await source.setGroupMember("group-1", "0xmember", true);
  await source.setGroupMember("group-1", "0xmember", false);
  await source.setGroup("group-1", { state: "ON" });
  await source.bindDevice("0xfrom", "0xto", true, undefined, 2, 3);
  await source.bindDevice("0xfrom", "0xto", false, undefined, 2, 3);
  await source.groupScene("group-1", 7, "store", "Movie");
  await source.groupScene("group-1", 7, "recall");
  await source.groupScene("group-1", 7, "remove");
  await source.scheduleOta("0xota", true);
  await source.scheduleOta("0xota", false);
  assert.deepEqual(await source.checkOta("0xota"), {
    available: true,
    currentVersion: 10,
    availableVersion: 11
  });
  assert.deepEqual(await source.networkMap(), {
    nodes: [
      { id: "0xcoordinator", name: "Coordinator", type: "Coordinator" },
      { id: "0xrouter", name: "0xrouter", type: "Router" }
    ],
    links: [{ from: "0xcoordinator", to: "0xrouter", quality: 180 }]
  });

  assert.deepEqual(
    calls.map((call) => call.operation),
    [
      "permit-join",
      "install-code",
      "touchlink-reset",
      "group-add",
      "group-remove",
      "group-command",
      "bind",
      "unbind",
      "scene",
      "scene",
      "scene",
      "ota-schedule",
      "ota-unschedule",
      "ota-check"
    ]
  );
  assert.equal(
    (calls.find((call) => call.operation === "permit-join")?.value as {
      selectedRouter: unknown;
    }).selectedRouter,
    router
  );
  assert.deepEqual(
    calls.find((call) => call.operation === "group-command")?.value,
    { cluster: "genOnOff", command: "on", value: {} }
  );
});

test("direct OTA planı cihaz isteğinde ilerleme durumunu yayınlar", async () => {
  const published: Array<Record<string, unknown>> = [];
  const device = {
    ieeeAddr: "0xota-progress",
    scheduledOta: {},
    async updateOta(
      _source: unknown,
      _payload: unknown,
      _transaction: unknown,
      _metas: unknown,
      onProgress: (progress: number, remaining: number) => void
    ) {
      onProgress(42, 90);
      return [
        { fileVersion: 10 },
        { fileVersion: 11 }
      ];
    }
  };
  const source = new DirectZigbeeSource(
    {
      devices: { "0xota-progress": { friendly_name: "OTA Test" } },
      groups: {}
    } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    new DeviceStore(new Map())
  );
  Object.assign(source, {
    definitions: new Map([["0xota-progress", { ota: true, fromZigbee: [] }]]),
    mqtt: {
      connected: true,
      publish(_topic: string, payload: string) {
        published.push(JSON.parse(payload) as Record<string, unknown>);
      }
    }
  });

  await (source as unknown as {
    onMessage(message: unknown): Promise<void>;
  }).onMessage({
    cluster: "genOta",
    type: "commandQueryNextImageRequest",
    device,
    endpoint: {},
    data: { fileVersion: 10 },
    meta: { zclTransactionSequenceNumber: 7 }
  });

  assert.ok(published.some((payload) =>
    (payload.update as Record<string, unknown>)?.state === "updating"
    && (payload.update as Record<string, unknown>)?.progress === 42
  ));
  assert.deepEqual(published.at(-1)?.update, {
    state: "idle",
    progress: 100,
    installed_version: 11
  });
});

test("direct cihaz seçenekleri configuration.yaml dosyasına kalıcı yazılır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-zigbee-options-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const configurationFile = join(directory, "configuration.yaml");
  await writeFile(configurationFile, 'devices:\n  "0xoptions":\n    friendly_name: Office Light\ngroups: {}\n');
  const config = {
    dataDir: directory,
    configurationFile,
    devices: { "0xoptions": { friendly_name: "Office Light" } },
    groups: {}
  };
  const source = new DirectZigbeeSource(
    config as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    new DeviceStore(new Map())
  );
  Object.assign(source, {
    controller: {
      getDeviceByIeeeAddr: (id: string) => id === "0xoptions" ? {} : undefined,
      getDevicesIterator: () => [].values()
    }
  });

  await source.setDeviceOptions("0xoptions", {
    transition: 1.5,
    debounce: 0.25,
    retain: true
  });

  const saved = await readFile(configurationFile, "utf8");
  assert.match(saved, /transition: 1\.5/);
  assert.match(saved, /debounce: 0\.25/);
  assert.match(saved, /retain: true/);
  assert.deepEqual(config.devices["0xoptions"], {
    friendly_name: "Office Light",
    transition: 1.5,
    debounce: 0.25,
    retain: true
  });

  await source.setDeviceOptions("0xoptions", {
    transition: 2,
    debounce: undefined,
    retain: undefined
  });
  const partiallySaved = await readFile(configurationFile, "utf8");
  assert.match(partiallySaved, /transition: 2/);
  assert.match(partiallySaved, /debounce: 0\.25/);
  assert.match(partiallySaved, /retain: true/);
  assert.doesNotMatch(partiallySaved, /(?:debounce|retain): null/);
});

test("direct cihaz state yayını retain seçeneğini uygular", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-zigbee-retain-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const config = {
    dataDir: directory,
    devices: {
      "0xretain": { friendly_name: "Retain Test", retain: false }
    },
    groups: {}
  };
  const endpoint = {};
  const device = {
    ieeeAddr: "0xretain",
    endpoints: [endpoint],
    getEndpoint: () => endpoint
  };
  const definition = {
    toZigbee: [{
      key: ["state"],
      async convertSet() {
        return { state: { state: "ON" } };
      }
    }]
  };
  const published: Array<{ topic: string; retain: boolean }> = [];
  const source = new DirectZigbeeSource(
    config as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    new DeviceStore(new Map())
  );
  Object.assign(source, {
    controller: { getDeviceByIeeeAddr: () => device },
    definitions: new Map([["0xretain", definition]]),
    mqtt: {
      connected: true,
      publish(topic: string, _payload: string, options: { retain?: boolean }) {
        published.push({ topic, retain: options.retain === true });
      }
    }
  });

  await source.setDevice("0xretain", { state: "ON" });
  assert.equal(published.at(-1)?.retain, false);
  config.devices["0xretain"].retain = true;
  await source.setDevice("0xretain", { state: "ON" });
  assert.equal(published.at(-1)?.retain, true);
});

test("direct Zigbee grupları oluşturulur, yeniden adlandırılır ve kalıcı silinir", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-zigbee-groups-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const configurationFile = join(directory, "configuration.yaml");
  await writeFile(configurationFile, "devices: {}\ngroups: {}\n");
  const config = {
    dataDir: directory,
    configurationFile,
    devices: {},
    groups: {} as Record<string, { friendly_name?: string }>
  };
  const groups = new Map<number, {
    groupID: number;
    members: [];
    meta: Record<string, unknown>;
    save: () => void;
    command: (cluster: string, command: string, payload: unknown) => Promise<void>;
    removeFromDatabase: () => void;
    removeFromNetwork: () => Promise<void>;
  }>();
  const makeGroup = (id: number) => {
    const group = {
      groupID: id,
      members: [] as [],
      meta: {} as Record<string, unknown>,
      save: () => undefined,
      command: async () => undefined,
      removeFromDatabase: () => {
        groups.delete(id);
      },
      removeFromNetwork: async () => {
        groups.delete(id);
      }
    };
    groups.set(id, group);
    return group;
  };
  const source = new DirectZigbeeSource(
    config as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    new DeviceStore(new Map())
  );
  Object.assign(source, {
    controller: {
      getGroupByID: (id: number) => groups.get(id),
      createGroup: (id: number) => makeGroup(id),
      getGroupsIterator: () => groups.values()
    }
  });

  await source.createGroup("Living Room");
  assert.match(await readFile(configurationFile, "utf8"), /friendly_name: Living Room/);
  await source.renameGroup("group-1", "Lounge");
  assert.match(await readFile(configurationFile, "utf8"), /friendly_name: Lounge/);
  await source.groupScene("group-1", 4, "store", "Movie");
  assert.deepEqual(groups.get(1)?.meta.villa_scenes, [{ id: 4, name: "Movie" }]);
  assert.doesNotMatch(await readFile(configurationFile, "utf8"), /villa_scenes|name: Movie/);
  await source.groupScene("group-1", 4, "remove");
  assert.equal(groups.get(1)?.meta.villa_scenes, undefined);
  await source.removeGroup("group-1", true);

  const saved = await readFile(configurationFile, "utf8");
  assert.doesNotMatch(saved, /Living Room|Lounge/);
  assert.equal(groups.size, 0);
  assert.deepEqual(config.groups, {});
});
