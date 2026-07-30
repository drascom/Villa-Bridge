"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const mqtt = require("mqtt");
const test = require("node:test");
const {
  createHttpServer,
  diagnostics,
  isLocalRequest,
  isLoopbackAddress,
  parseArguments,
  probeMulticast,
  probeTcp,
  runtime,
  startMqttBroker,
  validBindAddress,
  validPort,
  validProbe
} = require("./main.cjs");

function getJson(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: pathname }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
      }));
    }).once("error", reject);
  });
}

function postJson(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: pathname,
      method: "POST",
      headers
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
      }));
    });
    request.once("error", reject);
    request.end();
  });
}

test("shared runtime arguments use safe defaults", () => {
  assert.deepEqual(parseArguments([]), {
    platform: "android",
    diagnosticsHost: "127.0.0.1",
    diagnosticsPort: 8092,
    coreHost: "127.0.0.1",
    corePort: 8091,
    coreEntrypoint: null,
    mqttHost: "127.0.0.1",
    mqttPort: 1883,
    controlToken: "",
    dataDir: require("node:path").join(process.cwd(), "data")
  });
  assert.equal(
    parseArguments(["--host=0.0.0.0", "--diagnostics-host=0.0.0.0"]).diagnosticsHost,
    "127.0.0.1"
  );
  assert.equal(parseArguments(["--mqtt-host=0.0.0.0"]).mqttHost, "0.0.0.0");
  assert.equal(parseArguments(["--core-host=0.0.0.0"]).coreHost, "0.0.0.0");
  assert.equal(parseArguments(["--core-host=192.168.0.61"]).coreHost, "127.0.0.1");
  assert.equal(parseArguments(["--platform=linux"]).platform, "linux");
  assert.equal(parseArguments(["--platform=unknown"]).platform, "android");
  assert.equal(parseArguments(["--control-token=secret-token"]).controlToken, "secret-token");
});

test("standalone runtime validates bind addresses and TCP probe targets", () => {
  assert.equal(validBindAddress("0.0.0.0"), "0.0.0.0");
  assert.equal(validBindAddress("127.0.0.1"), "127.0.0.1");
  assert.equal(validBindAddress("192.168.0.61"), null);
  assert.deepEqual(validProbe({ host: "192.168.0.248", port: 6638 }), {
    host: "192.168.0.248",
    port: 6638
  });
  assert.equal(validProbe({ host: "bad host", port: 6638 }), null);
  assert.equal(validPort(70000), null);
});

test("Android runtime recognizes only loopback probe callers", () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("192.168.0.20"), false);
  assert.equal(isLocalRequest({ socket: { remoteAddress: "127.0.0.1" } }), true);
  assert.equal(isLocalRequest({ socket: { remoteAddress: "192.168.0.20" } }), false);
});

test("TCP probe opens and closes a connection without sending data", async (context) => {
  let bytesReceived = 0;
  const server = net.createServer((socket) => {
    socket.on("data", (chunk) => {
      bytesReceived += chunk.length;
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  assert.equal(typeof address, "object");
  const result = await probeTcp({ host: "127.0.0.1", port: address.port }, 500);

  assert.equal(result.ok, true);
  assert.equal(bytesReceived, 0);
});

test("multicast capability probe always settles safely", async () => {
  const result = await probeMulticast(250);
  assert.equal(typeof result.available, "boolean");
  assert.ok(result.error === null || typeof result.error === "string");

  const immediateResult = await probeMulticast(0);
  assert.equal(typeof immediateResult.available, "boolean");
});

test("embedded MQTT broker passes a publish and subscribe self-test", async (context) => {
  const service = startMqttBroker({
    mqttHost: "127.0.0.1",
    mqttPort: 0
  });
  context.after(() => service.close());

  const result = await service.ready;
  assert.deepEqual(result.error, null);
  assert.equal(result.ok, true);
  assert.equal(result.host, "127.0.0.1");
  assert.ok(result.port > 0);
  assert.equal(diagnostics({
    diagnosticsHost: "127.0.0.1",
    diagnosticsPort: 8092,
    coreHost: "127.0.0.1",
    corePort: 8091,
    mqttHost: "127.0.0.1",
    mqttPort: result.port
  }).ok, false);
});

test("provisioned MQTT credentials are enforced and never exposed", async (context) => {
  const username = "home-assistant";
  const password = "test-only-password";
  const service = startMqttBroker({
    mqttHost: "0.0.0.0",
    mqttPort: 0,
    mqttAuthRequired: true,
    mqttUsername: username,
    mqttPassword: password
  });
  context.after(() => service.close());
  const result = await service.ready;
  assert.equal(result.ok, true);
  assert.equal(result.host, "127.0.0.1");

  const connect = (options) => new Promise((resolve) => {
    const client = mqtt.connect(`mqtt://127.0.0.1:${result.port}`, {
      protocolVersion: 4,
      reconnectPeriod: 0,
      connectTimeout: 500,
      ...options
    });
    client.once("connect", () => {
      client.end(true);
      resolve(true);
    });
    client.once("error", () => {
      client.end(true);
      resolve(false);
    });
  });

  assert.equal(await connect({}), false);
  assert.equal(await connect({ username, password: "wrong" }), false);
  assert.equal(await connect({ username, password }), true);
  assert.equal(runtime.mqtt.authRequired, true);
  const report = JSON.stringify(diagnostics({
    diagnosticsHost: "127.0.0.1",
    diagnosticsPort: 8092,
    coreHost: "127.0.0.1",
    corePort: 8091,
    mqttHost: "0.0.0.0",
    mqttPort: result.port
  }));
  assert.equal(report.includes(username), false);
  assert.equal(report.includes(password), false);
});

test("readiness endpoint distinguishes unprovisioned and fully ready states", async (context) => {
  const config = {
    diagnosticsHost: "127.0.0.1",
    diagnosticsPort: 0,
    coreHost: "127.0.0.1",
    corePort: 8091,
    mqttHost: "127.0.0.1",
    mqttPort: 1883
  };
  const previous = {
    provisioning: runtime.provisioning,
    mqtt: runtime.mqtt,
    core: runtime.core,
    matter: runtime.matter
  };
  context.after(() => Object.assign(runtime, previous));
  const server = createHttpServer(config);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();

  runtime.provisioning = { provisioned: false, reason: "Waiting for config." };
  runtime.mqtt = { listening: true, selfTest: true, error: null };
  runtime.core = { status: "unprovisioned", ready: false, error: "Waiting for config." };
  runtime.matter = { status: "unprovisioned", ready: false, error: "Waiting for config." };
  const waiting = await getJson(address.port, "/api/ready");
  assert.equal(waiting.status, 503);
  assert.equal(waiting.body.mode, "android-unprovisioned");

  runtime.provisioning = { provisioned: true, reason: null };
  runtime.core = { status: "ready", ready: true, error: null };
  runtime.matter = { status: "ready", ready: true, error: null };
  const ready = await getJson(address.port, "/api/ready");
  assert.equal(ready.status, 200);
  assert.equal(ready.body.ready, true);
});

test("runtime shutdown requires the local bearer token and runs only once", async (context) => {
  const config = {
    diagnosticsHost: "127.0.0.1",
    diagnosticsPort: 0,
    coreHost: "127.0.0.1",
    corePort: 8091,
    mqttHost: "127.0.0.1",
    mqttPort: 1883,
    controlToken: "test-runtime-token"
  };
  let shutdownCalls = 0;
  const server = createHttpServer(config, {
    shutdown: () => {
      shutdownCalls += 1;
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();

  const missing = await postJson(address.port, "/api/android/runtime/shutdown");
  assert.equal(missing.status, 403);
  const wrong = await postJson(address.port, "/api/android/runtime/shutdown", {
    authorization: "Bearer wrong-token"
  });
  assert.equal(wrong.status, 403);

  const accepted = await postJson(address.port, "/api/android/runtime/shutdown", {
    authorization: "Bearer test-runtime-token"
  });
  assert.equal(accepted.status, 202);
  assert.equal(accepted.body.status, "stopping");
  await new Promise((resolve) => setImmediate(resolve));

  const repeated = await postJson(address.port, "/api/android/runtime/shutdown", {
    authorization: "Bearer test-runtime-token"
  });
  assert.equal(repeated.status, 202);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(shutdownCalls, 1);
});
