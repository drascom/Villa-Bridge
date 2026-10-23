# Villa Bridge UI Proto

Bu klasör, üretim panelinden bağımsız yeni arayüz yönünü denemek içindir. Arayüz aynı kökendeki
Villa Bridge API’sinden cihazları, favorileri, odaları ve otomasyonları okur. Favori seçimi mevcut
`/api/favorites` kaydına yazılır; elle çalıştırılan rutinler mevcut otomasyon motorunu çağırır.
Tarayıcı Zigbee koordinatörüne, MQTT’ye veya Home Assistant’a doğrudan bağlanmaz.

## Tasarım yönü

- MagicPath’teki `Google TV Home — Clean Frame` varyantının sakin tam-ekran kompozisyonu,
  görünür olduğunda açıklama taşıyan seçimleri ve cam odak davranışı temel alındı.
- [CleanFrame](https://github.com/nthnclrk/CleanFrame) projesinin “önce içerik, sonra kontrol”
  yaklaşımı; odak dışı öğeleri sessizleştirmesi; canlı blur yerine önceden hazırlanmış görsel ve
  transform/opacity geçişleri kullanması benimsendi.
- Villa Bridge ihtiyaçları için televizyon uygulama listesi yerine favori cihazlar, hızlı sahneler,
  odalar ve rutinler yerleştirildi.
- Ev ekranındaki favoriler düzenlenebilir; oda panelleri canlı cihaz/kontrol üyeliklerini gösterir.
- Rutinler ile hızlı sahneler yalnız gerçek `manual:true` otomasyonlardan üretilir; otomatik
  çalışan kurallar günlük ev görünümüne karışmaz.
- Ayrıntılar ana sayfayı terk etmek yerine sağdan `%60` genişliğinde açılır.
- Yönetici girişi günlük ev kullanımından ayrıdır.

## Rive

`rive/focus-aura/` Rive CLI kaynak projesidir. Üretilen `assets/rive/focus-aura.riv`, odaklanan
kontrolün arkasındaki yumuşak ışığı verir. Kontrollerin asıl hareketi CleanFrame prensibine uygun
olarak yalnız `transform` ve `opacity` ile yapılır. Sekme görünmez olduğunda veya hareket kapalıyken
Rive durdurulur.

Yeniden üretmek için:

```sh
/Users/drascom/.rive/bin/rive ui-proto/rive/focus-aura --verify
/Users/drascom/.rive/bin/rive ui-proto/rive/focus-aura --once --output-dir=../../assets/rive
```

## Görselleri değiştirme

Varsayılan görsel `assets/backgrounds/villa-twilight.jpg` dosyasıdır. Kendi fotoğrafınızı aynı
oranla ekleyip `styles.css` içindeki iki referansı değiştirebilirsiniz. Görsel, bu prototip için
OpenAI ImageGen ile üretildi; CleanFrame veya MagicPath fotoğrafları kopyalanmadı.

## Yerel önizleme

Bu yalnızca statik bir önizlemedir; Villa Bridge sunucusunu başlatmaz:

```sh
python3 -m http.server 4399 --directory ui-proto
```

Ardından `http://127.0.0.1:4399/` adresini açın.

