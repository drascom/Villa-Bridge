import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Automation } from "./automations.js";
import type { DeviceControlView } from "./types.js";
import {
  HomeBackupService,
  homeBackupSectionNames,
  homeBackupVersion,
  type HomeBackup,
  type HomeBackupPaths,
  type HomeBackupSummary
} from "./home-backup.js";

const deviceOne = "0xa4c138ea872c2c8e";
const deviceTwo = "0x20a716fffe6835f1";
const goneDevice = "0x00124b0022aabbcc";

const automation = (id: string, name: string, deviceId = deviceOne): Automation => ({
  id,
  name,
  enabled: true,
  triggers: [{ type: "time", at: "07:30", days: [1, 2, 3, 4, 5] }],
  conditions: [],
  actions: [{ type: "device", deviceId, property: "state", value: "ON" }],
  lastRunAt: null,
  lastRunOk: null
});

const sectionOf = (summary: HomeBackupSummary, name: string) => {
  const section = summary.sections.find((entry) => entry.section === name);
  assert.ok(section, `${name} bölümü özet içinde yok`);
  return section;
};

interface Harness {
  directory: string;
  paths: HomeBackupPaths;
  service: HomeBackupService;
  aliases: Map<string, string>;
  read: (path: string) => Promise<unknown>;
}

const setup = async (
  context: { after: (callback: () => Promise<void>) => void },
  options: { knownDeviceIds?: string[]; controls?: DeviceControlView[] } = {}
): Promise<Harness> => {
  const directory = await mkdtemp(join(tmpdir(), "villa-home-backup-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const paths: HomeBackupPaths = {
    automations: join(directory, "automations.json"),
    aliases: join(directory, "aliases.json"),
    homeGroups: join(directory, "home-groups.json"),
    favorites: join(directory, "home-favorites.json"),
    homeVisibility: join(directory, "home-visibility.json"),
    deviceNotes: join(directory, "device-notes.json"),
    deviceImages: join(directory, "device-images.json")
  };
  const aliases = new Map<string, string>();
  const service = new HomeBackupService({
    paths,
    aliases,
    knownDeviceIds: () => options.knownDeviceIds ?? [deviceOne, deviceTwo],
    automationLookup: options.controls
      ? () => ({ controls: options.controls as DeviceControlView[] })
      : undefined
  });
  return {
    directory,
    paths,
    service,
    aliases,
    read: async (path) => JSON.parse(await readFile(path, "utf8")) as unknown
  };
};

const seed = async (harness: Harness): Promise<void> => {
  await writeFile(harness.paths.automations, JSON.stringify([automation("sabah-isik", "Sabah ışığı")]));
  await writeFile(harness.paths.homeGroups, JSON.stringify([
    { id: "salon", name: "Salon", items: [{ deviceId: deviceOne, controlId: "@device" }] }
  ]));
  await writeFile(harness.paths.favorites, JSON.stringify([{ deviceId: deviceOne, controlId: "main" }]));
  await writeFile(harness.paths.homeVisibility, JSON.stringify({
    hiddenDevices: [{ deviceId: deviceOne, controlId: "l2" }],
    hiddenGroups: ["salon"]
  }));
  await writeFile(harness.paths.deviceNotes, JSON.stringify({ [deviceOne]: "Sol duvar anahtarı" }));
  await writeFile(harness.paths.deviceImages, JSON.stringify({
    devices: { [deviceOne]: "WHD02" },
    models: { "TS0001::_TZ3000_i9oy2rdq": "WHD02" }
  }));
  harness.aliases.set(deviceOne, "Salon lambası");
  harness.aliases.set(`${deviceOne}:button:1`, "Üst düğme");
};

test("dışa aktarılan yedek hiçbir sır içermez", async (context) => {
  const harness = await setup(context);
  await seed(harness);
  // Aynı dizinde duran sır dosyaları yedeğin kapsamı dışındadır.
  await writeFile(join(harness.directory, "auth.json"), JSON.stringify({
    admin: { username: "owner", passwordHash: "scrypt$deadbeef", salt: "c0ffee" },
    residentPinHash: "scrypt$abc123",
    sessions: [{ token: "s3cr3t-token", csrfToken: "csrf-s3cr3t" }]
  }));
  await writeFile(join(harness.directory, "installation-state.json"), JSON.stringify({
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z"
  }));
  await writeFile(join(harness.directory, "device-events.json"), JSON.stringify([
    { sourceName: "salon", property: "state", value: "ON" }
  ]));
  await writeFile(join(harness.directory, "configuration.yaml"), [
    "mqtt:",
    "  user: villa",
    "  password: mqtt-parolasi",
    "advanced:",
    "  network_key: [1, 3, 5, 7, 9, 11, 13, 15, 0, 2, 4, 6, 8, 10, 12, 14]"
  ].join("\n"));

  const backup = await harness.service.create();
  const serialized = JSON.stringify(backup);

  assert.deepEqual(Object.keys(backup.sections).sort(), [...homeBackupSectionNames].sort());
  for (const forbidden of [
    "passwordHash",
    "password",
    "passphrase",
    "salt",
    "residentPin",
    "residentPinHash",
    "csrfToken",
    "token",
    "sessions",
    "networkKey",
    "network_key",
    "panId",
    "extendedPanId",
    "installCode",
    "certificate",
    "privateKey",
    "apiKey",
    "secret",
    "mqtt",
    "homeAssistant",
    "installation",
    "onboarding",
    "events"
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"), `${forbidden} yedeğe sızmış`);
  }
  for (const leaked of ["scrypt$deadbeef", "s3cr3t-token", "mqtt-parolasi", "c0ffee"]) {
    assert.ok(!serialized.includes(leaked), `${leaked} yedeğe sızmış`);
  }
  assert.equal(backup.version, homeBackupVersion);
  assert.equal(backup.deviceCount, 2);
  assert.equal(backup.sections.aliases[deviceOne], "Salon lambası");
  assert.equal(backup.sections.aliases[`${deviceOne}:button:1`], "Üst düğme");
  // Göster/gizle kullanıcının kurduğu bir tercih: geri yüklemede kaybolmamalı, sır da içermez.
  assert.deepEqual(backup.sections.homeVisibility, {
    hiddenDevices: [{ deviceId: deviceOne, controlId: "l2" }],
    hiddenGroups: ["salon"]
  });
});

test("görünürlük bölümü replace'te değişir, merge'te birleşir, ölü cihaz düşer", async (context) => {
  const replaceHarness = await setup(context);
  await seed(replaceHarness);
  const incoming = (): HomeBackup => ({
    version: homeBackupVersion,
    createdAt: "2026-07-01T10:00:00.000Z",
    deviceCount: 2,
    sections: {
      automations: [],
      aliases: {},
      homeGroups: [],
      favorites: [],
      homeVisibility: {
        hiddenDevices: [
          { deviceId: deviceTwo, controlId: "main" },
          // Artık tanınmayan cihaz: geri yüklemede düşer ve özette bildirilir.
          { deviceId: "0x0000000000000009", controlId: "main" }
        ],
        hiddenGroups: ["mutfak"]
      },
      deviceNotes: {},
      deviceImages: { devices: {}, models: {} }
    }
  });

  const replaceSummary = await replaceHarness.service.restore(incoming(), "replace");
  assert.equal(sectionOf(replaceSummary, "homeVisibility").skippedMissingDevices, 1);
  assert.deepEqual(await replaceHarness.read(replaceHarness.paths.homeVisibility), {
    hiddenDevices: [{ deviceId: deviceTwo, controlId: "main" }],
    hiddenGroups: ["mutfak"]
  });

  const mergeHarness = await setup(context);
  await seed(mergeHarness);
  await mergeHarness.service.restore(incoming(), "merge");
  assert.deepEqual(await mergeHarness.read(mergeHarness.paths.homeVisibility), {
    hiddenDevices: [
      { deviceId: deviceOne, controlId: "l2" },
      { deviceId: deviceTwo, controlId: "main" }
    ],
    hiddenGroups: ["salon", "mutfak"]
  });
});

test("önizleme hiçbir dosyayı değiştirmez", async (context) => {
  const harness = await setup(context);
  await seed(harness);
  const backup = await harness.service.create();
  const before = await Promise.all(Object.values(harness.paths)
    .map((path) => readFile(path as string, "utf8").catch(() => null)));

  const merged: HomeBackup = {
    ...backup,
    sections: { ...backup.sections, automations: [automation("aksam-isik", "Akşam ışığı")] }
  };
  const summary = await harness.service.preview(merged, "replace");
  assert.equal(sectionOf(summary, "automations").incoming, 1);
  assert.equal(sectionOf(summary, "automations").removed, 1);
  assert.equal(sectionOf(summary, "automations").added, 1);

  const after = await Promise.all(Object.values(harness.paths)
    .map((path) => readFile(path as string, "utf8").catch(() => null)));
  assert.deepEqual(after, before);
});

test("bilinmeyen yedek sürümü Türkçe gerekçeyle reddedilir", async (context) => {
  const harness = await setup(context);
  await assert.rejects(
    () => harness.service.preview({ version: 99, createdAt: "", sections: {} }, "merge"),
    /Yedek dosyası sürümü tanınmıyor/
  );
  await assert.rejects(() => harness.service.preview("yedek", "merge"), /Yedek dosyası okunamadı/);
  await assert.rejects(
    () => harness.service.preview({ version: homeBackupVersion }, "merge"),
    /bölüm bulunamadı/
  );
});

test("replace bölümü tamamen değiştirir, merge fazlalığı silmez", async (context) => {
  const replaceHarness = await setup(context);
  await seed(replaceHarness);
  const incoming: HomeBackup = {
    version: homeBackupVersion,
    createdAt: "2026-07-01T10:00:00.000Z",
    deviceCount: 2,
    sections: {
      automations: [automation("aksam-isik", "Akşam ışığı")],
      aliases: { [deviceTwo]: "Mutfak lambası" },
      homeGroups: [{ id: "mutfak", name: "Mutfak", items: [] }],
      favorites: [{ deviceId: deviceTwo, controlId: "main" }],
      homeVisibility: {
        hiddenDevices: [{ deviceId: deviceTwo, controlId: "main" }],
        hiddenGroups: ["mutfak"]
      },
      deviceNotes: { [deviceTwo]: "Tezgah altı" },
      deviceImages: { devices: { [deviceTwo]: "TS0002" }, models: {} }
    }
  };

  await replaceHarness.service.restore(structuredClone(incoming), "replace");
  assert.deepEqual(
    (await replaceHarness.read(replaceHarness.paths.automations) as { id: string }[]).map((entry) => entry.id),
    ["aksam-isik"]
  );
  assert.deepEqual(await replaceHarness.read(replaceHarness.paths.aliases as string), {
    [deviceTwo]: "Mutfak lambası"
  });
  assert.deepEqual([...replaceHarness.aliases.keys()], [deviceTwo]);
  assert.deepEqual(await replaceHarness.read(replaceHarness.paths.deviceNotes), {
    [deviceTwo]: "Tezgah altı"
  });

  const mergeHarness = await setup(context);
  await seed(mergeHarness);
  const summary = await mergeHarness.service.restore(structuredClone(incoming), "merge");
  assert.equal(sectionOf(summary, "automations").removed, 0);
  assert.equal(sectionOf(summary, "automations").added, 1);
  assert.deepEqual(
    (await mergeHarness.read(mergeHarness.paths.automations) as { id: string }[]).map((entry) => entry.id),
    ["sabah-isik", "aksam-isik"]
  );
  assert.deepEqual(await mergeHarness.read(mergeHarness.paths.aliases as string), {
    [deviceOne]: "Salon lambası",
    [`${deviceOne}:button:1`]: "Üst düğme",
    [deviceTwo]: "Mutfak lambası"
  });
  assert.deepEqual(await mergeHarness.read(mergeHarness.paths.deviceNotes), {
    [deviceOne]: "Sol duvar anahtarı",
    [deviceTwo]: "Tezgah altı"
  });
});

test("merge aynı kimlikli kaydın üzerine yazar", async (context) => {
  const harness = await setup(context);
  await seed(harness);
  const summary = await harness.service.restore({
    version: homeBackupVersion,
    createdAt: "2026-07-01T10:00:00.000Z",
    sections: { automations: [automation("sabah-isik", "Sabah ışığı v2")] }
  }, "merge");
  assert.equal(sectionOf(summary, "automations").overwritten, 1);
  assert.equal(sectionOf(summary, "automations").added, 0);
  assert.deepEqual(
    (await harness.read(harness.paths.automations) as { name: string }[]).map((entry) => entry.name),
    ["Sabah ışığı v2"]
  );
});

test("bir bölüm doğrulamadan geçmezse hiçbir dosya yazılmaz", async (context) => {
  const harness = await setup(context);
  await seed(harness);
  const before = await Promise.all(Object.values(harness.paths)
    .map((path) => readFile(path as string, "utf8").catch(() => null)));

  await assert.rejects(() => harness.service.restore({
    version: homeBackupVersion,
    createdAt: "2026-07-01T10:00:00.000Z",
    sections: {
      automations: [automation("aksam-isik", "Akşam ışığı")],
      aliases: { [deviceTwo]: "Mutfak" },
      // Oda adı boş: kendi doğrulayıcısından geçmez, tüm geri yükleme düşer.
      homeGroups: [{ id: "mutfak", name: "   ", items: [] }]
    }
  }, "replace"));

  const after = await Promise.all(Object.values(harness.paths)
    .map((path) => readFile(path as string, "utf8").catch(() => null)));
  assert.deepEqual(after, before);
  assert.deepEqual([...harness.aliases.keys()], [deviceOne, `${deviceOne}:button:1`]);
});

test("kilit ve siren eylemi içeren yedek reddedilir", async (context) => {
  const harness = await setup(context, {
    controls: [{
      id: "main",
      name: "Kapı kilidi",
      kind: "lock",
      property: "state",
      value: null
    } as unknown as DeviceControlView]
  });
  await seed(harness);
  await assert.rejects(() => harness.service.preview({
    version: homeBackupVersion,
    createdAt: "2026-07-01T10:00:00.000Z",
    sections: { automations: [automation("kapi-acma", "Kapıyı aç")] }
  }, "merge"), /Kilit ve siren bir otomasyon eylemi olamaz/);
});

test("artık var olmayan cihazın kayıtları düşer ve özette bildirilir", async (context) => {
  const harness = await setup(context, { knownDeviceIds: [deviceOne, deviceTwo] });
  await seed(harness);
  const summary = await harness.service.restore({
    version: homeBackupVersion,
    createdAt: "2026-07-01T10:00:00.000Z",
    sections: {
      automations: [automation("gitmis-isik", "Gitmiş ışık", goneDevice), automation("kalan-isik", "Kalan ışık")],
      aliases: { [goneDevice]: "Eski lamba", [deviceTwo]: "Mutfak lambası" },
      homeGroups: [{
        id: "salon",
        name: "Salon",
        items: [{ deviceId: goneDevice, controlId: "@device" }, { deviceId: deviceTwo, controlId: "@device" }]
      }],
      favorites: [{ deviceId: goneDevice, controlId: "main" }, { deviceId: deviceTwo, controlId: "main" }],
      deviceNotes: { [goneDevice]: "Eski not", [deviceTwo]: "Yeni not" },
      deviceImages: { devices: { [goneDevice]: "TS0001" }, models: { "TS0002::x": "TS0002" } }
    }
  }, "replace");

  assert.equal(sectionOf(summary, "automations").skippedMissingDevices, 1);
  assert.equal(sectionOf(summary, "aliases").skippedMissingDevices, 1);
  assert.equal(sectionOf(summary, "homeGroups").skippedMissingDevices, 1);
  assert.equal(sectionOf(summary, "favorites").skippedMissingDevices, 1);
  assert.equal(sectionOf(summary, "deviceNotes").skippedMissingDevices, 1);
  assert.equal(sectionOf(summary, "deviceImages").skippedMissingDevices, 1);
  assert.equal(summary.totalSkippedMissingDevices, 6);

  assert.deepEqual(
    (await harness.read(harness.paths.automations) as { id: string }[]).map((entry) => entry.id),
    ["kalan-isik"]
  );
  assert.deepEqual(await harness.read(harness.paths.aliases as string), { [deviceTwo]: "Mutfak lambası" });
  assert.deepEqual(await harness.read(harness.paths.favorites), [{ deviceId: deviceTwo, controlId: "main" }]);
  assert.deepEqual(await harness.read(harness.paths.deviceNotes), { [deviceTwo]: "Yeni not" });
  assert.deepEqual(await harness.read(harness.paths.deviceImages), {
    devices: {},
    models: { "TS0002::x": "TS0002" }
  });
});

test("cihaz listesi boşken hiçbir kayıt düşürülmez", async (context) => {
  const harness = await setup(context, { knownDeviceIds: [] });
  const summary = await harness.service.preview({
    version: homeBackupVersion,
    createdAt: "2026-07-01T10:00:00.000Z",
    sections: { automations: [automation("gitmis-isik", "Gitmiş ışık", goneDevice)] }
  }, "replace");
  assert.equal(sectionOf(summary, "automations").skippedMissingDevices, 0);
  assert.equal(sectionOf(summary, "automations").incoming, 1);
});

test("geri yükleme öncesi mevcut durum .bak dosyasına alınır", async (context) => {
  const harness = await setup(context);
  await seed(harness);
  const previous = await readFile(harness.paths.automations, "utf8");
  await harness.service.restore({
    version: homeBackupVersion,
    createdAt: "2026-07-01T10:00:00.000Z",
    sections: { automations: [automation("aksam-isik", "Akşam ışığı")] }
  }, "replace");
  assert.equal(await readFile(`${harness.paths.automations}.bak`, "utf8"), previous);
});
