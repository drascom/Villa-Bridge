import assert from "node:assert/strict";
import test from "node:test";
import { panelMarkup, panelStyles } from "./panel-source.js";

/*
 * Ana ekranın başlık eylemleri (pano düğmesi ekle · düzenle · otomasyon) dolgulu haptı;
 * fotoğraf zeminin üstünde üç ağır leke gibi duruyordu. Artık saydamlar: dolgu yok, ikonu
 * ince çerçeve + ters renkli hale taşıyor ve ikon bir tık büyük. Buradaki iddialar (a) yeni
 * biçimin gerçekten KAZANDIĞINI — yani dolguyu yazan bloklardan SONRA geldiğini, (b) dokunma
 * hedefinin küçülmediğini, (c) menü düğmesi ile alt sayfa döşemelerinin hiç değişmediğini
 * sınar.
 */

const MARKER = "/* ANA EKRAN EYLEM DÜĞMELERİ";

/** Bu görevde eklenen son blok; ölçü iddiaları yalnız buraya bakar. */
function actionBlock(styles: string): string {
  const start = styles.indexOf(MARKER);
  assert.ok(start > 0, "ana ekran eylem düğmesi bloğu bulunamadı");
  return styles.slice(start);
}

/** Yorumlar çıkarılmış hâli: "şu seçici blokta geçmiyor" iddiaları açıklama metnine takılmasın. */
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("üç eylem düğmesi saydam: dolgu yok, ikonu ince çerçeve tutuyor", async () => {
  const [markup, styles] = await Promise.all([panelMarkup(), panelStyles()]);
  const block = actionBlock(styles);

  // Kapsam üç düğme: pano düğmesi ekle, düzenle, otomasyon.
  const actions = /<div class="home-actions">([\s\S]*?)<\/div><\/header>/.exec(markup);
  assert.ok(actions, "ana ekran eylem grubu bulunamadı");
  assert.equal((actions[1].match(/<button /g) ?? []).length, 3);

  // Dolgu saydam, kenar ince, hale kontrastı taşır.
  assert.match(block, /#home \.home-actions button,\s*body\[data-active-view="home"\] #home \.home-actions button\{[^}]*border:1px solid var\(--home-action-line\)[^}]*background:transparent;box-shadow:var\(--home-action-halo\)\}/);

  // Kural, dolguyu yazan iki bloktan da SONRA geliyor — yoksa cam dolgu geri kazanırdı.
  const landscapeFill = styles.indexOf('body[data-active-view="home"] #home .home-actions button{color:var(--forest);border-color:var(--home-border);background:var(--home-control)');
  const portraitReset = styles.indexOf('#home .home-actions button,body[data-active-view="home"] #home .home-actions button,#refreshButton{flex:none');
  const floatShadow = styles.indexOf('body[data-active-view="home"] #home .icon-button,body[data-active-view="home"] #home .home-actions button{box-shadow:var(--home-float-shadow)}');
  assert.ok(landscapeFill > 0 && portraitReset > 0 && floatShadow > 0, "dolgu kuralları bulunamadı");
  const blockAt = styles.indexOf(MARKER);
  assert.ok(blockAt > landscapeFill && blockAt > portraitReset && blockAt > floatShadow, "saydam blok dolgu kurallarından önce geliyor");

  // Kontrast tema başına yazılı: aydınlıkta koyu kenar + beyaz hale, karanlıkta tersi.
  assert.match(styles, /--home-action-line:rgba\(23,33,29,\.34\);--home-action-halo:none;--home-action-glyph-shadow:none/);
  assert.match(styles, /--home-action-line:rgba\(237,245,240,\.42\);--home-action-halo:none;--home-action-glyph-shadow:none/);
  // Kontrast reçetesinde `color-mix()` yok; ölçüler de sabit px değil clamp.
  assert.doesNotMatch(block, /color-mix\(/);
});

test("ikon bir tık büyüdü, hem tablette hem telefonda", async () => {
  const styles = await panelStyles();
  const block = actionBlock(styles);

  // Tablet/masaüstü: 26px sabitin yerine 28px tabanlı clamp.
  assert.match(block, /#home \.home-action-glyph\{width:clamp\(28px,3\.4vh,32px\);height:clamp\(28px,3\.4vh,32px\);filter:var\(--home-action-glyph-shadow\)\}/);
  const oldTablet = styles.indexOf("#home .home-action-glyph{width:26px;height:26px}");
  assert.ok(oldTablet > 0 && styles.indexOf(MARKER) > oldTablet, "26px kuralı yeni kuraldan sonra geliyor");

  // Telefon: 20px taban → 24px. Ölçü genişlikten alınır (dikey ekranda vh yanlış büyütür).
  assert.match(block, /@media\(orientation:portrait\) and \(max-width:560px\)\{\s*#home \.home-action-glyph\{width:clamp\(24px,6\.6vw,28px\);height:clamp\(24px,6\.6vw,28px\)\}/);
  const oldPhone = styles.indexOf("#home .home-action-glyph{width:clamp(20px,5.6vw,24px)");
  assert.ok(oldPhone > 0 && styles.lastIndexOf("clamp(24px,6.6vw,28px)") > oldPhone, "telefon ikonu eski kuralı ezmiyor");
});

test("dokunma hedefi 44px'in altına inmiyor", async () => {
  const styles = await panelStyles();
  const block = actionBlock(styles);

  // Görünüm hafifledi ama hedef alanı tabanı düğmenin kendisinde yazılı.
  assert.match(block, /#home \.home-actions button,\s*body\[data-active-view="home"\] #home \.home-actions button\{min-width:44px;min-height:44px/);
  // Kırılma noktalarının ölçüleri de tabanı koruyor: telefonda 44, tablette 60.
  assert.match(styles, /#home \.page-head\{--head-action-h:clamp\(44px,12\.6vw,52px\);--head-action-w:var\(--head-action-h\)/);
  assert.match(styles, /--head-action-h:clamp\(60px,9\.4vh,64px\);--head-action-w:clamp\(72px,8\.6vw,96px\)/);
  // Blok hiçbir yerde düğmeyi küçültmüyor: 44px dışında min ölçü yok, sabit width/height hiç yok.
  assert.doesNotMatch(block, /min-(?:width|height):(?!44px)/);
  assert.doesNotMatch(block, /#home \.home-actions button[^{]*\{[^}]*(?<!min-)(?:width|height):/);
});

test("menü düğmesi ve alt sayfa döşemeleri bu turda değişmedi", async () => {
  const styles = await panelStyles();
  const block = withoutComments(actionBlock(styles));

  // Menü düğmesi ana ekranda hâlâ cam dolgulu — koyu temada görünürlüğü için bilerek böyle.
  assert.match(styles, /body\[data-active-view="home"\] \.app-menu-button\{color:var\(--forest\);border-color:var\(--home-border\);background:var\(--home-control\);box-shadow:var\(--home-float-shadow\)\}/);
  assert.match(styles, /\.app-menu-button\{[^}]*background:var\(--forest-soft\)\}/);
  // Alt sayfaların "Cihaz ekle" / "Yeni otomasyon" döşemesi: dolgu ve 26px ikon duruyor.
  assert.match(styles, /\.page-action-tile\{[^}]*border:1px solid var\(--forest\);border-radius:999px;color:var\(--forest\);background:var\(--forest-soft\)/);
  assert.match(styles, /\.page-action-tile \.page-action-glyph\{display:block;width:26px;height:26px/);
  // "Genel görünüm" düğmesi (#refreshButton) de dışarıda.
  assert.match(styles, /#refreshButton\{width:46px;height:46px;min-width:46px\}/);
  // Yeni blok bu üç seçiciden hiçbirine dokunmuyor.
  assert.doesNotMatch(block, /app-menu-button|page-action-tile|page-action-glyph|refreshButton/);
});

test("odak halkası yerinde: saydamlık erişilebilirliği bozmuyor", async () => {
  const styles = await panelStyles();
  const block = withoutComments(actionBlock(styles));

  // Ana ekranın kuvvetli odak halkası (fotoğraf üstünde çift renk) duruyor.
  assert.match(styles, /body\[data-active-view="home"\] #home \.home-actions button:focus-visible\{outline:3px solid var\(--forest-soft\);outline-offset:2px\}/);
  assert.match(styles, /#home \.home-actions button:hover,#home \.home-actions button:focus-visible,#refreshButton:hover,#refreshButton:focus-visible\{[^}]*outline:2px solid var\(--forest-soft\)/);
  // Yeni blok hiçbir outline'ı sıfırlamıyor ve odak seçicisine karışmıyor.
  assert.doesNotMatch(block, /outline:\s*(?:0|none)/);
  assert.doesNotMatch(block, /focus-visible/);
  // Hover anlamlı kalıyor: çerçeve yeşile döner, cam dolgu geri gelir.
  assert.match(block, /#home \.home-actions button:hover,\s*body\[data-active-view="home"\] #home \.home-actions button:hover\{border-color:var\(--forest\);color:var\(--forest\);background:var\(--home-control\)\}/);
});
