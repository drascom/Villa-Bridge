import Fastify from "fastify";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAccessControl } from "./access-control.js";
import { loadAliases, saveAliases } from "./aliases.js";
import { AuthStore } from "./auth-store.js";
import { loadConfig } from "./config.js";
import { hexToXy } from "./device-controls.js";
import { DeviceImagesStore } from "./device-images.js";
import { DeviceStore } from "./device-store.js";
import { HomeFavoritesStore, validateHomeFavorites } from "./home-favorites.js";
import { InstallationStateStore } from "./installation-state.js";
import { MatterbridgeClient } from "./matterbridge-client.js";
import { MqttShadowSource } from "./mqtt-source.js";
import { getNetworkInfo } from "./network-info.js";
import { isDeviceRemovalConfirmation } from "./removal-confirmation.js";
import { registerRecentErrorApi } from "./recent-error-api.js";
import { RecentErrorLog } from "./recent-error-log.js";
import { SettingsStore } from "./settings-store.js";
import type { ZigbeeSource } from "./source.js";
import type { JsonObject } from "./types.js";

const config = await loadConfig();
const aliases = await loadAliases(config.aliasesFile);
const configPath = resolve(process.env.VILLA_BRIDGE_CONFIG ?? "config/default.yaml");
const imagesStore = new DeviceImagesStore(resolve(dirname(configPath), "device-images.json"));
let imagePreferences = await imagesStore.get();
const store = new DeviceStore(aliases, imagePreferences);
const matterbridge = new MatterbridgeClient(config.matterbridge.wsUrl);
const favoritesStore = new HomeFavoritesStore(resolve(dirname(configPath), "home-favorites.json"));
const installationStateStore = new InstallationStateStore(
  resolve(dirname(configPath), "installation-state.json")
);
const authStore = new AuthStore(resolve(dirname(configPath), "auth.json"));
const settingsStore = config.zigbee?.configurationFile ? new SettingsStore(
  configPath,
  config.zigbee.configurationFile,
  {
    zigbee: { adapterUrl: config.zigbee.serial.path },
    mqtt: { url: config.mqtt.url, baseTopic: config.mqtt.baseTopic },
    matter: { wsUrl: config.matterbridge.wsUrl },
    homeAssistant: { discoveryEnabled: config.homeAssistant.discoveryEnabled },
    debug: { enabled: config.debug.enabled }
  }
) : null;
const recentErrors = new RecentErrorLog(50, config.debug.enabled);
store.setMode(config.mode);
let source: ZigbeeSource;
if (config.mode === "direct") {
  if (!config.zigbee) throw new Error("Doğrudan Zigbee ayarları bulunamadı.");
  const { DirectZigbeeSource } = await import("./direct-zigbee-source.js");
  source = new DirectZigbeeSource(
    config.zigbee,
    config.mqtt,
    store,
    config.homeAssistant.discoveryEnabled,
    aliases
  );
} else {
  source = new MqttShadowSource(config.mqtt, store);
}
const app = Fastify({ logger: true });
await registerAccessControl(app, authStore, {
  secureCookies: process.env.VILLA_BRIDGE_SECURE_COOKIES === "true"
});
registerRecentErrorApi(app, recentErrors);
const moduleDir = dirname(fileURLToPath(import.meta.url));
const dashboard = await readFile(resolve(moduleDir, "../public/index.html"), "utf8");
const dashboardBackground = await readFile(resolve(moduleDir, "../public/assets/dashboard-landscape.jpg"));
const localesDirectory = resolve(moduleDir, "../public/locales");

app.get("/assets/dashboard-landscape.jpg", async (_request, reply) => reply
  .header("Cache-Control", "public, max-age=31536000, immutable")
  .type("image/jpeg")
  .send(dashboardBackground));

app.get("/api/locales", async (_request, reply) => {
  try {
    const files = (await readdir(localesDirectory))
      .filter((file) => /^[a-z]{2}(?:-[A-Z]{2})?\.json$/.test(file))
      .sort((left, right) => left.localeCompare(right, "en"));
    const locales = await Promise.all(files.map(async (file) => {
      const parsed = JSON.parse(await readFile(resolve(localesDirectory, file), "utf8")) as {
        code?: unknown;
        name?: unknown;
        translations?: unknown;
      };
      if (
        typeof parsed.code !== "string"
        || typeof parsed.name !== "string"
        || typeof parsed.translations !== "object"
        || parsed.translations === null
        || Array.isArray(parsed.translations)
        || parsed.code !== file.slice(0, -".json".length)
        || !Object.values(parsed.translations).every((value) => typeof value === "string")
      ) {
        throw new Error(`Geçersiz dil paketi: ${file}`);
      }
      return parsed;
    }));
    return { defaultLanguage: "en", locales };
  } catch (error) {
    return reply.code(503).send({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/health", async () => store.getHealth());
app.get("/api/devices", async () => ({ devices: store.getDevices() }));
app.get("/api/groups", async () => ({ groups: store.getGroups() }));
app.get("/api/pairing", async () => store.getPairing());
app.post<{ Body?: { seconds?: number } }>("/api/pairing/start", async (request, reply) => {
  if (!config.pairingControl) {
    return reply.code(403).send({ ok: false, error: "Cihaz ekleme denetimi kapalı." });
  }
  const requested = request.body?.seconds ?? 180;
  const seconds = Number.isInteger(requested) ? Math.min(254, Math.max(10, requested)) : 180;
  store.pairingRequested(seconds);
  try {
    await source.permitJoin(seconds);
    return { ok: true, pairing: store.getPairing() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.pairingRequestFailed(message);
    return reply.code(503).send({ ok: false, error: message });
  }
});
app.post("/api/pairing/stop", async (_request, reply) => {
  if (!config.pairingControl) {
    return reply.code(403).send({ ok: false, error: "Cihaz ekleme denetimi kapalı." });
  }
  try {
    await source.permitJoin(0);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.pairingRequestFailed(message);
    return reply.code(503).send({ ok: false, error: message });
  }
});
app.get("/api/overview", async () => ({
  health: store.getHealth(),
  devices: store.getDevices(),
  groups: store.getGroups(),
  pairing: store.getPairing()
}));

app.get("/api/onboarding", async (_request, reply) => {
  try {
    return { ok: true, installation: await installationStateStore.get() };
  } catch (error) {
    return reply.code(503).send({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.put<{ Body?: { completed?: unknown } }>("/api/onboarding", async (request, reply) => {
  if (request.body?.completed !== true) {
    return reply.code(400).send({ ok: false, error: "Onboarding tamamlanma durumu geçersiz." });
  }
  try {
    return {
      ok: true,
      installation: await installationStateStore.completeOnboarding()
    };
  } catch (error) {
    return reply.code(503).send({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/favorites", async (_request, reply) => {
  try {
    return { ok: true, favorites: await favoritesStore.get() };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.put<{ Body?: { favorites?: unknown } }>("/api/favorites", async (request, reply) => {
  try {
    const favorites = validateHomeFavorites(request.body?.favorites);
    const devices = store.getDevices();
    for (const favorite of favorites) {
      const device = devices.find((item) => item.id === favorite.deviceId);
      const control = device?.controls.find((item) => item.id === favorite.controlId && item.kind === "switch");
      if (!device || !control) return reply.code(400).send({ ok: false, error: "Favori cihaz veya anahtar bulunamadı." });
    }
    return { ok: true, favorites: await favoritesStore.save(favorites) };
  } catch (error) {
    return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.put<{
  Params: { id: string };
  Body?: { imageModel?: unknown; applyToModel?: unknown };
}>("/api/devices/:id/image", async (request, reply) => {
  const id = request.params.id.toLowerCase();
  const device = store.getDevice(id);
  if (!device) return reply.code(404).send({ ok: false, error: "Cihaz bulunamadı." });
  const imageModel = request.body?.imageModel;
  if (imageModel !== null && typeof imageModel !== "string") {
    return reply.code(400).send({ ok: false, error: "Görsel seçimi geçersiz." });
  }
  if (
    typeof imageModel === "string"
    && !device.image.candidates.some((candidate) => candidate.model === imageModel)
  ) {
    return reply.code(400).send({ ok: false, error: "Bu görsel cihaz için sunulan adaylar arasında değil." });
  }
  try {
    imagePreferences = await imagesStore.select(
      imagePreferences,
      id,
      device.image.preferenceKey,
      imageModel,
      request.body?.applyToModel === true
    );
    store.setImagePreferences(imagePreferences);
    return { ok: true, device: store.getDevice(id) };
  } catch (error) {
    return reply.code(503).send({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post<{
  Params: { id: string };
  Body?: { property?: string; value?: unknown };
}>("/api/devices/:id/command", async (request, reply) => {
  const id = request.params.id.toLowerCase();
  const device = store.getDevice(id);
  if (!device) return reply.code(404).send({ ok: false, error: "Cihaz bulunamadı." });
  const control = device.controls.find((item) => item.property === request.body?.property);
  if (!control) return reply.code(400).send({ ok: false, error: "Bu denetim cihaz tarafından sunulmuyor." });
  let value: unknown = request.body?.value;
  if (control.kind === "switch") {
    if (typeof value !== "boolean") return reply.code(400).send({ ok: false, error: "Aç/kapat değeri geçersiz." });
    value = value ? "ON" : "OFF";
  } else if (control.kind === "color") {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
      return reply.code(400).send({ ok: false, error: "Renk değeri geçersiz." });
    }
    value = hexToXy(value);
  } else {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return reply.code(400).send({ ok: false, error: "Sayısal denetim değeri geçersiz." });
    }
    value = Math.round(Math.min(control.max ?? value, Math.max(control.min ?? value, value)));
  }
  try {
    await source.setDevice(id, { [control.property]: value } satisfies JsonObject);
    return { ok: true };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.put<{
  Params: { id: string };
  Body?: { name?: string; channel?: string };
}>("/api/devices/:id/name", async (request, reply) => {
  const id = request.params.id.toLowerCase();
  const device = store.getDevice(id);
  if (!device) return reply.code(404).send({ ok: false, error: "Cihaz bulunamadı." });
  const name = request.body?.name?.trim() ?? "";
  if (name.length < 2 || Buffer.byteLength(name, "utf8") > 32) {
    return reply.code(400).send({ ok: false, error: "İsim 2–32 bayt arasında olmalı." });
  }
  const channel = request.body?.channel?.trim().toLowerCase();
  if (channel && !device.controls.some((control) => control.id === channel || control.id.startsWith(`${channel}:`))) {
    return reply.code(400).send({ ok: false, error: "Kanal bulunamadı." });
  }
  const aliasKey = channel ? `${id}:${channel}` : id;
  const previousAlias = aliases.get(aliasKey);
  aliases.set(aliasKey, name);
  try {
    await saveAliases(config.aliasesFile, aliases);
    if (!channel) await source.renameDevice(id, name);
    return { ok: true, id, channel: channel ?? null, name, matterSyncRequired: true };
  } catch (error) {
    if (previousAlias === undefined) aliases.delete(aliasKey);
    else aliases.set(aliasKey, previousAlias);
    await saveAliases(config.aliasesFile, aliases).catch(() => undefined);
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete<{
  Params: { id: string };
  Body?: { confirmation?: string; force?: boolean };
}>("/api/devices/:id", async (request, reply) => {
  const id = request.params.id.toLowerCase();
  const device = store.getDevice(id);
  if (!device) return reply.code(404).send({ ok: false, error: "Cihaz bulunamadı." });
  if (!isDeviceRemovalConfirmation(request.body?.confirmation)) {
    return reply.code(400).send({ ok: false, error: "Silmek için küçük harflerle yes veya evet yazın." });
  }
  try {
    const force = request.body?.force === true;
    await source.removeDevice(id, force);
    for (const key of [...aliases.keys()]) {
      if (key === id || key.startsWith(`${id}:`)) aliases.delete(key);
    }
    await saveAliases(config.aliasesFile, aliases);
    imagePreferences = await imagesStore.removeDevice(imagePreferences, id).catch(() => imagePreferences);
    store.setImagePreferences(imagePreferences);
    const favorites = await favoritesStore.removeDevice(id);
    return { ok: true, force, favorites };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/matter", async (_request, reply) => {
  try {
    return await matterbridge.getStatus();
  } catch (error) {
    return reply.code(503).send({ online: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/settings", async (_request, reply) => {
  if (!settingsStore) return reply.code(503).send({ ok: false, error: "Bağlantı ayarları bu çalışma modunda kullanılamıyor." });
  try {
    const authenticationRequired =
      typeof config.mqtt.username === "string"
      && config.mqtt.username.length > 0
      && typeof config.mqtt.password === "string";
    return {
      ok: true,
      settings: await settingsStore.get(),
      network: getNetworkInfo(),
      mqttAccess: {
        protocol: "3.1.1",
        authenticationRequired,
        username: authenticationRequired ? config.mqtt.username : null,
        password: authenticationRequired ? config.mqtt.password : null
      }
    };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.put<{ Body?: unknown }>("/api/settings", async (request, reply) => {
  if (!settingsStore) return reply.code(503).send({ ok: false, error: "Bağlantı ayarları bu çalışma modunda kullanılamıyor." });
  try {
    const settings = await settingsStore.save(request.body);
    recentErrors.setEnabled(settings.debug.enabled);
    return { ok: true, settings, restartRequired: true };
  } catch (error) {
    return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.put<{ Body?: { enabled?: unknown } }>("/api/home-assistant/discovery", async (request, reply) => {
  if (!settingsStore) {
    return reply.code(503).send({ ok: false, error: "Home Assistant keşif ayarı bu çalışma modunda kullanılamıyor." });
  }
  if (typeof request.body?.enabled !== "boolean") {
    return reply.code(400).send({ ok: false, error: "Home Assistant keşif durumu geçersiz." });
  }
  try {
    const current = await settingsStore.get();
    const settings = await settingsStore.save({
      ...current,
      homeAssistant: { discoveryEnabled: request.body.enabled }
    });
    await source.setHomeAssistantDiscovery(request.body.enabled);
    config.homeAssistant.discoveryEnabled = request.body.enabled;
    return { ok: true, settings, restartRequired: false };
  } catch (error) {
    return reply.code(503).send({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post<{ Body?: { confirmation?: string } }>("/api/settings/apply", async (request, reply) => {
  if (request.body?.confirmation !== "APPLY") {
    return reply.code(400).send({ ok: false, error: "Yeniden başlatma onayı geçersiz." });
  }
  const timer = setTimeout(() => process.kill(process.pid, "SIGTERM"), 750);
  timer.unref();
  return { ok: true, restarting: true };
});

app.post<{ Body?: { open?: boolean } }>("/api/matter/commissioning", async (request, reply) => {
  if (typeof request.body?.open !== "boolean") {
    return reply.code(400).send({ ok: false, error: "Bağlantı durumu belirtilmedi." });
  }
  try {
    return { ok: true, matter: await matterbridge.setCommissioning(request.body.open) };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(dashboard));

type EmbeddedVillaBridgeGlobal = typeof globalThis & {
  __villaBridgeReady?: boolean;
  __villaBridgeStop?: () => Promise<void>;
};

const embeddedRuntime = process.env.VILLA_BRIDGE_EMBEDDED === "true";
const embeddedGlobal = globalThis as EmbeddedVillaBridgeGlobal;
const shutdown = async (): Promise<void> => {
  if (!embeddedGlobal.__villaBridgeReady) return;
  embeddedGlobal.__villaBridgeReady = false;
  await source.stop();
  await app.close();
  if (!embeddedRuntime) process.exit(0);
};
embeddedGlobal.__villaBridgeStop = shutdown;
if (!embeddedRuntime) {
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

await source.start();
await app.listen({ host: config.http.host, port: config.http.port });
embeddedGlobal.__villaBridgeReady = true;
console.log(`Villa Bridge paneli ${config.http.host}:${config.http.port} adresinde hazır.`);
