import assert from "node:assert/strict";
import test from "node:test";
import { detectDeviceCategory, isDeviceRole, resolveDeviceCategory } from "./device-category.js";

test("tanıma standart expose tipine dayanır, satıcıdan bağımsız çalışır", () => {
  // Tuya LED sürücüsü, IKEA ampulü ve Philips Hue şeridi: üçü de `type: "light"` bildirir.
  const tuyaLight = [{ type: "light", features: [{ name: "state", property: "state", access: 7 }] }];
  const ikeaLight = [{ type: "light", features: [{ name: "brightness", property: "brightness", access: 7 }] }];
  const hueLight = [{ type: "light", features: [{ name: "color_xy", property: "color", access: 7 }] }];
  for (const exposes of [tuyaLight, ikeaLight, hueLight]) {
    assert.equal(detectDeviceCategory(exposes), "light");
  }

  // Farklı satıcılardan iki anahtar: tek kanallı röle ve üç kanallı duvar anahtarı.
  const relay = [{ type: "switch", features: [{ name: "state", property: "state", access: 7 }] }];
  const wallSwitch = [
    { type: "switch", endpoint: "l1", features: [{ name: "state", property: "state_l1", access: 7 }] },
    { type: "switch", endpoint: "l2", features: [{ name: "state", property: "state_l2", access: 7 }] },
    { type: "switch", endpoint: "l3", features: [{ name: "state", property: "state_l3", access: 7 }] }
  ];
  assert.equal(detectDeviceCategory(relay), "switch");
  assert.equal(detectDeviceCategory(wallSwitch), "switch");

  // Diğer standart tipler olduğu gibi geçer.
  assert.equal(detectDeviceCategory([{ type: "cover" }]), "cover");
  assert.equal(detectDeviceCategory([{ type: "lock" }]), "lock");
  assert.equal(detectDeviceCategory([{ type: "climate" }]), "climate");
  assert.equal(detectDeviceCategory([{ type: "fan" }]), "fan");
});

test("tanım yoksa ya da yalnız jenerik tipler varsa cihaz belirsiz kalır", () => {
  assert.equal(detectDeviceCategory(undefined), "unknown");
  assert.equal(detectDeviceCategory([]), "unknown");
  assert.equal(detectDeviceCategory("bozuk"), "unknown");
  // Kapı sensörü: yalnız `binary`/`numeric` — lamba ya da anahtar diye zorlanmaz.
  assert.equal(
    detectDeviceCategory([
      { type: "binary", name: "contact", property: "contact", access: 1 },
      { type: "numeric", name: "battery", property: "battery", access: 1 }
    ]),
    "unknown"
  );
  // Kumanda: yalnız `enum` action.
  assert.equal(detectDeviceCategory([{ type: "enum", name: "action", property: "action", access: 1 }]), "unknown");
});

test("karışık tanımda daha özel tip kazanır", () => {
  // Perde motoru ayar amaçlı bir `switch` de bildirebilir; cihaz yine perdedir.
  assert.equal(detectDeviceCategory([{ type: "switch" }, { type: "cover" }]), "cover");
  // Lamba sürücüsü ek uçta `switch` bildirdiğinde lamba kalır.
  assert.equal(detectDeviceCategory([{ type: "switch" }, { type: "light" }]), "light");
});

test("kullanıcının seçtiği rol tahmini ezer, Otomatik tahmini bırakır", () => {
  assert.equal(resolveDeviceCategory("switch", "auto"), "switch");
  // Kullanıcının evinde lambayı süren bir röle: donanım anahtar der, kullanıcı lamba der.
  assert.equal(resolveDeviceCategory("switch", "light"), "light");
  assert.equal(resolveDeviceCategory("light", "switch"), "switch");
  // Belirsiz cihaz da elle sınıflandırılabilir.
  assert.equal(resolveDeviceCategory("unknown", "light"), "light");
  assert.equal(resolveDeviceCategory("unknown", "auto"), "unknown");
});

test("rol değerleri doğrulanır", () => {
  assert.equal(isDeviceRole("auto"), true);
  assert.equal(isDeviceRole("light"), true);
  assert.equal(isDeviceRole("switch"), true);
  assert.equal(isDeviceRole("cover"), false);
  assert.equal(isDeviceRole(""), false);
  assert.equal(isDeviceRole(null), false);
});
