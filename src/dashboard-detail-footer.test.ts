import assert from "node:assert/strict";
import test from "node:test";
import { panelMarkup, panelStyles, readPanelSource } from "./panel-source.js";

/*
 * Cihaz detayının iki eylem satırı sınanıyor:
 *  - Bakım satırı: "Cihazı kaldır" onar/yeniden yapılandır düğmesinin hemen yanında, `data-admin-only`.
 *  - Alt satır: yalnız "Kapat/Kurulumu bitir". Bu düğme gövdenin İÇİNDE değil, `#deviceDetailBody`nin
 *    kardeşi olarak belgede durur — kaydırma alanının dışında kaldığı için pencere ne kadar dolu
 *    olursa olsun erişilebilir. Yetki de burada kritik: ev sakini oturumunda
 *    (`body.resident-session [data-admin-only]{display:none!important}`) kaldırma kaybolur,
 *    kapatma görünür kalır.
 * Kopya mantık yazılmıyor; `deviceDetailBodyHtml` bildirimi panelden çıkarılıp sahte
 * bağımlılıklarla çalıştırılıyor.
 */
function extractDeclaration(source: string, name: string): string {
  const opener = new RegExp(`^  (?:const|function|async function) ${name}\\b`, "m");
  const match = opener.exec(source);
  assert.ok(match, `${name} bildirimi bulunamadı`);
  const bodyStart = match.index + match[0].length;
  const next = /^  (?:\/\*|\/\/|const |let |function |async function )/m.exec(source.slice(bodyStart));
  const end = next ? bodyStart + next.index : source.length;
  return source.slice(match.index, end).trimEnd();
}

interface DetailDevice {
  id: string;
  name: string;
  sourceName: string;
  model: string | null;
  controls: { id: string }[];
  state: Record<string, unknown>;
  otaSupported?: boolean;
}

async function renderDetailBody(otaSupported = false): Promise<string> {
  const dashboard = await readPanelSource();
  const declaration = extractDeclaration(dashboard, "deviceDetailBodyHtml");
  const factory = new Function(
    "deps",
    `const {esc,t,facts,deviceDetailPhoto,deviceRoleRowsHtml,lightPanelCoveredControls,controlHtml,` +
      `deviceButtonsHtml,lightPanelHtml,deviceNeedsName,deviceRoomsHtml,deviceVisibilityHtml,` +
      `deviceSelfHealHtml,rawLinkQuality,state}=deps;\n${declaration}\nreturn deviceDetailBodyHtml;`
  ) as (deps: Record<string, unknown>) => (device: DetailDevice) => string;
  return factory({
    esc: (value: unknown) => String(value ?? ""),
    t: (key: string) => key,
    facts: () => [],
    deviceDetailPhoto: () => "",
    deviceRoleRowsHtml: () => "",
    lightPanelCoveredControls: () => new Set(),
    controlHtml: () => "",
    deviceButtonsHtml: () => "",
    lightPanelHtml: () => "",
    deviceNeedsName: () => false,
    deviceRoomsHtml: () => "",
    deviceVisibilityHtml: () => "",
    deviceSelfHealHtml: () => "",
    rawLinkQuality: () => null,
    state: { detailTechnicalOpen: false, detailFromPairing: false }
  })({
    id: "0x00124b0022334455",
    name: "Salon lambası",
    sourceName: "zigbee",
    model: "TRADFRI bulb",
    controls: [],
    state: {},
    otaSupported
  });
}

/** Bakım satırı: açılış etiketinden eşleşen kapanışına kadar. */
function actionsHtml(html: string): string {
  const start = html.indexOf('<div class="card-actions">');
  assert.ok(start >= 0, "bakım satırı bulunamadı");
  let depth = 0;
  const tags = /<div\b[^>]*>|<\/div>/g;
  tags.lastIndex = start;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  assert.fail("bakım satırının kapanışı bulunamadı");
}

/** Ev sakini oturumunun CSS kuralını taklit eder: `data-admin-only` taşıyan öğeler kaybolur. */
function hideAdminOnly(fragment: string): string {
  const tags = /<(\/?)(div|button)\b([^>]*)>/g;
  let output = "";
  let cursor = 0;
  let hiding = -1;
  let depth = 0;
  for (let match = tags.exec(fragment); match; match = tags.exec(fragment)) {
    const closing = match[1] === "/";
    if (hiding < 0) {
      if (!closing && / data-admin-only(?=[\s>])/.test(`${match[3]}>`)) {
        output += fragment.slice(cursor, match.index);
        hiding = depth;
      }
      depth += closing ? -1 : 1;
    } else {
      depth += closing ? -1 : 1;
      if (depth === hiding) {
        hiding = -1;
        cursor = match.index + match[0].length;
      }
    }
  }
  assert.equal(hiding, -1, "gizlenen öğe kapanmadan bitti");
  return output + fragment.slice(cursor);
}

test("kaldırma düğmesi onar düğmesinin yanında, bakım satırında durur", async () => {
  const html = await renderDetailBody();
  const actions = actionsHtml(html);

  const repair = actions.indexOf("data-reconfigure=");
  const remove = actions.indexOf('data-remove="0x00124b0022334455"');
  assert.ok(repair >= 0 && remove >= 0, "onar ve kaldır aynı satırda olmalı");
  // Kaldırma onarın hemen ardında: araya başka düğme girmiyor.
  assert.ok(remove > repair);
  assert.equal(actions.slice(repair, remove).split("<button").length - 1, 1);

  // Gövdede tek kopya, alt satır artık gövdenin içinde değil.
  assert.equal(html.split("data-remove=").length - 1, 1);
  assert.equal(html.split("data-close-detail").length - 1, 0);
  assert.equal(html.split("card-actions-footer").length - 1, 0);
});

test("kaldırma OTA düğmelerinin önünde kalır, tehlike dilini taşır", async () => {
  const actions = actionsHtml(await renderDetailBody(true));

  assert.ok(actions.indexOf("data-remove=") < actions.indexOf("data-ota-check="));
  assert.match(actions, /<button class="remove" type="button" data-admin-only data-remove=/);
});

test("ev sakini oturumunda kaldırma gizlenir, not düğmesi kalır", async () => {
  const resident = hideAdminOnly(actionsHtml(await renderDetailBody()));

  assert.ok(!resident.includes("data-remove="));
  assert.ok(!resident.includes("data-reconfigure="));
  assert.ok(resident.includes("data-note="));
});

test("kapatma düğmesi gövdenin kardeşi: kaydırma alanının dışında ve yetkiden bağımsız", async () => {
  const markup = await panelMarkup();

  assert.match(
    markup,
    /<div id="deviceDetailBody" class="device-detail-body"><\/div><div class="card-actions card-actions-footer"><button id="finishDeviceDetail" class="primary" type="button" data-close-detail data-i18n="close">/
  );
  // Alt satır ne kendi ne de içindeki düğme `data-admin-only` taşır: ev sakini pencereyi kapatabilmeli.
  const start = markup.indexOf('<div class="card-actions card-actions-footer">');
  const footer = markup.slice(start, markup.indexOf("</div>", start) + 6);
  assert.ok(hideAdminOnly(footer).includes("data-close-detail"));
  assert.doesNotMatch(markup, /card-actions-footer"[^>]*data-admin-only/);
});

test("pencere ekrana sığar: gövde kendi içinde kayar, alt satır kaymaz", async () => {
  const styles = await panelStyles();

  // Pencere ve iç kutu aynı tavana bağlı; ölçü `dvh`, sabit px yok.
  assert.match(
    styles,
    /dialog\.device-detail-dialog\{width:min\(94vw,640px\);max-height:min\(92dvh,900px\);overflow:hidden\}/
  );
  assert.match(
    styles,
    /\.device-detail-modal\{max-height:min\(92dvh,900px\);display:flex;flex-direction:column;padding:24px;overflow:hidden\}/
  );
  // Kaydıran tek öğe gövde; başlık ve alt satır kaymaz.
  assert.match(
    styles,
    /\.device-detail-body\{flex:1 1 auto;min-height:0;margin-top:18px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable\}/
  );
  assert.match(styles, /\.device-detail-modal>\.device-detail-head,\.device-detail-modal>\.card-actions-footer\{flex:none\}/);

  /* Kırpılmanın sebebi: dokunmatik ekranda ortak kural iç kutuya `100dvh` veriyor, pencerenin
     kendi yüksekliği ise tarayıcı varsayılanında (ekran eksi kenar payı) kalıyordu. İkisi de
     aynı yüksekliğe sabitlenmeli. */
  assert.match(styles, /dialog#deviceDetailDialog\{height:100dvh;max-height:100dvh\}/);
  assert.match(
    styles,
    /dialog#deviceDetailDialog>\.modal\{height:100dvh;max-height:100dvh;display:flex;flex-direction:column;overflow:hidden;padding-top:clamp\(14px,3vh,26px\);padding-bottom:calc\(20px \+ env\(safe-area-inset-bottom\)\)\}/
  );
  // Telefonda da ekran birimi `dvh`: adres çubuğu açılıp kapanınca pencere taşmaz.
  assert.match(styles, /@media\(max-width:560px\)\{dialog\.device-detail-dialog\{width:100%;max-width:none;max-height:88dvh;/);
  assert.match(styles, /\.device-detail-modal\{max-height:88dvh;padding:22px 20px calc\(22px \+ env\(safe-area-inset-bottom\)\)\}/);
  // Dokunma hedefi 44px'in altına düşmez; sabit px genişlik yok.
  assert.match(styles, /\.card-actions-footer>button\{flex:0 1 clamp\(160px,28vw,320px\);min-height:clamp\(44px,7vh,52px\)\}/);
  assert.ok(!/\.device-detail-modal[^{]*\{[^}]*color-mix\(/.test(styles));
  assert.ok(!/\.card-actions-footer[^{]*\{[^}]*color-mix\(/.test(styles));
});
