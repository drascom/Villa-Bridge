import assert from "node:assert/strict";
import test from "node:test";
import { readPanelSource } from "./panel-source.js";

/*
 * Cihaz detayının alt satırı sınanıyor: "Cihazı kaldır" ile "Kapat/Kurulumu bitir" aynı satırda
 * yan yana. Kritik nokta yetki: kaldırmanın kabı `data-admin-only`, kapatmanınki DEĞİL — ev
 * sakini oturumunda (`body.resident-session [data-admin-only]{display:none!important}`) kaldırma
 * kaybolur, kapatma görünür kalır. Kopya mantık yazılmıyor; `deviceDetailBodyHtml` bildirimi
 * panelden çıkarılıp sahte bağımlılıklarla çalıştırılıyor.
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

async function renderDetailBody(fromPairing = false): Promise<string> {
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
    state: { detailTechnicalOpen: false, detailFromPairing: fromPairing }
  })({
    id: "0x00124b0022334455",
    name: "Salon lambası",
    sourceName: "zigbee",
    model: "TRADFRI bulb",
    controls: [],
    state: {}
  });
}

/** Alt satırın kendisi: açılış etiketinden eşleşen kapanışına kadar. */
function footerHtml(html: string): string {
  const start = html.indexOf('<div class="card-actions card-actions-footer">');
  assert.ok(start >= 0, "alt satır bulunamadı");
  let depth = 0;
  const tags = /<div\b[^>]*>|<\/div>/g;
  tags.lastIndex = start;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  assert.fail("alt satırın kapanışı bulunamadı");
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

test("kaldırma ve kapatma düğmeleri detayın aynı alt satırında yan yana durur", async () => {
  const footer = footerHtml(await renderDetailBody());

  // Tek satır, iki kap: önce kaldırma (sol), sonra kapatma (sağ).
  assert.ok(footer.includes('data-remove="0x00124b0022334455"'));
  assert.ok(footer.includes("data-close-detail"));
  assert.ok(footer.indexOf("data-remove=") < footer.indexOf("data-close-detail"));
  // Satır dışında ikinci bir kopya yok.
  const html = await renderDetailBody();
  assert.equal(html.split("data-close-detail").length - 1, 1);
  assert.equal(html.split("data-remove=").length - 1, 1);
  assert.equal(html.split("card-actions-footer").length - 1, 1);
});

test("kapatma düğmesi `data-admin-only` kabının içinde değil", async () => {
  const footer = footerHtml(await renderDetailBody());
  const closeIndex = footer.indexOf("data-close-detail");
  const dangerEnd = footer.indexOf("</div>", footer.indexOf("card-actions-danger"));

  // Yönetici kabı kapatma düğmesinden önce kapanır: kapatma onun torunu olamaz.
  assert.ok(dangerEnd >= 0 && dangerEnd < closeIndex);
  assert.ok(!/data-admin-only[^>]*>\s*<button[^>]*data-close-detail/.test(footer));
  assert.ok(footer.startsWith('<div class="card-actions card-actions-footer">'));
  assert.ok(!/<div class="card-actions card-actions-footer"[^>]*data-admin-only/.test(footer));
});

test("ev sakini oturumunda kaldırma gizlenir, kapatma görünür kalır", async () => {
  const resident = hideAdminOnly(footerHtml(await renderDetailBody()));

  assert.ok(!resident.includes("data-remove="));
  assert.ok(!resident.includes("card-actions-danger"));
  assert.ok(resident.includes("data-close-detail"));
  // Kapatma kabı ayakta: satır tek başına kalsa da düğme çizilmeye devam eder.
  assert.ok(resident.includes('<div class="card-actions-done">'));

  // Eşleştirme sonrası metin de aynı düğmede: ev sakini kurulumu bitirebilir.
  const afterPairing = hideAdminOnly(footerHtml(await renderDetailBody(true)));
  assert.ok(afterPairing.includes("finishSetup"));
});

test("alt satırın ölçüleri clamp ile tabanlanır; dokunma hedefi 44px'in altına düşmez", async () => {
  const styles = await readPanelSource();

  assert.match(
    styles,
    /\.card-actions-footer\{align-items:stretch;gap:clamp\(10px,1\.4vw,16px\);margin-top:clamp\(12px,1\.8vh,18px\);padding-top:clamp\(12px,1\.8vh,18px\);border-top:1px solid var\(--line\)\}/
  );
  assert.match(styles, /\.card-actions-footer>div>button\{flex:1 1 auto;width:100%;min-height:clamp\(44px,7vh,52px\)\}/);
  // Dar ekranda alt alta düşmeleri serbest: `.card-actions` zaten sarıyor, footer bunu bozmuyor.
  assert.match(styles, /\.card-actions\{display:flex;flex-wrap:wrap/);
  assert.ok(!/\.card-actions-footer[^{]*\{[^}]*color-mix\(/.test(styles));
});
