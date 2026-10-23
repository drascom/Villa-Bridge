# Villa Bridge UI Proto

Bu klasör, üretim panelinden bağımsız yeni arayüz yönünü denemek içindir. Gerçek Villa Bridge
API’lerine, Zigbee koordinatörüne, MQTT’ye veya Home Assistant’a bağlanmaz. Bütün veriler sahtedir.

## Tasarım yönü

- MagicPath’teki `Google TV Home — Clean Frame` varyantının sakin tam-ekran kompozisyonu,
  görünür olduğunda açıklama taşıyan seçimleri ve cam odak davranışı temel alındı.
- [CleanFrame](https://github.com/nthnclrk/CleanFrame) projesinin “önce içerik, sonra kontrol”
  yaklaşımı; odak dışı öğeleri sessizleştirmesi; canlı blur yerine önceden hazırlanmış görsel ve
  transform/opacity geçişleri kullanması benimsendi.
- Villa Bridge ihtiyaçları için televizyon uygulama listesi yerine favori cihazlar, hızlı sahneler,
  odalar ve rutinler yerleştirildi.
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

