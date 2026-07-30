# Geliştirmeler — zigbee2mqtt Karşılaştırması ve Durum Takibi

Son güncelleme: 2026-07-30 (H1–H5, Y1 ve Y4 düzeltmeleri sonrası)
İlgili commit: `28c2018 fix: close documented Zigbee parity bugs`
Linux birleştirme: `eaa0241 Merge documented Zigbee parity fixes`
Son çalışma doğrulaması: yerelde `npm test` 99/99 geçti

Bakış açısı: **geliştirici olmayan, basit ev kullanıcısı** — kurulum ve günlük
kullanımda fiilen hissedilen eksikler.

**Durum:** 20 madde tamamlandı · 9 madde yarım · açık doğrulanmış hata yok.

---

## ✅ Tamamlananlar

Uçtan uca doğrulandı: backend mantığı + HTTP API + arayüz + test.

| Özellik | Referans |
|---|---|
| Perde / panjur (`cover`, pozisyon + aç/kapa/dur) | `src/device-controls.ts:235-245`, `src/home-assistant-discovery.ts:76-101`, `public/index.html:590-596,610-611` |
| Termostat / TRV (`climate`, hedef sıcaklık + mod) | `src/device-controls.ts:246-254`, `src/home-assistant-discovery.ts:103-133` |
| Akıllı kilit (`lock`) | `src/device-controls.ts:255-263`, `src/home-assistant-discovery.ts:135-148` |
| Siren (`siren`) | `src/device-controls.ts:274-284`, `src/home-assistant-discovery.ts:176-189` |
| Cihaz ayar entity'leri (`number` / `select`, admin kısıtlı) | `src/device-controls.ts:285-292`, `src/home-assistant-discovery.ts:191-224`, `src/index.ts:482-484` |
| Router üzerinden eşleştirme | `src/direct-zigbee-source.ts:159-164`, `src/index.ts:243-262`, `public/index.html:249,795-802` |
| Install code ile eşleştirme | `src/direct-zigbee-source.ts:166-169`, `src/index.ts:264-276` |
| Ağ yedeği al / geri yükle (rollback kopyası dahil) | `src/zigbee-backup.ts`, `src/index.ts:662-707`, `src/direct-zigbee-source.ts:382-388` |
| Gerçek availability (Router 15 dk / pilli cihaz 36 saat) | `src/direct-zigbee-source.ts:39-50,696-713` |
| Cihaz notu | `src/device-notes.ts`, `src/index.ts:141-154` |
| Ağ haritası (router LQI komşu tabloları) | `src/direct-zigbee-source.ts:276-298`, `public/index.html:2207-2231` |
| Olay geçmişi (kalıcı, 200 kayıt) | `src/device-events.ts`, `src/device-store.ts:171-225` |
| MQTT LWT (last will) | `src/direct-zigbee-source.ts:653-658` |
| Favori / hızlı kontrol / grup için çoklu cihaz türleri | `public/index.html`, `src/dashboard-copy.test.ts` |
| Shadow mod grup kimliği normalizasyonu | `src/mqtt-source.ts`, `src/mqtt-source.test.ts` |
| Direct mod MQTT retain ve yinelenen durum debounce'u | `src/direct-zigbee-source.ts`, `src/direct-zigbee-source.test.ts` |
| Kısmi cihaz ayarlarında `null` yazımının engellenmesi | `src/index.ts`, `src/direct-zigbee-source.ts` |
| Yalnız pozisyon sunan perde için HA discovery | `src/home-assistant-discovery.ts`, `src/home-assistant-discovery.test.ts` |
| Gerçek Zigbee grubuna tek aç/kapat komutu | `src/source.ts`, `src/direct-zigbee-source.ts`, `src/mqtt-source.ts`, `src/index.ts`, `public/index.html` |
| OTA güncelleme denetimi ve direct mod ilerleme durumu | `src/source.ts`, `src/direct-zigbee-source.ts`, `src/mqtt-source.ts`, `src/index.ts`, `public/index.html` |

Komut zinciri kapalı: UI `command()` → `POST /api/devices/:id/command`
(`src/index.ts:473-517`) → `source.setDevice` → `convertSet`
(`src/direct-zigbee-source.ts:840-886`).

---

## ✅ Son kapatılan hatalar

| # | Sonuç |
|---|---|
| H1 | Favoriler, Quick Control ve dashboard grupları fan, siren, perde, kilit ve klima kontrollerini destekliyor. Kilitler güvenlik nedeniyle toplu açma komutuna dahil edilmiyor. |
| H2 | Shadow modda `group-N` kimliği z2m'in beklediği `N` değerine dönüştürülüyor. |
| H3 | Direct mod cihaz durumları yapılandırılmış `retain` değerini kullanıyor; aynı payload debounce süresinde tekrar yayınlanmıyor. |
| H4 | Yalnız gönderilen cihaz seçenekleri YAML'a yazılıyor; eksik alanlar `null` üretmiyor. |
| H5 | Pozisyon-only perdeler HA discovery'de var olmayan `state` alanına bağlanmıyor. |

---

## ⚠️ Yarım kalanlar

| # | Madde | Eksik olan |
|---|---|---|
| Y2 | Bind / unbind | Endpoint bazlı değil, kaynak/hedef hep `endpoints[0]` (çok tuşlu anahtarın 2. tuşu bağlanamaz); mevcut bind'ler `bindings: []` olduğu için görünmüyor (`src/direct-zigbee-source.ts:569`) |
| Y3 | Sahneler | UI'da `remove` yok (`public/index.html:812`); `scenes` sabit boş (`src/direct-zigbee-source.ts:595`) → kayıtlı sahneler listelenemiyor |
| Y5 | Pil azaldı uyarısı | Backend'de eşik/bildirim yok; sadece UI'da sabit kodlu %15 rozet (`public/index.html:486,639-640`) |
| Y6 | Fan | Sayısal hız HA'ya hiç gitmiyor — `src/home-assistant-discovery.ts:192` `fan:` önekini `number`'dan da dışlıyor, `percentage_*` alanları üretilmiyor |
| Y7 | Buton olayları | HA `event` bileşeni yok, sadece "Last action" sensörü (`src/home-assistant-discovery.ts:314-323`) → aynı action iki kez gelirse HA otomasyonu tetiklenmiyor |
| Y8 | Kanal değiştirme | "Cihazların yeniden eşleşmesi gerekebilir" uyarısı yok; kanal ancak süreç yeniden başlayınca uygulanıyor (`src/settings-store.ts:145`) |
| Y9 | Touchlink | `identify` yok — ampulü sıfırlamadan önce doğrulama adımı mümkün değil. scan + factory reset var (`src/direct-zigbee-source.ts:184-194`) |
| Y10 | Yeniden yapılandır | Birim testi yok; yalnız butonun varlığı test ediliyor (`src/dashboard-copy.test.ts:652`) |
| Y11 | MQTT permit_join | `bridge/request/permit_join` payload'ındaki `device` alanı yok sayılıyor (`src/direct-zigbee-source.ts:802-808`) — router seçimi sadece HTTP'de |

---

## Sıradaki iş önceliği

1. **Y2, Y3** — bind endpoint seçimi, sahne listeleme/silme
2. **Y6, Y7** — fan yüzdesi, HA `event`
3. **Y5, Y8, Y9, Y10, Y11** — pil eşiği, kanal uyarısı, touchlink identify, test, MQTT router

### Y1 uygulama notu

Dashboard grubunun aç/kapat kontrollü cihaz üyeleri gerçek bir Zigbee grubuyla
birebir eşleştiğinde `POST /api/groups/:id/command` üzerinden tek grup komutu
gönderilir. Zigbee ağına kaydedilmemiş sanal gruplar ve farklı kontrol
kümelerini karıştıran gruplar işlev kaybetmemek için cihaz-başı komut yolunu
kullanmaya devam eder.

### Y4 uygulama notu

Cihaz kartına güncelleme denetimi eklendi. Shadow mod z2m'in OTA check
isteğini kullanır; direct mod Herdsman ile sürüm uygunluğunu denetler.
Planlanmış direct güncelleme cihazın OTA isteği geldiğinde başlar ve ilerleme,
kalan süre, tamamlanma veya hata cihaz state'i üzerinden arayüze yayınlanır.

---

## Küçük notlar (kozmetik / kırılganlık)

- `POST /api/devices/:id/command` kontrolü **property** ile buluyor
  (`src/index.ts:480`); aynı property'e sahip iki kontrol olursa ilki seçilir.
  Şu an çakışma yok ama kırılgan.
- Min/max'ı olmayan `number` kontrolü UI'da 0–100 slider'a düşüyor
  (`public/index.html:611`) — gerçek aralık farklıysa yanıltıcı.
- `deviceGlyph` (`public/index.html:500`) climate/termostat ikonu içermiyor,
  "•" fallback'e düşüyor.
- `permitJoin` clamp tutarsızlığı: MQTT yolu 0-254, HTTP yolu 10-254
  (`src/index.ts:248`).
- Olay geçmişi UI'da yalnız ana ekran widget'ında **son 5** kayıt gösteriliyor
  (`public/index.html:855-860`); tam geçmiş ekranı yok.
- Ağ haritası fonksiyonunun testi yok; EndDevice'ın parent'ı ancak router
  komşu tablosunda görünürse listeleniyor.

---

## Ev kullanıcısını ilgilendirmeyen, atlanabilir eksikler

External converter desteği · `configured_reportings` raporlaması · `legacy_api` ·
ban / blocklist / passlist · çoklu adapter · `pan_id` ve network key
değiştirme · `coordinator_check` · birth/will mesaj yapılandırması ·
`bridge/request/*` ailesinin permit_join dışındaki komutları.
