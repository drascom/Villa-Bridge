import assert from "node:assert/strict";
import { createSocket } from "node:dgram";
import test from "node:test";
import {
  createVillaBridgeDiscoveryRecord,
  resolveVillaBridgeNodeRole,
  startLanDiscoveryResponder,
  villaBridgeDiscoveryProtocol,
  villaBridgeDiscoveryQuery,
  villaBridgeDiscoveryVersion
} from "./lan-discovery.js";

const queryResponder = (port: number, query: string): Promise<unknown> =>
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
      resolve(JSON.parse(message.toString("utf8")));
    });
    client.send(Buffer.from(query), port, "127.0.0.1");
  });

test("LAN discovery responder identifies only a Villa Bridge server", async (context) => {
  const record = createVillaBridgeDiscoveryRecord("server", "direct", 8091);
  const responder = await startLanDiscoveryResponder(record, 0);
  assert.ok(responder);
  context.after(() => responder.close());

  assert.deepEqual(await queryResponder(responder.port, villaBridgeDiscoveryQuery), {
    protocol: villaBridgeDiscoveryProtocol,
    version: villaBridgeDiscoveryVersion,
    role: "server",
    mode: "direct",
    dashboardPort: 8091
  });
});

test("non-server roles do not advertise as a primary host", async () => {
  const record = createVillaBridgeDiscoveryRecord("android", "direct", 8091);
  assert.equal(await startLanDiscoveryResponder(record, 0), null);
  assert.equal(resolveVillaBridgeNodeRole("disabled"), "disabled");
  assert.equal(resolveVillaBridgeNodeRole("server"), "server");
});
