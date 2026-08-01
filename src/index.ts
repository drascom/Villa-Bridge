import Fastify from "fastify";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAccessControl } from "./access-control.js";
import { loadAliases, saveAliases } from "./aliases.js";
import { AuthStore } from "./auth-store.js";
import { loadConfig } from "./config.js";
import { hexToXy } from "./device-controls.js";
import { DeviceImageCache } from "./device-image-cache.js";
import { DeviceImagesStore } from "./device-images.js";
import { DeviceEventsStore } from "./device-events.js";
import { DeviceNotesStore } from "./device-notes.js";
import { DeviceStore } from "./device-store.js";
import {
  HomeFavoritesStore,
  isHomeFavoriteControlKind,
  validateHomeFavorites
} from "./home-favorites.js";
import { InstallationStateStore } from "./installation-state.js";
import {
  createVillaBridgeDiscoveryRecord,
  resolveVillaBridgeNodeRole,
  startLanDiscoveryResponder,
  villaBridgeDiscoveryPort
} from "./lan-discovery.js";
import { MatterbridgeClient } from "./matterbridge-client.js";
import { MqttShadowSource } from "./mqtt-source.js";
import { getNetworkInfo } from "./network-info.js";
import { isDeviceRemovalConfirmation } from "./removal-confirmation.js";
import { registerRecentErrorApi } from "./recent-error-api.js";
import { RecentErrorLog } from "./recent-error-log.js";
import { SettingsStore } from "./settings-store.js";
import type { ZigbeeSource } from "./source.js";
import type { JsonObject } from "./types.js";
import {
  applyPendingZigbeeNetworkRestore,
  createZigbeeNetworkBackup,
  stageZigbeeNetworkRestore
} from "./zigbee-backup.js";

const config = await loadConfig();
if (config.zigbee && await applyPendingZigbeeNetworkRestore(config.zigbee.dataDir)) {
  console.log("Doğrulanmış Zigbee ağ yedeği geri yüklendi.");
}
const aliases = await loadAliases(config.aliasesFile);
const configPath = resolve(process.env.VILLA_BRIDGE_CONFIG ?? "config/default.yaml");
const imagesStore = new DeviceImagesStore(resolve(dirname(configPath), "device-images.json"));
const imageCache = new DeviceImageCache(resolve(dirname(configPath), "device-image-cache"));
let imagePreferences = await imagesStore.get();
const deviceEventsStore = new DeviceEventsStore(resolve(dirname(configPath), "device-events.json"));
const store = new DeviceStore(
  aliases,
  imagePreferences,
  await deviceEventsStore.get(),
  (events) => void deviceEventsStore.save(events).catch((error) => {
    console.error(`Cihaz olay geçmişi kaydedilemedi: ${String(error)}`);
  })
);
store.setLowBatteryThreshold(config.alerts.lowBatteryThreshold);
const matterbridge = new MatterbridgeClient(config.matterbridge.wsUrl);
const favoritesStore = new HomeFavoritesStore(resolve(dirname(configPath), "home-favorites.json"));
const deviceNotesStore = new DeviceNotesStore(resolve(dirname(configPath), "device-notes.json"));
const installationStateStore = new InstallationStateStore(
  resolve(dirname(configPath), "installation-state.json")
);
const authStore = new AuthStore(resolve(dirname(configPath), "auth.json"));
const settingsStore = config.zigbee?.configurationFile ? new SettingsStore(
  configPath,
  config.zigbee.configurationFile,
  {
    zigbee: { adapterUrl: config.zigbee.serial.path, channel: config.zigbee.network.channel },
    mqtt: { url: config.mqtt.url, baseTopic: config.mqtt.baseTopic },
    matter: { wsUrl: config.matterbridge.wsUrl },
    homeAssistant: { discoveryEnabled: config.homeAssistant.discoveryEnabled },
    alerts: { lowBatteryThreshold: config.alerts.lowBatteryThreshold },
    debug: { enabled: config.debug.enabled }
  }
) : null;
const recentErrors = new RecentErrorLog(50, config.debug.enabled);
const nodeRole = resolveVillaBridgeNodeRole();
const discoveryRecord = createVillaBridgeDiscoveryRecord(
  nodeRole,
  config.mode,
  config.http.port
);
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
const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });
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
app.get("/api/discovery", async () => discoveryRecord);
const visibleDevices = (role: "admin" | "resident" | undefined) => store.getDevices().map((device) => ({
  ...device,
  controls: role === "resident"
    ? device.controls.filter((control) => control.adminOnly !== true)
    : device.controls
}));

app.get("/api/devices", async (request) => ({
  devices: visibleDevices(request.villaSession?.role)
}));
app.get<{ Params: { id: string } }>("/api/devices/:id/note", async (request, reply) => {
  const id = request.params.id.toLowerCase();
  if (!store.getDevice(id)) return reply.code(404).send({ ok: false, error: "Cihaz bulunamadı." });
  return { ok: true, note: await deviceNotesStore.get(id) };
});
app.put<{ Params: { id: string }; Body?: { note?: unknown } }>("/api/devices/:id/note", async (request, reply) => {
  const id = request.params.id.toLowerCase();
  if (!store.getDevice(id)) return reply.code(404).send({ ok: false, error: "Cihaz bulunamadı." });
  try {
    return { ok: true, note: await deviceNotesStore.set(id, request.body?.note) };
  } catch (error) {
    return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.get<{ Params: { model: string } }>("/api/device-image/:model", async (request, reply) => {
  const image = await imageCache.get(request.params.model);
  if (!image) {
    return reply.code(404).send({ ok: false, code: "DEVICE_IMAGE_NOT_FOUND" });
  }
  return reply
    .header("Cache-Control", "public, max-age=604800, immutable")
    .type(image.contentType)
    .send(image.body);
});
app.get("/api/groups", async () => ({ groups: store.getGroups() }));
app.post<{ Body?: { name?: unknown } }>("/api/groups", async (request, reply) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  if (name.length < 2 || name.length > 64) {
    return reply.code(400).send({ ok: false, error: "Grup adı 2-64 karakter olmalıdır." });
  }
  try {
    await source.createGroup(name);
    return { ok: true, groups: store.getGroups() };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.put<{ Params: { id: string }; Body?: { name?: unknown } }>("/api/groups/:id", async (request, reply) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  if (name.length < 2 || name.length > 64) {
    return reply.code(400).send({ ok: false, error: "Grup adı 2-64 karakter olmalıdır." });
  }
  try {
    await source.renameGroup(request.params.id, name);
    return { ok: true, groups: store.getGroups() };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.delete<{ Params: { id: string }; Querystring: { force?: string } }>("/api/groups/:id", async (request, reply) => {
  try {
    await source.removeGroup(request.params.id, request.query.force === "true");
    return { ok: true, groups: store.getGroups() };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.put<{
  Params: { id: string };
  Body?: { deviceId?: unknown; add?: unknown; endpoint?: unknown };
}>("/api/groups/:id/member", async (request, reply) => {
  const deviceId = typeof request.body?.deviceId === "string" ? request.body.deviceId.toLowerCase() : "";
  const endpoint = request.body?.endpoint;
  if (
    !/^0x[0-9a-f]{16}$/.test(deviceId) ||
    typeof request.body?.add !== "boolean" ||
    (endpoint !== undefined && (!Number.isInteger(endpoint) || Number(endpoint) < 1 || Number(endpoint) > 240))
  ) {
    return reply.code(400).send({ ok: false, error: "Grup üyeliği isteği geçersiz." });
  }
  try {
    await source.setGroupMember(request.params.id, deviceId, request.body.add, endpoint === undefined ? undefined : Number(endpoint));
    return { ok: true, groups: store.getGroups() };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.post<{
  Params: { id: string };
  Body?: { property?: unknown; value?: unknown };
}>("/api/groups/:id/command", async (request, reply) => {
  if (
    request.body?.property !== "state"
    || typeof request.body.value !== "boolean"
  ) {
    return reply.code(400).send({ ok: false, error: "Grup aç/kapat komutu geçersiz." });
  }
  try {
    await source.setGroup(request.params.id, {
      state: request.body.value ? "ON" : "OFF"
    });
    return { ok: true };
  } catch (error) {
    return reply.code(503).send({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
app.post<{
  Body?: {
    fromId?: unknown;
    toId?: unknown;
    bind?: unknown;
    clusters?: unknown;
    fromEndpoint?: unknown;
    toEndpoint?: unknown;
  };
}>("/api/zigbee/bind", async (request, reply) => {
  const fromId = typeof request.body?.fromId === "string" ? request.body.fromId.toLowerCase() : "";
  const toId = typeof request.body?.toId === "string" ? request.body.toId.toLowerCase() : "";
  const clusters = Array.isArray(request.body?.clusters)
    ? request.body.clusters.filter((value): value is string => typeof value === "string").slice(0, 32)
    : undefined;
  const fromEndpoint = request.body?.fromEndpoint;
  const toEndpoint = request.body?.toEndpoint;
  const validEndpoint = (value: unknown): boolean =>
    value === undefined || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 240);
  if (
    !/^0x[0-9a-f]{16}$/.test(fromId)
    || !toId
    || typeof request.body?.bind !== "boolean"
    || !validEndpoint(fromEndpoint)
    || !validEndpoint(toEndpoint)
  ) {
    return reply.code(400).send({ ok: false, error: "Bağlama isteği geçersiz." });
  }
  try {
    await source.bindDevice(
      fromId,
      toId,
      request.body.bind,
      clusters,
      fromEndpoint === undefined ? undefined : Number(fromEndpoint),
      toEndpoint === undefined ? undefined : Number(toEndpoint)
    );
    return { ok: true, devices: visibleDevices(request.villaSession?.role) };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.post<{
  Params: { id: string };
  Body?: { sceneId?: unknown; action?: unknown; name?: unknown };
}>("/api/groups/:id/scene", async (request, reply) => {
  const sceneId = Number(request.body?.sceneId);
  const action = request.body?.action;
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : undefined;
  if (
    !Number.isInteger(sceneId)
    || sceneId < 1
    || sceneId > 255
    || !["store", "recall", "remove"].includes(String(action))
    || (name !== undefined && (name.length < 1 || name.length > 64))
  ) {
    return reply.code(400).send({ ok: false, error: "Sahne isteği geçersiz." });
  }
  try {
    await source.groupScene(
      request.params.id,
      sceneId,
      action as "store" | "recall" | "remove",
      name
    );
    return { ok: true, groups: store.getGroups() };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.get("/api/pairing", async () => store.getPairing());
app.post<{ Body?: { seconds?: number; routerId?: string } }>("/api/pairing/start", async (request, reply) => {
  if (!config.pairingControl) {
    return reply.code(403).send({ ok: false, error: "Cihaz ekleme denetimi kapalı." });
  }
  const requested = request.body?.seconds ?? 180;
  const seconds = Number.isInteger(requested) ? Math.min(254, Math.max(10, requested)) : 180;
  const routerId =
    typeof request.body?.routerId === "string" && /^0x[0-9a-f]{16}$/i.test(request.body.routerId)
      ? request.body.routerId.toLowerCase()
      : undefined;
  store.pairingRequested(seconds);
  try {
    await source.permitJoin(seconds, routerId);
    return { ok: true, pairing: store.getPairing() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.pairingRequestFailed(message);
    return reply.code(503).send({ ok: false, error: message });
  }
});

app.post<{ Body?: { value?: unknown } }>("/api/zigbee/install-code", async (request, reply) => {
  const value = typeof request.body?.value === "string" ? request.body.value.trim() : "";
  // Herdsman accepts several vendor QR formats containing "$", "|" and spaces.
  if (value.length < 16 || value.length > 512 || !/^[\x20-\x7e]+$/.test(value)) {
    return reply.code(400).send({ ok: false, error: "Install code veya Zigbee QR değeri geçersiz." });
  }
  try {
    await source.addInstallCode(value);
    return { ok: true };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.post<{ Params: { id: string } }>("/api/devices/:id/reconfigure", async (request, reply) => {
  const id = request.params.id.toLowerCase();
  if (!store.getDevice(id)) return reply.code(404).send({ ok: false, error: "Cihaz bulunamadı." });
  try {
    await source.reconfigureDevice(id);
    return { ok: true, device: store.getDevice(id) };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/zigbee/touchlink/scan", async (_request, reply) => {
  try {
    return { ok: true, devices: await source.scanTouchlink() };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.get("/api/zigbee/network-map", async (_request, reply) => {
  try {
    return { ok: true, map: await source.networkMap() };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
app.put<{ Params: { id: string }; Body?: { enabled?: unknown } }>(
  "/api/devices/:id/ota-schedule",
  async (request, reply) => {
    const id = request.params.id.toLowerCase();
    if (!store.getDevice(id) || typeof request.body?.enabled !== "boolean") {
      return reply.code(400).send({ ok: false, error: "Yazılım güncelleme isteği geçersiz." });
    }
    try {
      await source.scheduleOta(id, request.body.enabled);
      return { ok: true, scheduled: request.body.enabled };
    } catch (error) {
      return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
);
app.post<{ Params: { id: string } }>("/api/devices/:id/ota-check", async (request, reply) => {
  const id = request.params.id.toLowerCase();
  if (!store.getDevice(id)) {
    return reply.code(404).send({ ok: false, error: "Cihaz bulunamadı." });
  }
  try {
    return { ok: true, ota: await source.checkOta(id) };
  } catch (error) {
    return reply.code(503).send({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
app.put<{
  Params: { id: string };
  Body?: { transition?: unknown; debounce?: unknown; retain?: unknown };
}>("/api/devices/:id/options", async (request, reply) => {
  const id = request.params.id.toLowerCase();
  if (!store.getDevice(id)) return reply.code(404).send({ ok: false, error: "Cihaz bulunamadı." });
  const transition = request.body?.transition === undefined ? undefined : Number(request.body.transition);
  const debounce = request.body?.debounce === undefined ? undefined : Number(request.body.debounce);
  const retain = request.body?.retain;
  if (
    (transition !== undefined && (!Number.isFinite(transition) || transition < 0 || transition > 60)) ||
    (debounce !== undefined && (!Number.isFinite(debounce) || debounce < 0 || debounce > 60)) ||
    (retain !== undefined && typeof retain !== "boolean")
  ) {
    return reply.code(400).send({ ok: false, error: "Cihaz seçenekleri geçersiz." });
  }
  try {
    const options = {
      ...(transition !== undefined ? { transition } : {}),
      ...(debounce !== undefined ? { debounce } : {}),
      ...(retain !== undefined ? { retain } : {})
    };
    await source.setDeviceOptions(id, options);
    return { ok: true, options };
  } catch (error) {
    return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.post<{ Body?: { ieeeAddress?: unknown; channel?: unknown; confirmation?: unknown } }>(
  "/api/zigbee/touchlink/reset",
  async (request, reply) => {
    const ieeeAddress =
      typeof request.body?.ieeeAddress === "string" ? request.body.ieeeAddress.toLowerCase() : "";
    const channel = request.body?.channel;
    if (
      request.body?.confirmation !== "RESET" ||
      !/^0x[0-9a-f]{16}$/.test(ieeeAddress) ||
      !Number.isInteger(channel) ||
      Number(channel) < 11 ||
      Number(channel) > 26
    ) {
      return reply.code(400).send({ ok: false, error: "Touchlink sıfırlama isteği geçersiz." });
    }
    try {
      await source.resetTouchlink(ieeeAddress, Number(channel));
      return { ok: true };
    } catch (error) {
      return reply.code(503).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
);
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
app.get("/api/overview", async (request) => ({
  health: store.getHealth(),
  devices: visibleDevices(request.villaSession?.role),
  groups: store.getGroups(),
  pairing: store.getPairing(),
  events: store.getEvents(20)
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
      const control = device?.controls.find((item) =>
        item.id === favorite.controlId && isHomeFavoriteControlKind(item.kind)
      );
      if (!device || !control) {
        return reply.code(400).send({ ok: false, error: "Favori cihaz veya kontrol bulunamadı." });
      }
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
  if (device.preparing) {
    return reply.code(409).send({
      ok: false,
      code: "DEVICE_PREPARING",
      error: "Cihaz kurulumu tamamlanıyor. Lütfen hazır olmasını bekleyin."
    });
  }
  const control = device.controls.find((item) => item.property === request.body?.property);
  if (!control) return reply.code(400).send({ ok: false, error: "Bu denetim cihaz tarafından sunulmuyor." });
  if (control.adminOnly && request.villaSession?.role !== "admin") {
    return reply.code(403).send({ ok: false, error: "Bu cihaz ayarı için yönetici yetkisi gerekiyor." });
  }
  let value: unknown = request.body?.value;
  if (["switch", "fan", "siren"].includes(control.kind)) {
    if (typeof value !== "boolean") return reply.code(400).send({ ok: false, error: "Aç/kapat değeri geçersiz." });
    value = value ? control.valueOn ?? "ON" : control.valueOff ?? "OFF";
  } else if (control.kind === "color") {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
      return reply.code(400).send({ ok: false, error: "Renk değeri geçersiz." });
    }
    value = hexToXy(value);
  } else if (["cover", "lock", "select"].includes(control.kind)) {
    if (
      (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
      || (control.values?.length && !control.values.includes(value))
    ) {
      return reply.code(400).send({ ok: false, error: "Seçilen cihaz komutu geçersiz." });
    }
  } else {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return reply.code(400).send({ ok: false, error: "Sayısal denetim değeri geçersiz." });
    }
    const clamped = Math.min(control.max ?? value, Math.max(control.min ?? value, value));
    const step = control.step;
    value = step && step > 0
      ? Number((Math.round((clamped - (control.min ?? 0)) / step) * step + (control.min ?? 0)).toFixed(6))
      : clamped;
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
    await deviceNotesStore.removeDevice(id);
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
    const confirmation =
      typeof request.body === "object"
      && request.body !== null
      && !Array.isArray(request.body)
      && "zigbeeChannelConfirmation" in request.body
        ? (request.body as { zigbeeChannelConfirmation?: unknown }).zigbeeChannelConfirmation
        : undefined;
    const settings = await settingsStore.save(request.body, {
      confirmZigbeeChannelChange: confirmation === "CHANGE"
    });
    store.setLowBatteryThreshold(settings.alerts.lowBatteryThreshold);
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

app.get("/api/zigbee/backup", async (_request, reply) => {
  try {
    const prepared = await source.prepareNetworkBackup();
    const date = new Date().toISOString().slice(0, 10);
    if (prepared) {
      return reply
        .header("Content-Disposition", `attachment; filename="villa-bridge-zigbee-${date}.${prepared.extension}"`)
        .type(prepared.contentType)
        .send(prepared.body);
    }
    if (!config.zigbee) throw new Error("Yerel Zigbee veri dizini bulunamadı.");
    const backup = await createZigbeeNetworkBackup(config.zigbee.dataDir);
    return reply
      .header("Content-Disposition", `attachment; filename="villa-bridge-zigbee-${date}.json"`)
      .type("application/json; charset=utf-8")
      .send(`${JSON.stringify(backup, null, 2)}\n`);
  } catch (error) {
    return reply.code(503).send({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post<{ Body?: { confirmation?: unknown; backup?: unknown } }>(
  "/api/zigbee/restore",
  async (request, reply) => {
    if (!config.zigbee) {
      return reply.code(503).send({ ok: false, error: "Yerel Zigbee ağı bu çalışma modunda kullanılmıyor." });
    }
    if (request.body?.confirmation !== "RESTORE") {
      return reply.code(400).send({ ok: false, error: "Geri yükleme onayı geçersiz." });
    }
    try {
      await stageZigbeeNetworkRestore(config.zigbee.dataDir, request.body.backup);
      const timer = setTimeout(() => process.kill(process.pid, "SIGTERM"), 750);
      timer.unref();
      return { ok: true, restarting: true };
    } catch (error) {
      return reply.code(400).send({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
);

app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(dashboard));

type EmbeddedVillaBridgeGlobal = typeof globalThis & {
  __villaBridgeReady?: boolean;
  __villaBridgeStop?: () => Promise<void>;
};

const embeddedRuntime = process.env.VILLA_BRIDGE_EMBEDDED === "true";
const embeddedGlobal = globalThis as EmbeddedVillaBridgeGlobal;
let discoveryResponder: Awaited<ReturnType<typeof startLanDiscoveryResponder>> = null;
const shutdown = async (): Promise<void> => {
  if (!embeddedGlobal.__villaBridgeReady) return;
  embeddedGlobal.__villaBridgeReady = false;
  clearInterval(imageWarmTimer);
  clearTimeout(imageWarmStartTimer);
  await discoveryResponder?.close();
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
const warmDeviceImages = (): void => {
  const models = store.getDevices()
    .map((device) => device.image.model?.trim())
    .filter((model): model is string => Boolean(model));
  if (models.length === 0) return;
  void imageCache.warm(models).catch((error) => {
    console.error(`Cihaz görselleri önden indirilemedi: ${String(error)}`);
  });
};
const imageWarmTimer = setInterval(warmDeviceImages, 5 * 60_000);
imageWarmTimer.unref();
const imageWarmStartTimer = setTimeout(warmDeviceImages, 5_000);
imageWarmStartTimer.unref();

await app.listen({ host: config.http.host, port: config.http.port });
try {
  discoveryResponder = await startLanDiscoveryResponder(discoveryRecord);
  if (discoveryResponder) {
    console.log(
      `Villa Bridge LAN keşfi UDP ${villaBridgeDiscoveryPort} portunda hazır.`
    );
  }
} catch (error) {
  console.warn(`Villa Bridge LAN keşfi başlatılamadı: ${String(error)}`);
}
embeddedGlobal.__villaBridgeReady = true;
console.log(`Villa Bridge paneli ${config.http.host}:${config.http.port} adresinde hazır.`);
