import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DirectZigbeeSource,
  applyEndpointSuffix,
  directBridgeInfo,
  endpointNamesForDevice,
  isRawGenOnOffFrame,
  isSelfHealProbeTarget,
  isUnresolvedActionMessage,
  parsePermitJoinSeconds,
  shouldPublishDeviceState,
  zigbeeAvailabilityState
} from "./direct-zigbee-source.js";
import { DeviceStore } from "./device-store.js";
import { createZigbeeNetworkBackup, stageZigbeeNetworkRestore } from "./zigbee-backup.js";

test("çözümlenmeyen genOnOff komutları tuş olayı teşhisine alınır", () => {
  const actionMessage = {
    cluster: "genOnOff",
    type: "commandToggle"
  } as never;
  assert.equal(isUnresolvedActionMessage(actionMessage, 0, 0), true);
  assert.equal(isUnresolvedActionMessage(actionMessage, 1, 0), true);
  assert.equal(isUnresolvedActionMessage(actionMessage, 1, 1), false);
  assert.equal(isUnresolvedActionMessage({
    cluster: "genPowerCfg",
    type: "attributeReport"
  } as never, 0, 0), false);
});

test("çözümlenemeyen ham genOnOff çerçeveleri Tuya tuş yoluna alınır", () => {
  assert.equal(isRawGenOnOffFrame({ cluster: "genOnOff", type: "raw" } as never), true);
  assert.equal(isRawGenOnOffFrame({ cluster: "genOnOff", type: "commandToggle" } as never), false);
  assert.equal(isRawGenOnOffFrame({ cluster: "genPowerCfg", type: "raw" } as never), false);
});

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

test("direct yeniden yapılandırma cihazı görüşür ve converter configure çağrısını tamamlar", async () => {
  const calls: string[] = [];
  const coordinatorEndpoint = { ID: 1 };
  const device = {
    ieeeAddr: "0xreconfigure",
    type: "EndDevice",
    endpoints: [],
    interviewState: "SUCCESSFUL",
    async interview(force: boolean) {
      calls.push(`interview:${force}`);
    }
  };
  const definition = {
    model: "TEST",
    vendor: "Villa",
    description: "Reconfigure test",
    exposes: [],
    async configure(
      configuredDevice: unknown,
      coordinator: unknown,
      configuredDefinition: unknown
    ) {
      assert.equal(configuredDevice, device);
      assert.equal(coordinator, coordinatorEndpoint);
      assert.equal(configuredDefinition, definition);
      calls.push("configure");
    }
  };
  const source = new DirectZigbeeSource(
    { devices: {}, groups: {} } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    new DeviceStore(new Map()),
    false,
    new Map(),
    (async () => definition) as never
  );
  Object.assign(source, {
    controller: {
      getDeviceByIeeeAddr(id: string) {
        return id === device.ieeeAddr ? device : undefined;
      },
      getDevicesByType(type: string) {
        return type === "Coordinator" ? [{ endpoints: [coordinatorEndpoint] }] : [];
      },
      getDevicesIterator() {
        return [device].values();
      }
    },
    refreshDevices: async () => {
      calls.push("refresh");
    }
  });

  await source.reconfigureDevice(device.ieeeAddr);

  assert.deepEqual(calls, ["interview:true", "configure", "refresh"]);
});

test("iyimser durum anahtarları uç nokta ekini korur", () => {
  const multi = { meta: { multiEndpoint: true, multiEndpointSkip: ["power_on_behavior"] } };
  assert.deepEqual(
    applyEndpointSuffix({ state: "ON", power_on_behavior: "on" }, "l2", multi),
    { state_l2: "ON", power_on_behavior: "on" }
  );
  // Uç nokta yoksa ya da cihaz çok kanallı değilse davranış değişmez.
  assert.deepEqual(applyEndpointSuffix({ state: "ON" }, undefined, multi), { state: "ON" });
  assert.deepEqual(applyEndpointSuffix({ state: "ON" }, "l2", { meta: {} }), { state: "ON" });
  // Zaten ek taşıyan anahtar iki kez eklenmez.
  assert.deepEqual(applyEndpointSuffix({ state_l2: "ON" }, "l2", multi), { state_l2: "ON" });
});

test("çok kanallı cihazda state_l2 yazımı ana state'i ezmez", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-direct-set-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const ieee = "0x00124b0011cc22dd";
  const endpoints = new Map([[1, { ID: 1 }], [2, { ID: 2 }]]);
  const device = {
    ieeeAddr: ieee,
    type: "Router",
    endpoints: [...endpoints.values()],
    getEndpoint(id: number) {
      return endpoints.get(id);
    }
  };
  const converted: Array<{ key: string; value: unknown; endpointId: number; endpointName?: string }> = [];
  const definition = {
    model: "TEST-2GANG",
    vendor: "Villa",
    description: "Two gang switch",
    exposes: [],
    meta: { multiEndpoint: true, multiEndpointSkip: ["power_on_behavior"] },
    endpoint: () => ({ l1: 1, l2: 2 }),
    toZigbee: [{
      key: ["state"],
      async convertSet(
        endpoint: { ID: number },
        key: string,
        value: unknown,
        meta: { endpoint_name?: string }
      ) {
        converted.push({ key, value, endpointId: endpoint.ID, endpointName: meta.endpoint_name });
        return { state: { state: value, power_on_behavior: "on" } };
      }
    }]
  };
  const store = new DeviceStore(new Map());
  const source = new DirectZigbeeSource(
    {
      devices: { [ieee]: { friendly_name: "Two Gang" } },
      groups: {},
      dataDir: directory
    } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    false
  );
  Object.assign(source, {
    controller: {
      getDeviceByIeeeAddr(id: string) {
        return id === ieee ? device : undefined;
      }
    },
    definitions: new Map([[ieee, definition]]),
    states: new Map([[ieee, { state: "OFF", state_l1: "OFF", state_l2: "OFF" }]])
  });

  await source.setDevice(ieee, { state_l2: "ON" });

  // Tel üstünde doğru uç nokta kullanıldı.
  assert.deepEqual(converted, [{ key: "state", value: "ON", endpointId: 2, endpointName: "l2" }]);
  const persisted = JSON.parse(await readFile(join(directory, "state.json"), "utf8")) as Record<
    string,
    Record<string, unknown>
  >;
  // Ana `state` ezilmedi, `state_l2` güncellendi, `multiEndpointSkip` anahtarı ek almadı.
  assert.deepEqual(persisted[ieee], {
    state: "OFF",
    state_l1: "OFF",
    state_l2: "ON",
    power_on_behavior: "on"
  });
  // Olay akışında da kanalın kendisi görünür — sihirbazda seçilen kanal gerçekten ateşlenir.
  const events = store.getEvents(20);
  assert.equal(events.some((event) => event.property === "state_l2" && event.value === "ON"), true);
  assert.equal(events.some((event) => event.property === "state" && event.value === "ON"), false);
});

test("direct durum debounce yalnız aynı payload'u süre içinde bastırır", () => {
  const previous = { payload: '{"state":"ON"}', at: 1_000 };
  assert.equal(shouldPublishDeviceState(previous, '{"state":"ON"}', 2, 2_500), false);
  assert.equal(shouldPublishDeviceState(previous, '{"state":"ON"}', 2, 3_000), true);
  assert.equal(shouldPublishDeviceState(previous, '{"state":"OFF"}', 2, 1_100), true);
  assert.equal(shouldPublishDeviceState(previous, '{"state":"ON"}', 0, 1_100), true);
  assert.equal(shouldPublishDeviceState(previous, '{"state":"ON"}', 60, 1_100, true), true);
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

/** Otomatik onarım testleri için sahte koordinatör; canlı donanıma hiç dokunmaz. */
function selfHealFixture(options: { configure?: () => void | Promise<void>; read?: () => void } = {}) {
  const calls: string[] = [];
  const coordinatorEndpoint = { ID: 1 };
  const endpoint = {
    ID: 1,
    async read(cluster: string, attributes: string[], readOptions: { timeout?: number }) {
      calls.push(`read:${cluster}:${attributes.join(",")}:${readOptions.timeout}`);
      options.read?.();
      return { zclVersion: 3 };
    }
  };
  const device = {
    ieeeAddr: "0x00124b00self",
    type: "Router" as string,
    powerSource: "Mains (single phase)" as string | undefined,
    lastSeen: undefined as number | undefined,
    meta: {} as Record<string, unknown>,
    endpoints: [endpoint] as unknown[],
    getEndpoint: (id: number) => id === 1 ? endpoint : undefined,
    scheduledOta: undefined as unknown,
    interviewState: "SUCCESSFUL",
    async interview() {
      calls.push("interview");
    }
  };
  const definition = {
    model: "TEST",
    vendor: "Villa",
    description: "Self heal test",
    exposes: [],
    async configure() {
      calls.push("configure");
      await options.configure?.();
    }
  };
  const handlers = new Map<string, (payload: never) => void>();
  const controller = {
    on(event: string, handler: (payload: never) => void) {
      handlers.set(event, handler);
    },
    getDeviceByIeeeAddr(id: string) {
      return id === device.ieeeAddr ? device : undefined;
    },
    getDevicesByType(type: string) {
      return type === "Coordinator"
        ? [{ getEndpoint: () => coordinatorEndpoint, endpoints: [coordinatorEndpoint] }]
        : [];
    },
    getDevicesIterator() {
      return [device].values();
    }
  };
  return { calls, controller, device, definition, handlers };
}

test("cihaz kendini ilan edince görüşmeden yapılandırılır ve iz bırakır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-self-heal-direct-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = selfHealFixture();
  const store = new DeviceStore(new Map());
  const source = new DirectZigbeeSource(
    { devices: { [fixture.device.ieeeAddr]: { friendly_name: "Hall Switch" } }, groups: {}, dataDir: directory } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    false,
    new Map(),
    (async () => fixture.definition) as never,
    { enabled: true, spacingMs: 0 }
  );
  Object.assign(source, { controller: fixture.controller, refreshDevices: async () => undefined });
  (source as unknown as { attachEvents(controller: unknown): void }).attachEvents(fixture.controller);

  fixture.handlers.get("deviceAnnounce")?.({ device: fixture.device } as never);
  await (source as unknown as { selfHeal: { whenIdle(): Promise<void> } }).selfHeal.whenIdle();

  // Pahalı ve sonuçsuz `interview(true)` yolu otomatik olarak asla çalışmaz.
  assert.deepEqual(fixture.calls, ["configure"]);
  assert.deepEqual(
    store.getEvents(5).map((event) => [event.sourceName, event.property, event.value]),
    [["Hall Switch", "self_heal", "ok"], ["Hall Switch", "self_heal", "attempt"]]
  );
});

test("eşleştirme, OTA ve yedek geri yükleme sırasında otomatik onarım denenmez", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-self-heal-blocked-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = selfHealFixture();
  const store = new DeviceStore(new Map());
  const source = new DirectZigbeeSource(
    { devices: {}, groups: {}, dataDir: directory } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    false,
    new Map(),
    (async () => fixture.definition) as never,
    { enabled: true, spacingMs: 0 }
  );
  Object.assign(source, { controller: fixture.controller, refreshDevices: async () => undefined });
  (source as unknown as { attachEvents(controller: unknown): void }).attachEvents(fixture.controller);
  const announce = async () => {
    fixture.handlers.get("deviceAnnounce")?.({ device: fixture.device } as never);
    await (source as unknown as { selfHeal: { whenIdle(): Promise<void> } }).selfHeal.whenIdle();
  };

  Object.assign(source, { pairingState: { permitted: true, time: 180 } });
  await announce();
  assert.deepEqual(fixture.calls, []);

  Object.assign(source, { pairingState: { permitted: false, time: 0 } });
  (source as unknown as { otaUpdates: Set<string> }).otaUpdates.add("0xother");
  await announce();
  assert.deepEqual(fixture.calls, []);

  (source as unknown as { otaUpdates: Set<string> }).otaUpdates.clear();
  fixture.device.scheduledOta = {};
  await announce();
  assert.deepEqual(fixture.calls, []);

  fixture.device.scheduledOta = undefined;
  await writeFile(join(directory, "coordinator_backup.json"), '{"metadata":{}}');
  await writeFile(join(directory, "database.db"), "{}");
  await stageZigbeeNetworkRestore(directory, await createZigbeeNetworkBackup(directory));
  await announce();
  assert.deepEqual(fixture.calls, []);

  Object.assign(source, { controller: null });
  await announce();
  assert.deepEqual(fixture.calls, []);

  // Hiçbir engelli durumda olay akışına da yazılmaz.
  assert.deepEqual(store.getEvents(5), []);
});

test("otomatik onarım ayarı kapalıyken ilan hiçbir şey tetiklemez", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-self-heal-off-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = selfHealFixture();
  const store = new DeviceStore(new Map());
  const source = new DirectZigbeeSource(
    { devices: {}, groups: {}, dataDir: directory } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    false,
    new Map(),
    (async () => fixture.definition) as never,
    { enabled: false, spacingMs: 0 }
  );
  Object.assign(source, { controller: fixture.controller, refreshDevices: async () => undefined });
  (source as unknown as { attachEvents(controller: unknown): void }).attachEvents(fixture.controller);
  const announce = async () => {
    fixture.handlers.get("deviceAnnounce")?.({ device: fixture.device } as never);
    await (source as unknown as { selfHeal: { whenIdle(): Promise<void> } }).selfHeal.whenIdle();
  };

  await announce();
  assert.deepEqual(fixture.calls, []);

  source.setSelfHealingEnabled(true);
  await announce();
  assert.deepEqual(fixture.calls, ["configure"]);
});

/** Faz 2 testleri: yoklama yolu. Sahte koordinatör; gerçek cihaz tetiklenmez. */
function probeSource(
  directory: string,
  fixture: ReturnType<typeof selfHealFixture>,
  store: DeviceStore,
  probeOffline = true
): DirectZigbeeSource {
  const source = new DirectZigbeeSource(
    {
      devices: { [fixture.device.ieeeAddr]: { friendly_name: "Hall Switch" } },
      groups: {},
      dataDir: directory
    } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    false,
    new Map(),
    (async () => fixture.definition) as never,
    { enabled: true, probeOffline, spacingMs: 0 }
  );
  Object.assign(source, { controller: fixture.controller, refreshDevices: async () => undefined });
  return source;
}

async function probeRound(source: DirectZigbeeSource): Promise<void> {
  (source as unknown as { refreshAvailability(): void }).refreshAvailability();
  await (source as unknown as { selfHeal: { whenIdle(): Promise<void> } }).selfHeal.whenIdle();
}

/** Yoklama izleri; erişilebilirlik olayları ayıklanır. */
const selfHealEvents = (store: DeviceStore): string[][] =>
  store.getEvents(10)
    .filter((event) => event.property === "self_heal")
    .map((event) => [event.sourceName, event.property, String(event.value)]);

const availabilityOf = (source: DirectZigbeeSource, id: string): string | undefined =>
  (source as unknown as { deviceAvailability: Map<string, string> }).deviceAvailability.get(id);

test("yoklama yalnız şebeke beslemeli yönlendiriciyi hedefler", () => {
  assert.equal(isSelfHealProbeTarget({ type: "Router" }), true);
  assert.equal(isSelfHealProbeTarget({ type: "Router", powerSource: "Mains (single phase)" }), true);
  assert.equal(isSelfHealProbeTarget({ type: "Router", powerSource: "Battery" }), false);
  assert.equal(isSelfHealProbeTarget({ type: "EndDevice", powerSource: "Battery" }), false);
  assert.equal(isSelfHealProbeTarget({ type: "EndDevice" }), false);
});

test("çevrimdışı yönlendirici tek ucuz okumayla yoklanır ve eksik yapılandırma yazılır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-self-heal-probe-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = selfHealFixture();
  const store = new DeviceStore(new Map());
  const source = probeSource(directory, fixture, store);

  await probeRound(source);

  // Beş saniyelik tek `genBasic` okuması; görüşme yok.
  assert.deepEqual(fixture.calls, ["read:genBasic:zclVersion:5000", "configure"]);
  assert.equal(availabilityOf(source, fixture.device.ieeeAddr), "online");
  assert.deepEqual(selfHealEvents(store), [["Hall Switch", "self_heal", "ok"]]);
});

test("yapılandırma zaten yazılıysa yoklama yalnız erişilebilirliği geri alır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-self-heal-probe-configured-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = selfHealFixture();
  fixture.device.meta = { configured: 1 };
  const store = new DeviceStore(new Map());
  const source = probeSource(directory, fixture, store);

  await probeRound(source);

  assert.deepEqual(fixture.calls, ["read:genBasic:zclVersion:5000"]);
  assert.equal(availabilityOf(source, fixture.device.ieeeAddr), "online");
  assert.deepEqual(selfHealEvents(store), [["Hall Switch", "self_heal", "ok"]]);
});

test("pilli cihaz hiç yoklanmaz", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-self-heal-probe-battery-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = selfHealFixture();
  fixture.device.type = "EndDevice";
  fixture.device.powerSource = "Battery";
  const store = new DeviceStore(new Map());
  const source = probeSource(directory, fixture, store);

  await probeRound(source);

  assert.deepEqual(fixture.calls, []);

  // Şebekeye bağlı görünen ama pille beslenen yönlendirici de yoklanmaz.
  fixture.device.type = "Router";
  await probeRound(source);
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(selfHealEvents(store), []);
});

test("yanıtsız yoklama cihaz olay kaydını doldurmaz", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-self-heal-probe-silent-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = selfHealFixture({
    read: () => {
      throw new Error("cihaz yanıt vermedi");
    }
  });
  const store = new DeviceStore(new Map());
  const source = probeSource(directory, fixture, store);

  await probeRound(source);

  assert.deepEqual(fixture.calls, ["read:genBasic:zclVersion:5000"]);
  assert.equal(availabilityOf(source, fixture.device.ieeeAddr), "offline");
  assert.deepEqual(selfHealEvents(store), []);

  // İkinci tur geri çekilmeye takılır; ikinci deneme yapılmaz.
  await probeRound(source);
  assert.deepEqual(fixture.calls, ["read:genBasic:zclVersion:5000"]);
});

test("çevrimdışı yoklama kapalıyken hiçbir şey yapılmaz", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-self-heal-probe-off-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = selfHealFixture();
  const store = new DeviceStore(new Map());
  const source = probeSource(directory, fixture, store, false);

  await probeRound(source);
  assert.deepEqual(fixture.calls, []);

  source.setSelfHealProbeEnabled(true);
  await probeRound(source);
  assert.deepEqual(fixture.calls, ["read:genBasic:zclVersion:5000", "configure"]);
});

test("ağdan ayrılan cihaz kısa süreli hafızaya yazılır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-departure-leave-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = selfHealFixture();
  const store = new DeviceStore(new Map());
  const source = new DirectZigbeeSource(
    { devices: { [fixture.device.ieeeAddr]: { friendly_name: "Hall Switch" } }, groups: {}, dataDir: directory } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    false,
    new Map(),
    (async () => fixture.definition) as never,
    { enabled: false, spacingMs: 0 }
  );
  Object.assign(source, { controller: fixture.controller, refreshDevices: async () => undefined });
  (source as unknown as { attachEvents(controller: unknown): void }).attachEvents(fixture.controller);

  assert.equal(source.recentDeparture(fixture.device.ieeeAddr), undefined);

  await fixture.handlers.get("deviceLeave")?.({ ieeeAddr: fixture.device.ieeeAddr } as never);

  const departure = source.recentDeparture(fixture.device.ieeeAddr);
  assert.equal(departure?.reason, "left");
  assert.deepEqual(source.recentDepartures().map((entry) => entry.id), [fixture.device.ieeeAddr]);
});

test("silinen cihaz yeniden eşleşme uyarısı için 'kaldırıldı' diye anılır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-departure-remove-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const configurationFile = join(directory, "configuration.yaml");
  await writeFile(configurationFile, "devices:\n  '0x00124b00self':\n    friendly_name: Hall Switch\n", "utf8");
  const fixture = selfHealFixture();
  const removals: string[] = [];
  Object.assign(fixture.device, {
    async removeFromNetwork() {
      removals.push("network");
    },
    removeFromDatabase() {
      removals.push("database");
    }
  });
  const store = new DeviceStore(new Map());
  const source = new DirectZigbeeSource(
    {
      devices: { [fixture.device.ieeeAddr]: { friendly_name: "Hall Switch" } },
      groups: {},
      dataDir: directory,
      configurationFile
    } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    false,
    new Map(),
    (async () => fixture.definition) as never,
    { enabled: false, spacingMs: 0 }
  );
  Object.assign(source, { controller: fixture.controller, refreshDevices: async () => undefined });
  (source as unknown as { attachEvents(controller: unknown): void }).attachEvents(fixture.controller);

  await source.removeDevice(fixture.device.ieeeAddr);

  assert.deepEqual(removals, ["network"]);
  assert.equal(source.recentDeparture(fixture.device.ieeeAddr)?.reason, "removed");

  // Havadan giden "ağdan ayrıl" komutunun gecikmeli yankısı sebebi bozmamalı.
  await fixture.handlers.get("deviceLeave")?.({ ieeeAddr: fixture.device.ieeeAddr } as never);
  assert.equal(source.recentDeparture(fixture.device.ieeeAddr)?.reason, "removed");
});

/** Sinyal yolu testleri için kaynak: sahte koordinatör, canlı donanıma hiç dokunulmaz. */
async function linkQualitySource(context: { after(fn: () => unknown): void }) {
  const directory = await mkdtemp(join(tmpdir(), "villa-linkquality-direct-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = selfHealFixture();
  const store = new DeviceStore(new Map());
  store.ingest("bridge/devices", Buffer.from(JSON.stringify([{
    ieee_address: fixture.device.ieeeAddr,
    friendly_name: "Hall Switch",
    type: "Router",
    supported: true,
    interview_completed: true
  }])));
  const source = new DirectZigbeeSource(
    { devices: { [fixture.device.ieeeAddr]: { friendly_name: "Hall Switch" } }, groups: {}, dataDir: directory } as never,
    { url: "mqtt://127.0.0.1:1883", baseTopic: "zigbee2mqtt" },
    store,
    false,
    new Map(),
    (async () => ({ ...fixture.definition, fromZigbee: [], toZigbee: [] })) as never,
    { enabled: false, spacingMs: 0 }
  );
  Object.assign(source, { controller: fixture.controller, refreshDevices: async () => undefined });
  (source as unknown as { attachEvents(controller: unknown): void }).attachEvents(fixture.controller);
  return { fixture, store, source };
}

const genBasicReport = (device: unknown, linkquality: number) => ({
  device,
  endpoint: { ID: 1 },
  cluster: "genBasic",
  type: "attributeReport",
  data: {},
  linkquality,
  meta: {}
});

test("doğrudan kipte gelen mesajın linkquality'si cihaz görünümüne düşer", async (context) => {
  const { fixture, store } = await linkQualitySource(context);
  const seenAt = Date.UTC(2026, 7, 7, 9, 30, 0);
  fixture.device.lastSeen = seenAt;

  fixture.handlers.get("message")?.(genBasicReport(fixture.device, 148) as never);

  const [device] = store.getDevices();
  assert.equal(device.linkquality, 148);
  // `lastSeen` doğrudan kipte cihaz durumunda hiç bulunmuyordu; aynı mesaj yolundan doluyor.
  assert.equal(device.lastSeen, new Date(seenAt).toISOString());
});

test("sinyal cihaz tanımı çözülmeden önce yakalanır", async (context) => {
  const { fixture, store, source } = await linkQualitySource(context);
  // Desteklenmeyen cihazda `onMessage` tanım bulamayıp döner; sinyal defteri buna rağmen dolar.
  Object.assign(source, { definitions: new Map() });
  fixture.device.lastSeen = Date.UTC(2026, 7, 7, 10, 0, 0);

  fixture.handlers.get("message")?.(genBasicReport(fixture.device, 61) as never);

  assert.equal(store.getDevices()[0]?.linkquality, 61);
});

test("hiç mesaj gelmeyen cihazda sinyal alanı boş kalır", async (context) => {
  const { store } = await linkQualitySource(context);

  const [device] = store.getDevices();
  assert.equal("linkquality" in device, false);
  assert.equal(device.lastSeen, null);
});

test("dakikalık erişilebilirlik taraması son görülmeyi sinyalsiz de tazeler", async (context) => {
  const { fixture, store, source } = await linkQualitySource(context);
  const seenAt = Date.UTC(2026, 7, 7, 11, 15, 0);
  fixture.device.lastSeen = seenAt;

  (source as unknown as { refreshAvailability(): void }).refreshAvailability();

  const [device] = store.getDevices();
  assert.equal(device.lastSeen, new Date(seenAt).toISOString());
  // Tarama sinyal ölçmez: LQI uydurulmaz, alan boş kalır.
  assert.equal("linkquality" in device, false);
});
