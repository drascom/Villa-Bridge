# Oturum devri — 2026-08-13/14

Bu belge, panel görünümü ve otomasyon turlarının bırakıldığı yeri anlatır. Sonraki oturum buradan
devam edebilir. Kod içindeki yorumlar ve `docs/` altındaki diğer planlar hâlâ geçerlidir.

## 1. Bu turda canlıya giren işler

Sunucu `192.168.0.91` (`/opt/villa-bridge`), dal `platform/linux`.

**Panel görünümü**
- Görünüm **iki sisteme** ayrıldı, kökteki `data-sky` işaretiyle: `fixed` (Light · Dark · System)
  ve `live` ("By the sun"). `fixed` sabit renk, gökyüzü/animasyon yok; `live` gün döngüsünü çizer.
- Kart dili: kart neredeyse şeffaf, onu **kenar** tanımlar; döşemeler havada durur (ince ışık
  çizgisi + dar temas gölgesi + yumuşak kaldırma gölgesi). Gölge yarıçapı komşu boşluğundan
  **küçük** olmalı, yoksa gölgeler birleşip "tünel" oluyor.
- `live` kipte gökyüzü paleti **temadan bağımsız**, zamanın sürekli fonksiyonu: doğuş/batış
  çevresinde 2 saatlik kızıllık, öğlede hafif altın, gece lacivert. Kart mürekkebi ve dolgusu
  `--sky-lum` (gün ışığı ekseni) üzerinden sürekli akar.
- Gökyüzü katmanları: 5 katmanlı yıldız alanı, Samanyolu kuşağı (varyant B, `--mw-a` .65),
  opak dağ silüeti, güneş ve **gerçek dokulu ay**.
- **Ay**: doku `public/assets/moon-texture.jpg` (NASA/SVS, kamu malı, kendi ikili rotası
  `src/index.ts`). Evre **maskeyle kesilir**, karanlık taraf hiç boyanmaz; hale ayrı bir dış DOM
  düğümünde `drop-shadow` ile verilir.
- **Arka plan ayarları sayfası** (`#skySettings`): solda kontroller (aside), sağda 1024×640
  oranında canlı önizleme kartı. Saat kaydırıcısı + oynat düğmesi (gün 40 sn), ay evresi
  kaydırıcısı, Samanyolu/yıldız/dağ ayarları. Ayarlar `localStorage: villa-sky`, cihaz bazında.
- **Menü** "Sheet" tasarımına geçti; her sayfada menü düğmesi menüyü açar (ana ekrana atmaz).
  Tema değişiminde ve çıkışta kendiliğinden kapanır.
- **Widget'lar**: Home status + Home activity tek kartta; üst şeritte ikonlu ev özeti
  (eski Devices/Alerts/Signal şeridi kaldırıldı). Yeni **Favoriler** widget'ı + cihaz eylem
  öğelerinde yıldız düğmesi (sunucudaki `home-favorites` altyapısı zaten vardı, panele bağlandı).
- **Döşeme genişliği**: üç kademe (küçük · orta · tam), tercih **kart bazında** saklanır
  (`kart::cihaz::kontrol`). Küçük kademe dikey düzendedir (ikon üstte, isim altta, ortalı).
- Ray kartları 1024×600'de **tam sığar** (yarım kart kalmaz), `scroll-snap` ile kart kenarına oturur.

**Otomasyon**
- Kural **çoğaltma** (liste ve düzenleme ekranından); kopya kapalı başlar ve düzenleme kipinde açılır.
- Sayısal koşul tarafı tamamlandı:
  - Birim/adım **tablo olmadan**: birim cihazın kendi bildirdiğinden, yoksa alanın adından gelir;
    adım okunan değerin büyüklüğünden türer; eşik elle yazılabilir.
  - **Tazelik penceresi** (`freshWithinSeconds`, opsiyonel): değer yalnız son N saniye içinde
    **rapor edilmişse** koşul sağlanır. Bunun için `DeviceStore`'a kanal başına **rapor damgası**
    eklendi (`reportedAt`; eski `since` yalnız değer değişince tazeleniyordu).
    Damga bellektedir → yeniden başlatmada koşul güvenli tarafa (sağlanmadı) düşer.
  - **Tetikleme anında dondurma**: kural çalışırken sayısal okumalar bir kez alınır ve çalışma
    boyunca sabit kalır (gecikmeli eylemler dahil). `autoOff` bilerek dışarıda — saatler sonra
    ateşleyebilir. Amaç: ışık yanınca lüksün değişmesiyle oluşan geri besleme döngüsünü kesmek.
  - Koşul ekleme yeri görünür oldu; aynı cihaz hem tetikleyici hem koşul olabilir (zaten
    engellenmiyordu, düğme sıfır koşulda çizilmiyordu).

**Kumanda düğmeleri**
- TS004x ailesi **binding ile bağlanamaz** (`genOnOff` cihazın GİRİŞ kümesinde). Panel artık
  kumandaları "doğrudan bağlanabilir" / "yalnız kural ile çalışır" diye ayırıyor, ikincisini kural
  sihirbazına yönlendiriyor; sunucu kurulamayacak bağlamayı `422` ile reddediyor.
- Tuya DP tabanlı cihazlarda **TOGGLE desteklenmiyor** ama exposes öyle iddia ediyor
  (`Key 'TOGGLE' not found in: [ON, OFF]`). `setDevice` katmanında yedek: TOGGLE reddedilirse
  köprü bilinen son durumun tersini yazar. `direct` kipi içindir.

**Temizlik**
- Depoda ölü CSS/JS/i18n temizlendi, yanlış kalmış yorumlar düzeltildi, `CLAUDE.md`/`AGENTS.md`
  iki sistemli mimariye göre güncellendi.
- Yerelde build çıktıları ve `node_modules` silindi (~1.35 GB). **Yeni oturumda `npm install` şart.**
- Sunucudaki `*.bak-*` deploy yedekleri silindi ve **yedek alma yordamdan çıkarıldı**
  (kullanıcı kararı): geri dönüş yolu git.

## 2. Yarım kalanlar / sıradaki işler

1. **Sihirbazın sıkışık yeniden tasarımı.** Kullanıcının şikâyeti: koşullar ve süreler çok yer
   kaplıyor, sayfa aşağı kayıyor; "bekleme süresi için üç satır gerekmemeli, tek satırda
   halledilmeli", "tıklayınca kendi içinde değer girilebilmeli". Mockup hazırlanıyordu
   (bkz. §3). Karar verilmedi.
2. **`public/js/panel-automation.js` bölme (~3600 satır).** Kullanıcı modüllere ayrılmasını
   istiyor: "genel iş akışı" ile "cihaza özel motor" ayrı dosyalarda. Plan çıkarılıyordu (§3).
   Kural: **davranış değişmeyecek**; panel dosyası eklemek `index.html` script sırası +
   `src/index.ts` `panelAssetRoutes` ikisini birden gerektirir, `npm run check` denetler.
   Önerilen sıra: önce mekanik bölme, sonra sihirbaz yenilemesi (yeniden yazım küçük dosyalarda
   daha güvenli).
3. **Jeneriklik kuralı** (kullanıcı açıkça istedi): cihaza özel motor **model/üretici adına ya da
   sabit alan listesine bakmayacak**; yetenek cihazın kendi bildirdiği modelden okunacak.
   Alan bazlı tablolar yalnız kozmetik (etiket/çeviri) olabilir ve jenerik yedeği olmalı.
   Bugünkü sayısal keşif zaten jenerik (`device.state` içindeki sayı olan alanlar).
4. **Tablet kurulumu.** Bugünün hiçbir sürümü tablete kurulamadı (cihaz USB'de görünmedi).
   Bağlanınca `npm run android:install`.
5. **Android yön kilidi** (`dc5a64b`) depoda duruyor ama tablete kurulmadı: telefon dikeye
   kilitlenir, tablet serbest kalır (`sw600dp`; Nokia T10 = 640dp).
6. Gündüz–gece geçişinde yanan döşemenin parlaklık farkı büyüdü (.82 → .13). Rahatsız ederse
   gece bandı bir tık yukarı çekilebilir.

## 3. Bu oturumun kalıcılaştırılan çalışma dosyaları

Mockup ve plan dosyaları oturum scratchpad'indeydi ve oturumla birlikte silinir. Karar bekleyenler
`docs/` altına alındı:

- **`docs/mockups/otomasyon-sihirbazi-sikisik-mockup.html`** — sihirbazın sıkışık düzeni için iki
  varyant, tarayıcıda açılır (tek dosya, dış kaynak yok). Ölçümler sayfa açılırken gerçekten
  ölçülüyor, elle yazılmadı:
  - **Bugün**: tek sayısal koşul adımı ≈ 749 px içerik / 369 px görünür alan → ~380 px kayıyor.
    Tek başına eşik kadranı 200 px; "5 dakika bekle" bloğu 173 px (3 satır).
  - **Varyant A — cümle içinde düzenleme**: kural tek cümle, parçalarına dokununca altında sabit
    boyda küçük kadran açılır. Cümle ≈ 150–160 px, kadran açıkken +158 px, kaydırma yok.
  - **Varyant B — satır listesi + açılır şerit**: her parça 56 px satır, dokununca altında ~104 px
    düzenleyici şerit. Liste ≈ 400 px, şerit açıkken ≈ 505 px, kaydırma yok. Süre 173 px → 56 px.
  - **Karar verilmedi.** Kullanıcı ikisine bakıp seçecek.
- **`docs/otomasyon-bolme-plani.md`** — `panel-automation.js` bölme planı (varsa; §2.2).
- Yayınlanan önizlemeler (Artifact, kullanıcının hesabında, karar verilmiş ve uygulanmış):
  menü tasarım yönleri, Samanyolu varyantları, ay evresi tezgâhı.

## 4. Evle ilgili sabit bilgiler (koda bakmadan lazım olanlar)

- `Corridor Detector` (`0xa4c1389eef9ade7e`, TS0601 mmWave): `presence` + `illuminance` yayınlar —
  lüks koşullu kuralın donanımı budur.
- `Koridor PIR` (ZG-204Z): yalnız `occupancy` + `battery`, **lüks yok**.
- Evde `illuminance` yayınlayan üç cihaz var, üçü de mmWave varlık sensörü. Snapshot'ta
  `temperature`/`humidity` yayınlayan cihaz yok.
- Panelin sayısal koşul satırı, cihaz o değeri **en az bir kez rapor etmişse** görünür.
