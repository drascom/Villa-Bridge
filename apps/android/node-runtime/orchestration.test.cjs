"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  appendMatterbridgeArguments,
  buildCoreEnvironment,
  isPathInside,
  loadProvisioning,
  matterbridgeReady,
  startMatterbridge,
  startVillaBridgeCore
} = require("./orchestration.cjs");

function runtimeConfig(dataDir) {
  return {
    dataDir,
    coreHost: "127.0.0.1",
    corePort: 8091,
    mqttHost: "127.0.0.1",
    mqttPort: 1883
  };
}

function provisionedFixture(withCredentials = true) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "villa-android-test-"));
  const configDir = path.join(dataDir, "config");
  const z2mDir = path.join(dataDir, "zigbee2mqtt");
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(z2mDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, "villa-bridge.yaml"),
    [
      "mode: direct",
      "pairingControl: false",
      "zigbee:",
      "  configurationFile: ../zigbee2mqtt/configuration.yaml",
      "mqtt:",
      "  baseTopic: villa-zigbee",
      ""
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(z2mDir, "configuration.yaml"),
    [
      ...(withCredentials ? [
        "mqtt:",
        "  user: home-assistant",
        "  password: test-only-password"
      ] : []),
      "serial:",
      "  port: tcp://192.0.2.10:6638",
      "  adapter: zstack",
      "advanced:",
      "  channel: 15",
      "  pan_id: 1",
      "  ext_pan_id: [1, 2, 3, 4, 5, 6, 7, 8]",
      "  network_key: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]",
      ""
    ].join("\n")
  );
  return { dataDir, config: runtimeConfig(dataDir) };
}

test("missing configuration reports unprovisioned without throwing", (context) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "villa-android-empty-"));
  context.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  const result = loadProvisioning(runtimeConfig(dataDir));

  assert.equal(result.provisioned, false);
  assert.match(result.reason, /Waiting for config[/\\]villa-bridge.yaml/);
});

test("provisioning resolves all mutable paths inside app data", (context) => {
  const fixture = provisionedFixture();
  context.after(() => fs.rmSync(fixture.dataDir, { recursive: true, force: true }));

  const provision = loadProvisioning(fixture.config);
  const resolved = fs.readFileSync(provision.resolvedConfigPath, "utf8");

  assert.equal(provision.provisioned, true);
  assert.equal(provision.baseTopic, "villa-zigbee");
  assert.equal(provision.mqttAuthRequired, true);
  assert.equal(provision.mqttUsername, "home-assistant");
  assert.equal(provision.mqttPassword, "test-only-password");
  assert.match(resolved, /host: 127\.0\.0\.1/);
  assert.match(resolved, /port: 8091/);
  assert.match(resolved, /mqtt:\/\/127\.0\.0\.1:1883/);
  assert.equal(isPathInside(fixture.dataDir, provision.resolvedConfigPath), true);
  assert.equal(isPathInside(fixture.dataDir, path.dirname(fixture.dataDir)), false);
});

test("provisioning rejects configuration paths outside app data", (context) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "villa-android-path-"));
  context.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dataDir, "android-provisioning.json"),
    JSON.stringify({ config: "../private.yaml" })
  );

  const result = loadProvisioning(runtimeConfig(dataDir));

  assert.equal(result.provisioned, false);
  assert.match(result.reason, /must stay inside/);
});

test("embedded core receives loopback-only service configuration", async (context) => {
  const fixture = provisionedFixture();
  context.after(() => fs.rmSync(fixture.dataDir, { recursive: true, force: true }));
  const provision = loadProvisioning(fixture.config);
  let imported = null;
  let stopped = false;

  const service = await startVillaBridgeCore(fixture.config, provision, {
    entrypoint: path.join(fixture.dataDir, "fake-core.js"),
    importModule: async (specifier) => {
      imported = specifier;
      globalThis.__villaBridgeReady = true;
      globalThis.__villaBridgeStop = async () => {
        stopped = true;
        globalThis.__villaBridgeReady = false;
      };
    }
  });

  const environment = buildCoreEnvironment(fixture.config, provision);
  assert.match(imported, /^file:/);
  assert.equal(environment.VILLA_BRIDGE_HOST, "127.0.0.1");
  assert.equal(environment.VILLA_BRIDGE_PORT, "8091");
  assert.equal(environment.VILLA_BRIDGE_NODE_ROLE, "android");
  assert.equal(environment.VILLA_BRIDGE_MQTT_URL, "mqtt://127.0.0.1:1883");
  assert.equal(environment.VILLA_BRIDGE_MQTT_USERNAME, "home-assistant");
  assert.equal(environment.VILLA_BRIDGE_MQTT_PASSWORD, "test-only-password");
  await service.stop();
  assert.equal(stopped, true);
});

test("Matterbridge bootstrap registers the bundled plugin and reaches ready state", async (context) => {
  const fixture = provisionedFixture();
  context.after(() => fs.rmSync(fixture.dataDir, { recursive: true, force: true }));
  const provision = loadProvisioning(fixture.config);
  const plugin = {
    name: "matterbridge-zigbee2mqtt",
    type: "AnyPlatform",
    version: "2.4.7",
    path: "/bundle/matterbridge-zigbee2mqtt/package.json"
  };
  const plugins = new Map();
  let startBridgeCalls = 0;
  const instance = {
    plugins,
    startBridge: async () => {
      startBridgeCalls += 1;
      instance.serverNode = {};
      plugin.loaded = true;
      plugin.started = true;
      plugin.configured = true;
    },
    shutdownProcess: async () => undefined
  };

  const service = await startMatterbridge(fixture.config, provision, {
    pluginPackage: "/bundle/matterbridge-zigbee2mqtt/package.json",
    registerPlugin: async () => {
      plugins.set(plugin.name, plugin);
    },
    loadMatterbridge: async () => ({
      Matterbridge: {
        loadInstance: async () => {
          assert.equal(process.argv.includes("-test"), false);
          assert.equal(startBridgeCalls, 0);
          await instance.startBridge();
          return instance;
        }
      }
    })
  });
  const pluginConfig = JSON.parse(fs.readFileSync(service.pluginConfig, "utf8"));

  assert.equal(pluginConfig.host, "127.0.0.1");
  assert.equal(pluginConfig.port, 1883);
  assert.equal(pluginConfig.topic, "villa-zigbee");
  assert.equal(pluginConfig.protocolVersion, 4);
  assert.equal(pluginConfig.username, "home-assistant");
  assert.equal(pluginConfig.password, "test-only-password");
  assert.equal(startBridgeCalls, 1);
  assert.equal(matterbridgeReady(service), true);
});

test("missing MQTT credentials preserves anonymous loopback clients", (context) => {
  const fixture = provisionedFixture(false);
  context.after(() => fs.rmSync(fixture.dataDir, { recursive: true, force: true }));
  const provision = loadProvisioning({
    ...fixture.config,
    mqttHost: "0.0.0.0"
  });
  const environment = buildCoreEnvironment(fixture.config, provision);

  assert.equal(provision.mqttAuthRequired, false);
  assert.equal(environment.VILLA_BRIDGE_MQTT_URL, "mqtt://127.0.0.1:1883");
  assert.equal(environment.VILLA_BRIDGE_MQTT_USERNAME, "");
  assert.equal(environment.VILLA_BRIDGE_MQTT_PASSWORD, "");
});

test("Matterbridge arguments are deterministic and do not duplicate flags", () => {
  const argv = ["node", "main.cjs"];
  appendMatterbridgeArguments(argv, "/data/matter");
  appendMatterbridgeArguments(argv, "/data/matter");

  assert.equal(argv.filter((value) => value === "-homedir").length, 1);
  assert.equal(argv.includes("-test"), false);
  assert.equal(argv.filter((value) => value === "-frontend").length, 1);
});
