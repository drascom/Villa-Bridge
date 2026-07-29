"use strict";

const dgram = require("node:dgram");
const { timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const Aedes = require("aedes");
const mqtt = require("mqtt");
const {
  loadProvisioning,
  matterbridgeReady,
  startMatterbridge,
  startVillaBridgeCore
} = require("./orchestration.cjs");

const runtime = {
  startedAt: new Date().toISOString(),
  mqtt: { listening: false, selfTest: false, error: null },
  core: { status: "unprovisioned", ready: false, error: null },
  matter: { status: "unprovisioned", ready: false, error: null },
  multicast: { available: false, error: null },
  lastProbe: null,
  provisioning: { provisioned: false, reason: "Not checked." }
};

function parseArguments(argv) {
  const values = {};
  for (const argument of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(argument);
    if (match) values[match[1]] = match[2];
  }
  return {
    diagnosticsHost: isLoopbackAddress(values["diagnostics-host"])
      ? values["diagnostics-host"]
      : "127.0.0.1",
    diagnosticsPort: validPort(values["diagnostics-port"] || values.port) || 8092,
    coreHost: "127.0.0.1",
    corePort: 8091,
    mqttHost: values["mqtt-host"] || "127.0.0.1",
    mqttPort: validPort(values["mqtt-port"]) || 1883,
    controlToken: values["control-token"] || "",
    dataDir: values["data-dir"] || path.join(process.cwd(), "data")
  };
}

function validPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function validProbe(input) {
  if (!input || typeof input !== "object") return null;
  const host = typeof input.host === "string" ? input.host.trim() : "";
  const port = validPort(input.port);
  if (!host || host.length > 253 || !/^[a-z0-9._:-]+$/i.test(host) || !port) return null;
  return { host, port };
}

function isLoopbackAddress(address) {
  if (typeof address !== "string") return false;
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  return normalized === "::1" || normalized === "localhost" || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function isLocalRequest(request) {
  return isLoopbackAddress(request?.socket?.remoteAddress);
}

function networkAddresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push({ name, address: entry.address });
    }
  }
  return addresses;
}

function diagnostics(config) {
  const ready =
    runtime.provisioning.provisioned &&
    runtime.mqtt.listening &&
    runtime.mqtt.selfTest &&
    !runtime.mqtt.error &&
    runtime.core.ready &&
    runtime.matter.ready;
  return {
    ok: ready,
    ready,
    mode: runtime.provisioning.provisioned ? "android-standalone" : "android-unprovisioned",
    node: process.versions.node,
    architecture: process.arch,
    platform: process.platform,
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: runtime.startedAt,
    addresses: networkAddresses(),
    provisioning: runtime.provisioning,
    mqtt: runtime.mqtt,
    core: runtime.core,
    matter: runtime.matter,
    multicast: runtime.multicast,
    lastProbe: runtime.lastProbe,
    endpoints: {
      core: `http://${config.coreHost}:${config.corePort}`,
      diagnostics: `http://${config.diagnosticsHost}:${config.diagnosticsPort}`,
      mqtt: `mqtt://${config.mqttHost}:${config.mqttPort}`,
      matterbridge: "ws://127.0.0.1:8283"
    }
  };
}

function probeTcp(input, timeoutMs = 3000) {
  const target = validProbe(input);
  if (!target) return Promise.resolve({ ok: false, error: "A valid host and port are required." });
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection(target);
    let finished = false;
    const done = (result) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      const report = { ...result, host: target.host, port: target.port, latencyMs: Date.now() - started };
      runtime.lastProbe = { ...report, at: new Date().toISOString() };
      resolve(report);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done({ ok: true }));
    socket.once("timeout", () => done({ ok: false, error: "Connection timed out." }));
    socket.once("error", (error) => done({ ok: false, error: error.message }));
  });
}

function probeMulticast(timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let completed = false;
    const done = (result) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // A timeout can occur before bind completes; an unbound UDP socket cannot be closed.
      }
      runtime.multicast = result;
      resolve(result);
    };
    const timer = setTimeout(() => done({ available: false, error: "Multicast probe timed out." }), timeoutMs);
    socket.once("error", (error) => done({ available: false, error: error.message }));
    socket.bind(0, () => {
      if (completed) {
        try {
          socket.close();
        } catch {
          // The socket may already have been closed by an error event.
        }
        return;
      }
      try {
        socket.addMembership("224.0.0.251");
        socket.setMulticastTTL(1);
        done({ available: true, error: null });
      } catch (error) {
        done({ available: false, error: error.message });
      }
    });
  });
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 4096) throw new Error("Request is too large.");
    chunks.push(buffer);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(body || "{}");
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(value));
}

function safeCredentialEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual ?? "");
  const expectedBuffer = Buffer.from(expected ?? "");
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);
}

function startMqttBroker(config) {
  const broker = Aedes();
  const server = net.createServer(broker.handle);
  const authRequired = config.mqttAuthRequired === true;
  runtime.mqtt.authRequired = authRequired;
  if (authRequired) {
    broker.authenticate = (_client, username, password, callback) => {
      const allowed =
        safeCredentialEqual(username, config.mqttUsername) &&
        safeCredentialEqual(password, config.mqttPassword);
      if (allowed) {
        callback(null, true);
        return;
      }
      const error = new Error("Not authorized.");
      error.returnCode = 5;
      callback(error, false);
    };
  }
  let selfTestClient = null;
  let selfTestTimer = null;
  let selfTestFinished = false;
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const finishSelfTest = (result) => {
    if (selfTestFinished) return;
    selfTestFinished = true;
    if (selfTestTimer) clearTimeout(selfTestTimer);
    runtime.mqtt.selfTest = result.ok;
    runtime.mqtt.error = result.error || null;
    if (selfTestClient) selfTestClient.end(true);
    resolveReady(result);
  };

  server.on("error", (error) => {
    runtime.mqtt.listening = false;
    runtime.mqtt.error = error.message;
    finishSelfTest({ ok: false, error: error.message });
    console.error("Embedded MQTT broker error:", error);
  });
  server.on("close", () => {
    runtime.mqtt.listening = false;
  });
  server.listen(config.mqttPort, config.mqttHost, () => {
    runtime.mqtt.listening = true;
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : config.mqttPort;
    const connectHost =
      config.mqttHost === "0.0.0.0" ? "127.0.0.1" :
      config.mqttHost === "::" ? "::1" :
      config.mqttHost;
    const urlHost = connectHost.includes(":") ? `[${connectHost}]` : connectHost;
    const selfTestOptions = {
      clientId: `villa-android-self-test-${process.pid}`,
      reconnectPeriod: 0,
      connectTimeout: 2000,
      protocolVersion: 4
    };
    if (authRequired) {
      selfTestOptions.username = config.mqttUsername;
      selfTestOptions.password = config.mqttPassword;
    }
    selfTestClient = mqtt.connect(`mqtt://${urlHost}:${port}`, selfTestOptions);
    const topic = `_villa/android/self-test/${process.pid}/${Date.now()}`;
    selfTestTimer = setTimeout(() => {
      finishSelfTest({ ok: false, error: "Embedded MQTT self-test timed out." });
    }, 3000);
    selfTestClient.once("connect", () => {
      selfTestClient.subscribe(topic, { qos: 0 }, (subscribeError) => {
        if (subscribeError) {
          finishSelfTest({ ok: false, error: subscribeError.message });
          return;
        }
        selfTestClient.publish(topic, "ready");
      });
    });
    selfTestClient.on("message", (receivedTopic, payload) => {
      if (receivedTopic === topic && payload.toString() === "ready") {
        finishSelfTest({ ok: true, error: null, host: connectHost, port });
      }
    });
    selfTestClient.once("error", (error) => {
      finishSelfTest({ ok: false, error: error.message });
    });
  });

  const close = async () => {
    if (selfTestClient) selfTestClient.end(true);
    if (selfTestTimer) clearTimeout(selfTestTimer);
    await Promise.all([
      new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(resolve);
      }),
      new Promise((resolve) => broker.close(resolve))
    ]);
  };

  return { broker, server, ready, close };
}

function createHttpServer(config, hooks = {}) {
  const dashboard = fs.readFileSync(path.join(__dirname, "dashboard.html"));
  let shutdownRequested = false;
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        });
        response.end(dashboard);
        return;
      }
      if (
        request.method === "GET" &&
        (url.pathname === "/api/health" || url.pathname === "/api/ready")
      ) {
        const report = diagnostics(config);
        sendJson(response, report.ok ? 200 : 503, report);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/android/diagnostics") {
        sendJson(response, 200, diagnostics(config));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/android/runtime/shutdown") {
        const bearer = /^Bearer (.+)$/.exec(request.headers.authorization || "")?.[1] || "";
        if (
          !isLocalRequest(request) ||
          !config.controlToken ||
          !safeCredentialEqual(bearer, config.controlToken)
        ) {
          sendJson(response, 403, { ok: false, error: "Runtime control was denied." });
          return;
        }
        sendJson(response, 202, { ok: true, status: "stopping" });
        if (!shutdownRequested) {
          shutdownRequested = true;
          setImmediate(() => void hooks.shutdown?.());
        }
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/android/probe/tcp") {
        if (!isLocalRequest(request)) {
          sendJson(response, 403, { ok: false, error: "Network probes are restricted to the local app." });
          return;
        }
        sendJson(response, 200, await probeTcp(await readJson(request)));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/android/probe/multicast") {
        if (!isLocalRequest(request)) {
          sendJson(response, 403, { ok: false, error: "Network probes are restricted to the local app." });
          return;
        }
        sendJson(response, 200, await probeMulticast());
        return;
      }
      sendJson(response, 404, { ok: false, error: "Not found." });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error.message });
    }
  });
}

async function start() {
  const config = parseArguments(process.argv.slice(2));
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(config.dataDir, "android-runtime.json"),
    JSON.stringify({ startedAt: runtime.startedAt, node: process.versions.node }, null, 2)
  );

  const provision = loadProvisioning(config);
  runtime.provisioning = {
    provisioned: provision.provisioned,
    reason: provision.reason,
    configPath: provision.sourceConfigPath
      ? path.relative(config.dataDir, provision.sourceConfigPath)
      : null,
    matterEnabled: provision.matterEnabled
  };
  const mqttServer = startMqttBroker({
    ...config,
    mqttAuthRequired: provision.mqttAuthRequired === true,
    mqttUsername: provision.mqttUsername,
    mqttPassword: provision.mqttPassword
  });
  let shutdownRequestedEarly = false;
  const runtimeHooks = {
    shutdown: () => {
      shutdownRequestedEarly = true;
    }
  };
  const httpServer = createHttpServer(config, runtimeHooks);
  httpServer.listen(config.diagnosticsPort, config.diagnosticsHost, () => {
    console.log(
      `Villa Bridge Android diagnostics listening on ${config.diagnosticsHost}:${config.diagnosticsPort}`
    );
  });
  httpServer.on("error", (error) => console.error("HTTP server error:", error));
  const mqttReady = await mqttServer.ready;
  if (mqttReady.ok) {
    console.log(`Embedded MQTT self-test passed on ${mqttReady.host}:${mqttReady.port}`);
  } else {
    console.error("Embedded MQTT self-test failed:", mqttReady.error);
  }
  await probeMulticast();

  let coreService = null;
  let matterService = null;
  let matterMonitor = null;
  if (!provision.provisioned) {
    runtime.core = { status: "unprovisioned", ready: false, error: provision.reason };
    runtime.matter = { status: "unprovisioned", ready: false, error: provision.reason };
    console.warn(`Villa Bridge Android runtime is unprovisioned: ${provision.reason}`);
  } else if (!mqttReady.ok) {
    runtime.core = { status: "blocked", ready: false, error: "Embedded MQTT is unavailable." };
    runtime.matter = { status: "blocked", ready: false, error: "Embedded MQTT is unavailable." };
  } else {
    runtime.core = { status: "starting", ready: false, error: null };
    try {
      coreService = await startVillaBridgeCore(config, provision);
      runtime.core = {
        status: "ready",
        ready: true,
        error: null,
        endpoint: `http://${config.coreHost}:${config.corePort}`
      };
    } catch (error) {
      runtime.core = { status: "failed", ready: false, error: error.message };
      console.error("Villa Bridge direct core failed:", error);
    }

    if (!provision.matterEnabled) {
      runtime.matter = { status: "disabled", ready: true, error: null };
    } else if (!runtime.core.ready) {
      runtime.matter = {
        status: "blocked",
        ready: false,
        error: "Matterbridge waits for the Villa Bridge core."
      };
    } else {
      runtime.matter = { status: "starting", ready: false, error: null };
      try {
        matterService = await startMatterbridge(config, provision);
        const updateMatterState = () => {
          const ready = matterbridgeReady(matterService);
          const plugin = matterService.plugin;
          runtime.matter = {
            status: plugin?.error ? "failed" : ready ? "ready" : "starting",
            ready,
            error: plugin?.error ? "Matterbridge Zigbee2MQTT plugin reported an error." : null,
            plugin: {
              loaded: plugin?.loaded === true,
              started: plugin?.started === true,
              configured: plugin?.configured === true
            },
            commissioningPort: matterService.instance?.serverNode ? 5540 : null
          };
        };
        updateMatterState();
        matterMonitor = setInterval(updateMatterState, 1000);
        matterMonitor.unref();
      } catch (error) {
        runtime.matter = { status: "failed", ready: false, error: error.message };
        console.error("Matterbridge failed:", error);
      }
    }
  }

  let shutdownPromise = null;
  const shutdown = async () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      if (matterMonitor) clearInterval(matterMonitor);
      await Promise.resolve(matterService?.stop?.())
        .catch((error) => console.error("Matter shutdown failed:", error));
      await Promise.resolve(coreService?.stop?.())
        .catch((error) => console.error("Core shutdown failed:", error));
      await mqttServer.close()
        .catch((error) => console.error("MQTT shutdown failed:", error));
      await new Promise((resolve) => {
        if (!httpServer.listening) {
          resolve();
          return;
        }
        httpServer.close(resolve);
      });
      process.exitCode = 0;
    })();
    return shutdownPromise;
  };
  runtimeHooks.shutdown = shutdown;
  if (shutdownRequestedEarly) void shutdown();
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Villa Bridge Android runtime failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  createHttpServer,
  diagnostics,
  isLocalRequest,
  isLoopbackAddress,
  networkAddresses,
  parseArguments,
  probeMulticast,
  probeTcp,
  startMqttBroker,
  runtime,
  validPort,
  validProbe
};
