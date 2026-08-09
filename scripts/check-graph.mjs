/*
 * Yapisal tutarlilik kapisi. Test degil; panelin ve calisma zamani paketinin
 * kendi icinde tutarli kaldigini dogrular:
 *   - panel dosyalari <-> index.html <-> src/index.ts icindeki panelAssetRoutes kaymasi,
 *     ayristirilamayan panel dosyasi, iki dosyada ayni ust duzey ad (panel-graph.mjs),
 *   - apps/runtime modul grafiginde eksik yerel modul (runtime-module-graph.mjs).
 * Paket listesi (requiredFiles) denetimi paketleme adiminda kalir: npm run android:prepare.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPanelGraph } from "./panel-graph.mjs";
import { assertRuntimeModuleGraph } from "./runtime-module-graph.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const panel = await assertPanelGraph(projectRoot);
  console.log(`Panel grafigi tamam: ${panel.files.length} dosya.`);

  const runtime = await assertRuntimeModuleGraph(path.join(projectRoot, "apps", "runtime"));
  console.log(`Calisma zamani modul grafigi tamam: ${runtime.resolved.length} modul.`);
}

main().catch((error) => {
  console.error("Yapisal denetim basarisiz:", error.message ?? error);
  process.exitCode = 1;
});
