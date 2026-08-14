import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function assertHomeLayout(projectRoot) {
  const css = await readFile(path.join(projectRoot, "public", "css", "panel.css"), "utf8");
  const html = await readFile(path.join(projectRoot, "public", "index.html"), "utf8");
  const fixedRule = css.lastIndexOf('#home [data-widget="quick"]{position:fixed');
  const flowRule = css.lastIndexOf('#home [data-widget="quick"]{position:relative');
  assert(fixedRule >= 0, "Eski hizli erisim kurali bulunamadi; gecis denetimi guncellenmeli.");
  assert(flowRule > fixedRule, "Hizli erisim bari son kuralda normal akis icinde olmali.");
  const flowBlock = css.slice(flowRule, flowRule + 1_200);
  assert(flowBlock.includes("grid-row:2"), "Hizli erisim bari kendine ayrilan ikinci satirda degil.");
  assert(flowBlock.includes("position:relative"), "Hizli erisim bari sabit katmandan ayrilmamis.");
  assert(css.includes("grid-template-rows:minmax(0,1fr) auto;row-gap:12px"), "Kart ve hizli erisim satirlari ayrilmamis.");
  assert(css.includes("(min-width:1000px)"), "1024px yatay tablet kirilimi korunmuyor.");
  assert(html.includes('data-widget="quick"'), "Hizli erisim widget'i panel isaretlemesinde bulunamadi.");
}
