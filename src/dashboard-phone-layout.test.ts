import assert from "node:assert/strict";
import test from "node:test";
import { panelMarkup, panelStyles } from "./panel-source.js";

/*
 * Panel duvar tableti (1024×640) için tasarlandı; telefonda (360–430px dikey) dört kırık vardı:
 * alt sekme şeridi sayfa akışına düşüyordu, başlık üç satıra yayılıyordu, dört başlık düğmesinden
 * ikisi taşıp kayboluyordu ve tipografi tablet ölçüsünde kalıyordu. Buradaki iddialar onarımın
 * TELEFONDA geçerli olduğunu — yani kuralın telefon medya kapısının İÇİNDE durduğunu — sınar;
 * dosyada bir yerde geçiyor olması yetmez. Son iki test tabletin (yatay bloklar) hiç
 * değişmediğini doğrular.
 */

const PHONE_GATE = "@media(orientation:portrait) and (max-width:560px){";

/** Telefon kapısının gövdeleri, süslü parantez sayılarak çıkarılır. */
function phoneBodies(styles: string): string[] {
  const bodies: string[] = [];
  let from = 0;
  for (;;) {
    const start = styles.indexOf(PHONE_GATE, from);
    if (start < 0) break;
    let depth = 1;
    let index = start + PHONE_GATE.length;
    while (index < styles.length && depth > 0) {
      if (styles[index] === "{") depth += 1;
      else if (styles[index] === "}") depth -= 1;
      index += 1;
    }
    assert.equal(depth, 0, "telefon bloğunun süslü parantezleri kapanmıyor");
    bodies.push(styles.slice(start + PHONE_GATE.length, index - 1));
    from = index;
  }
  assert.ok(bodies.length > 0, "telefon medya kapısı bulunamadı");
  return bodies;
}

/** Telefon genişliğinde geçerli olan bütün kurallar (eski blok + onarım bloğu). */
const phoneRules = (styles: string): string => phoneBodies(styles).join("\n");

/** Yalnız bu görevde eklenen onarım bloğu; ölçü/format iddiaları buraya bakar. */
function repairBlock(styles: string): string {
  const body = phoneBodies(styles).find((candidate) => candidate.includes("#home .home-heading{display:contents}"));
  assert.ok(body, "telefon onarım bloğu bulunamadı");
  return body;
}

test("alt sekme şeridi telefon genişliğinde de sabit: kural yatay kipe hapsolmuş değil", async () => {
  const styles = await panelStyles();
  const phone = phoneRules(styles);

  // Kırık buydu: `position:fixed` yalnız yatay bloktaydı, telefonda şerit sayfanın ortasına düşüyordu.
  assert.match(phone, /#home \[data-widget="quick"\]\{position:fixed;z-index:9;left:var\(--strip-inset\);right:var\(--strip-inset\);bottom:calc\(10px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(phone, /#home \[data-widget="quick"\]\{[^}]*grid-column:auto;grid-row:auto/);
  // `--strip-inset` eskiden yalnız yatay blokta tanımlıydı; tanımlanmazsa left/right geçersiz kalır.
  assert.match(phone, /#home\{--strip-inset:clamp\(10px,3\.6vw,16px\)\}/);
  // Şerit telefon ölçüsünde: sabit px değil, clamp + viewport birimi.
  assert.match(phone, /#home \[data-widget="quick"\]\{[^}]*height:clamp\(64px,10vh,76px\)/);
  // Gövde şeridin altında kalmaz: ana ekranın alt boşluğu şerit payı kadar, güvenli alan dahil.
  assert.match(phone, /body\[data-active-view="home"\] main\{padding-bottom:calc\(104px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(phone, /body\[data-active-view="home"\] \.toast\{bottom:calc\(104px \+ env\(safe-area-inset-bottom\)\)\}/);
  // Şerit akıştan çıktığı için pano satırları DOM sırasına döner; boş satır + boşluk kalmaz.
  assert.match(phone, /#home \.home-hub,#home \.group-panel,#home \.widget-rail\{grid-column:1\/-1;grid-row:auto\}/);
  // Şeridin dokunma hedefleri 44px'in altına inmez.
  assert.match(phone, /#home \.quick-grid\.grid-view,#home \.quick-grid\.grid-view \.quick-card,#home \.strip-row>\.quick-card-add\{height:clamp\(46px,7vh,56px\)\}/);
  assert.match(phone, /#home \.strip-row>\.quick-card-add\{width:clamp\(48px,13vw,58px\);min-width:48px\}/);
  // 56px'lik min-height şeridi telefonda büyütüyordu; sıfırlanmazsa height kuralı işlemez.
  assert.match(phone, /#home \.quick-control-widget \.quick-card\{min-height:0/);
});

test("başlık telefonda tek satıra toplanır: menü, başlık ve eylemler aynı sırada", async () => {
  const styles = await panelStyles();
  const phone = phoneRules(styles);

  // Üç satırlık krom `display:block`tan geliyordu; telefonda üç sütunlu tek satır ızgarası olur.
  assert.match(phone, /#home \.page-head\{[^}]*display:grid;grid-template-columns:auto minmax\(0,1fr\) auto;align-items:center/);
  // Metrikleri ikinci sıraya indirebilmenin tek yolu: başlık kutusu ızgaraya saydamlaşsın.
  assert.match(phone, /#home \.home-heading\{display:contents\}/);
  assert.match(phone, /#home \.page-head>\.app-menu-button\{grid-column:1;grid-row:1/);
  assert.match(phone, /#home \.page-head \.eyebrow\{grid-column:2;grid-row:1;[^}]*white-space:nowrap/);
  assert.match(phone, /#home \.home-actions\{grid-column:3;grid-row:1/);
  // Metrikler ("Devices · Alerts · Signal") düğmeleri düşürmez, ikinci sıraya iner.
  assert.match(phone, /#home \.home-title-line\{grid-column:1\/-1;grid-row:2/);
  // Blok, `display:block` yazan dar ekran bloklarından SONRA gelmeli; kazanan sıra.
  const narrowHead = styles.indexOf('#home .page-head{display:block;margin-bottom:var(--home-head-gap,12px)}');
  const phoneGate = styles.indexOf(`${PHONE_GATE}\n`);
  assert.ok(narrowHead > 0 && phoneGate > narrowHead, "telefon bloğu dar ekran bloklarından önce geliyor");
  assert.ok(styles.indexOf("@media(orientation:portrait){") < phoneGate);
});

test("dört başlık düğmesi telefonda da çizilir, hiçbiri gizlenmez", async () => {
  const [markup, styles] = await Promise.all([panelMarkup(), panelStyles()]);
  const phone = phoneRules(styles);

  // Dördün dördü de belgede: hamburger + Ekle + Düzenle + Otomasyon.
  const actions = /<div class="home-actions">([\s\S]*?)<\/div><\/header>/.exec(markup);
  assert.ok(actions, "ana ekran eylem grubu bulunamadı");
  assert.equal((actions[1].match(/<button /g) ?? []).length, 3);
  assert.match(actions[1], /id="addWidget"/);
  assert.match(actions[1], /id="editDashboard"/);
  // Dördüncüsü buydu; telefonda taşıp kayboluyordu.
  assert.match(actions[1], /id="homeAutomations"[^>]*data-view-link="automations"/);
  assert.match(markup, /<header class="page-head"><button class="app-menu-button" type="button" data-app-menu/);

  // Telefonda hiçbiri gizlenmiyor ve sarma kapalı: dördü de aynı satırda kalır.
  assert.match(phone, /#home \.home-actions\{[^}]*flex-wrap:nowrap/);
  assert.match(phone, /#home \.home-actions button\{display:grid;place-items:center;flex:none\}/);
  assert.doesNotMatch(phone, /\.home-actions[^{]*\{[^}]*display:none/);
  assert.doesNotMatch(phone, /#homeAutomations|#addWidget|#editDashboard/);
  // Sığdırma küçültmeyle yapılır ama dokunma hedefi tabanı 44px'in altına inmez.
  assert.match(phone, /#home \.page-head\{--head-action-h:clamp\(44px,12\.6vw,52px\);--head-action-w:var\(--head-action-h\)/);
});

test("telefon tipografisi ekrana iner, ölçüler clamp + viewport birimiyle verilir", async () => {
  const styles = await panelStyles();
  const phone = repairBlock(styles);

  // Saat bloğu ekranın dörtte biriydi: taban 34→30, tavan 66→44 ve ölçü yükseklik yerine genişlikten.
  assert.match(phone, /#home \.home-hub\{--hub-time-size:clamp\(39px,13\.5vw,57px\)/);
  assert.match(phone, /#home \.hub-date\{font-size:clamp\(16px,4\.4vw,20px\)\}/);
  assert.match(phone, /#home \.hub-w-temp\{font-size:clamp\(29px,9\.1vw,39px\)\}/);
  assert.match(phone, /#home \.widget-card h2\{font-size:clamp\(16px,4\.4vw,20px\)\}/);
  assert.match(phone, /#home \.summary-row strong,#home \.widget-value strong\{font-size:clamp\(24px,7\.4vw,32px\)\}/);
  assert.match(phone, /\.page-head-title h1\{font-size:clamp\(19px,5\.4vw,26px\)\}/);
  assert.match(phone, /\.section-head h2\{font-size:clamp\(18px,5vw,22px\)\}/);

  // Blokta ne `color-mix()` var ne de tek başına sabit px ölçekli yazı tipi.
  assert.doesNotMatch(phone, /color-mix\(/);
  assert.doesNotMatch(phone, /font-size:\d+(\.\d+)?px/);
});

test("telefon onarımı tablet yatay kipine hiç girmez", async () => {
  const styles = await panelStyles();
  const phone = repairBlock(styles);

  // Telefon bloğu portre kapısında; yatay koşul da masaüstü koşulu da içermez.
  assert.doesNotMatch(phone, /orientation:landscape/);
  assert.doesNotMatch(styles, /@media\(orientation:portrait\)[^{]*\(min-width:1000px\)/);
  assert.doesNotMatch(styles, /@media\(orientation:portrait\)[^{]*\(max-height:900px\)/);
  // 1024×640, 1280×800 ve 800×480 yataydır: `max-width:560px` kapısı zaten dışarıda bırakır.
  assert.match(styles, /VARSAYIM[\s\S]{0,400}TELEFON DİKEY KALIR/);
});

test("tabletin 1024×640 kuralları olduğu gibi duruyor", async () => {
  const styles = await panelStyles();

  // Yatay şerit ölçüleri, sabit şerit payı ve iki sütunlu pano — hiçbiri değişmedi.
  assert.match(styles, /@media\(orientation:landscape\) and \(max-height:900px\),\(orientation:landscape\) and \(min-width:1000px\)\{#home \[data-widget="quick"\]\{height:76px\}/);
  assert.match(styles, /#home \.quick-grid\.grid-view,#home \.quick-grid\.grid-view \.quick-card,#home \.strip-row>\.quick-card-add,#home \.strip-row>\.quick-scroll-hint\{height:56px\}/);
  assert.match(styles, /#home\{--hub-column:340px;--rail-column:calc\(\(100vw - 410px\)\/3\);--strip-inset:20px;--home-top:14px;--home-head-gap:clamp\(12px,2\.8vh,26px\)\}/);
  assert.match(styles, /#home\.active\{min-height:0;display:flex;flex-direction:column;height:calc\(100dvh - var\(--home-top\) - 106px - env\(safe-area-inset-bottom\)\)\}/);
  assert.match(styles, /#home \.widget-board\{flex:1 1 auto;min-height:150px;max-height:660px/);
  assert.match(styles, /#home \.home-hub\{--hub-time-size:clamp\(39px,8\.6vh,68px\);--hub-gap:clamp\(5px,1vh,10px\)/);
  // Başlık düğmelerinin kök ölçüsü (tablet hapı) telefona uydurulmadı; küçültme `#home .page-head` altında.
  assert.match(styles, /--head-action-h:clamp\(60px,9\.4vh,64px\);--head-action-w:clamp\(72px,8\.6vw,96px\);--head-action-gap:clamp\(12px,1\.6vw,20px\)/);
  assert.match(styles, /\.home-hub\{--hub-time-size:clamp\(44px,9\.9vh,86px\)/);
  // Yatay blokta başlık üç sütunlu ızgara olarak kalır; telefonun `display:contents`i oraya sızmadı.
  const landscapeHead = /@media\(orientation:landscape\) and \(min-width:901px\)[^{]*\{[^]*?#home \.page-head\{align-items:center\}/.exec(styles);
  assert.ok(landscapeHead, "yatay başlık kuralı değişmiş");
  assert.doesNotMatch(styles, /@media\(orientation:landscape\)[^{]*\{[^@]*#home \.home-heading\{display:contents\}/);
});
