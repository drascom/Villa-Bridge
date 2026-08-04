import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { DeviceImageCache } from "./device-image-cache.js";

const createDirectory = (): Promise<string> => mkdtemp(resolve(tmpdir(), "villa-image-cache-"));

const withFetch = async (
  stub: typeof globalThis.fetch,
  body: () => Promise<void>
): Promise<void> => {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await body();
  } finally {
    globalThis.fetch = original;
  }
};

const notFoundResponse = (): Response => new Response(null, { status: 404 });

const imageResponse = (body: Uint8Array<ArrayBuffer>, contentType: string): Response =>
  new Response(body, { status: 200, headers: { "Content-Type": contentType } });

test("geçersiz ve dizin dışına çıkan model adları reddedilir", async () => {
  const cache = new DeviceImageCache(await createDirectory());
  let calls = 0;

  await withFetch(async () => {
    calls += 1;
    return notFoundResponse();
  }, async () => {
    for (const model of ["../../etc/passwd", "a/b", "", "TS0001?x=1", "a".repeat(65)]) {
      assert.equal(await cache.get(model), null);
    }
  });

  assert.equal(calls, 0);
});

test("diskteki önbellek isabet ederse ağa çıkılmaz", async () => {
  const directory = await createDirectory();
  await writeFile(resolve(directory, "TS0011.png"), Buffer.from([1, 2, 3]));
  const cache = new DeviceImageCache(directory);

  await withFetch(async () => {
    throw new Error("ağ çağrısı yapılmamalıydı");
  }, async () => {
    const image = await cache.get("TS0011");
    assert.deepEqual(image, { contentType: "image/png", body: Buffer.from([1, 2, 3]) });
  });
});

test("bulunamayan model null döner ve negatif önbelleğe alınır", async () => {
  const cache = new DeviceImageCache(await createDirectory());
  let calls = 0;

  await withFetch(async () => {
    calls += 1;
    return notFoundResponse();
  }, async () => {
    assert.equal(await cache.get("TS9999"), null);
    assert.equal(calls, 2);
    assert.equal(await cache.get("TS9999"), null);
    assert.equal(calls, 2);
  });
});

test("indirilen görsel diske yazılır ve gövdesiyle döner", async () => {
  const directory = await createDirectory();
  const cache = new DeviceImageCache(directory);
  const requested: string[] = [];

  await withFetch(async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith(".jpg")) return notFoundResponse();
    return imageResponse(Buffer.from([9, 8, 7]), "image/png");
  }, async () => {
    const image = await cache.get("TS0012_switch_module");
    assert.deepEqual(image, { contentType: "image/png", body: Buffer.from([9, 8, 7]) });
  });

  assert.deepEqual(requested, [
    "https://www.zigbee2mqtt.io/images/devices/TS0012_switch_module.jpg",
    "https://www.zigbee2mqtt.io/images/devices/TS0012_switch_module.png"
  ]);
  assert.deepEqual(
    await readFile(resolve(directory, "TS0012_switch_module.png")),
    Buffer.from([9, 8, 7])
  );
});

test("resim olmayan 200 yanıtı reddedilir ve diske yazılmaz", async () => {
  const directory = await createDirectory();
  const cache = new DeviceImageCache(directory);

  await withFetch(async () => new Response(
    "<html><body>Captive portal</body></html>",
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  ), async () => {
    assert.equal(await cache.get("TS0011"), null);
  });

  assert.deepEqual(await readdir(directory), []);
});

test("boş gövdeli 200 yanıtı reddedilir", async () => {
  const directory = await createDirectory();
  const cache = new DeviceImageCache(directory);

  await withFetch(
    async () => imageResponse(Buffer.alloc(0), "image/jpeg"),
    async () => {
      assert.equal(await cache.get("TS0011"), null);
    }
  );

  assert.deepEqual(await readdir(directory), []);
});

test("boyut sınırını aşan yanıt reddedilir", async () => {
  const directory = await createDirectory();
  const cache = new DeviceImageCache(directory);

  await withFetch(
    async () => imageResponse(Buffer.alloc(2 * 1024 * 1024 + 1), "image/jpeg"),
    async () => {
      assert.equal(await cache.get("TS0011"), null);
    }
  );

  assert.deepEqual(await readdir(directory), []);
});

test("dosya uzantısı istenen değil gerçek content type ile belirlenir", async () => {
  const directory = await createDirectory();
  const cache = new DeviceImageCache(directory);

  await withFetch(
    async () => imageResponse(Buffer.from([4, 5, 6]), "image/png"),
    async () => {
      const image = await cache.get("TS0002_basic");
      assert.deepEqual(image, { contentType: "image/png", body: Buffer.from([4, 5, 6]) });
    }
  );

  assert.deepEqual(await readdir(directory), ["TS0002_basic.png"]);
});

test("ısıtma yalnız eksik ve geçerli modelleri indirir", async () => {
  const directory = await createDirectory();
  await writeFile(resolve(directory, "WHD02.jpg"), Buffer.from([1]));
  const cache = new DeviceImageCache(directory, 2, 0);
  const requested: string[] = [];

  await withFetch(async (input) => {
    requested.push(String(input));
    return imageResponse(Buffer.from([2, 3]), "image/jpeg");
  }, async () => {
    await cache.warm(["WHD02", "TS0011", "TS0011", "../../etc/passwd", "a/b", ""]);
  });

  assert.deepEqual(requested, ["https://www.zigbee2mqtt.io/images/devices/TS0011.jpg"]);
  assert.deepEqual((await readdir(directory)).sort(), ["TS0011.jpg", "WHD02.jpg"]);
});

test("ısıtmada bir modelin hatası diğerlerini durdurmaz", async () => {
  const directory = await createDirectory();
  const cache = new DeviceImageCache(directory, 2, 0);

  await withFetch(async (input) => {
    const url = String(input);
    if (url.includes("TS0012")) throw new Error("bağlantı yok");
    if (url.includes("TS0013")) return notFoundResponse();
    return imageResponse(Buffer.from([7]), "image/jpeg");
  }, async () => {
    await cache.warm(["TS0012", "TS0013", "TS0011", "TS0002_basic"]);
  });

  assert.deepEqual(
    (await readdir(directory)).sort(),
    ["TS0002_basic.jpg", "TS0011.jpg"]
  );
});

test("ısıtma negatif önbellekteki modeller için ağa çıkmaz", async () => {
  const cache = new DeviceImageCache(await createDirectory(), 2, 0);
  let calls = 0;

  await withFetch(async () => {
    calls += 1;
    return notFoundResponse();
  }, async () => {
    assert.equal(await cache.get("TS9998"), null);
    assert.equal(calls, 2);
    await cache.warm(["TS9998"]);
    assert.equal(calls, 2);
  });
});

test("ağ hatası yutulur ve null döner", async () => {
  const cache = new DeviceImageCache(await createDirectory());

  await withFetch(async () => {
    throw new Error("bağlantı yok");
  }, async () => {
    assert.equal(await cache.get("TS0013"), null);
  });
});

test("çevrimdışıyken başarısız model internet dönünce yeniden denenir", async () => {
  let clock = 0;
  const directory = await createDirectory();
  const cache = new DeviceImageCache(directory, 2, 0, () => clock);
  let online = false;
  let calls = 0;

  await withFetch(async () => {
    calls += 1;
    if (!online) throw new Error("bağlantı yok");
    return imageResponse(Buffer.from([5]), "image/jpeg");
  }, async () => {
    assert.equal(await cache.get("WHD02"), null);
    assert.equal(calls, 2);

    // Geri çekilme süresi dolmadan tekrar ağa çıkılmaz.
    clock += 30_000;
    assert.equal(await cache.get("WHD02"), null);
    assert.equal(calls, 2);

    // Süre dolunca ve internet dönünce görsel gelir.
    clock += 31_000;
    online = true;
    const image = await cache.get("WHD02");
    assert.deepEqual(image, { contentType: "image/jpeg", body: Buffer.from([5]) });
  });

  assert.deepEqual(await readdir(directory), ["WHD02.jpg"]);
});

test("üst üste ağ hatasında yeniden deneme aralığı büyür", async () => {
  let clock = 0;
  const cache = new DeviceImageCache(await createDirectory(), 2, 0, () => clock);
  let calls = 0;

  await withFetch(async () => {
    calls += 1;
    throw new Error("bağlantı yok");
  }, async () => {
    assert.equal(await cache.get("TS0011"), null);
    assert.equal(calls, 2);

    clock += 61_000;
    assert.equal(await cache.get("TS0011"), null);
    assert.equal(calls, 4);

    // İkinci hatadan sonra bekleme 2 dakikaya çıkar: 61 saniye yetmez.
    clock += 61_000;
    assert.equal(await cache.get("TS0011"), null);
    assert.equal(calls, 4);

    clock += 60_000;
    assert.equal(await cache.get("TS0011"), null);
    assert.equal(calls, 6);
  });
});

test("upstream'de olmayan model geçici hata gibi hızlı yeniden denenmez", async () => {
  let clock = 0;
  const cache = new DeviceImageCache(await createDirectory(), 2, 0, () => clock);
  let calls = 0;

  await withFetch(async () => {
    calls += 1;
    return notFoundResponse();
  }, async () => {
    assert.equal(await cache.get("TS9997"), null);
    assert.equal(calls, 2);

    clock += 6 * 60 * 60 * 1000;
    assert.equal(await cache.get("TS9997"), null);
    await cache.warm(["TS9997"]);
    assert.equal(calls, 2);

    // Bir gün sonra katalog güncellenmiş olabilir, bir kez daha bakılır.
    clock += 19 * 60 * 60 * 1000;
    assert.equal(await cache.get("TS9997"), null);
    assert.equal(calls, 4);
  });
});
