// Tuya TS0601 kapı/pencere kontağı (_TZE284_u8ouaqsz).
// zigbee-herdsman-converters kütüphanesinde tanımı yok; Villa Bridge doğrudan modda bu dosyayı
// `zigbee.externalConvertersDir` klasöründen okuyup kütüphaneye kaydeder.
//
// NOT: Zigbee2MQTT için yazılmış kopyalarda sık görülen `const e = exposes.presets;` + `e.presets.contact()`
// kalıbı hatalıdır — `presets` nesnesinin altında ikinci bir `presets` yoktur ve dosya yüklenirken patlar.
// Doğrusu aşağıdaki gibi `e.contact()` / `e.battery()` çağrılarıdır.

const tuya = require("zigbee-herdsman-converters/lib/tuya");
const exposes = require("zigbee-herdsman-converters/lib/exposes");

const e = exposes.presets;
const ea = exposes.access;

module.exports = [
  {
    fingerprint: tuya.fingerprint("TS0601", ["_TZE284_u8ouaqsz"]),
    model: "TS0601_door_sensor_tze284",
    vendor: "Tuya",
    description: "Kapı/pencere kontağı (TS0601)",
    fromZigbee: [tuya.fz.datapoints],
    toZigbee: [tuya.tz.datapoints],
    configure: tuya.configureMagicPacket,
    exposes: [
      e.contact(),
      e.battery(),
      e.battery_low(),
      exposes
        .binary("tamper", ea.STATE, true, false)
        .withDescription("Cihaz kurcalandı."),
      exposes
        .numeric("battery_voltage", ea.STATE)
        .withUnit("mV")
        .withDescription("Pil gerilimi.")
    ],
    meta: {
      tuyaDatapoints: [
        [1, "contact", tuya.valueConverter.inverse],
        [2, "battery", tuya.valueConverter.raw],
        [3, "battery_low", tuya.valueConverter.trueFalse1],
        [4, "tamper", tuya.valueConverter.trueFalse1],
        [10, "battery_voltage", tuya.valueConverter.raw]
      ]
    }
  }
];
