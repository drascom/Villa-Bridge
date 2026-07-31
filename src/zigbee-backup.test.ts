import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyPendingZigbeeNetworkRestore,
  createZigbeeNetworkBackup,
  stageZigbeeNetworkRestore,
  validateZigbeeNetworkBackup
} from "./zigbee-backup.js";

test("Zigbee ağ yedeği bütünlük bilgisiyle oluşturulup geri yüklenir", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-zigbee-backup-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "coordinator_backup.json"), '{"network_key":[1,2,3]}');
  await writeFile(join(directory, "database.db"), "device database");
  await writeFile(join(directory, "state.json"), '{"0x1":{"state":"ON"}}');

  const backup = await createZigbeeNetworkBackup(directory);
  validateZigbeeNetworkBackup(backup);
  await writeFile(join(directory, "database.db"), "changed database");
  await stageZigbeeNetworkRestore(directory, backup);

  assert.equal(await applyPendingZigbeeNetworkRestore(directory), true);
  assert.equal(await readFile(join(directory, "database.db"), "utf8"), "device database");
  assert.equal(
    await readFile(join(directory, "before-last-restore", "database.db"), "utf8"),
    "changed database"
  );
  assert.equal(await applyPendingZigbeeNetworkRestore(directory), false);
});

test("değiştirilmiş veya eksik Zigbee yedeği reddedilir", async () => {
  assert.throws(
    () => validateZigbeeNetworkBackup({
      format: "villa-bridge-zigbee-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      files: {}
    }),
    /eksik/
  );
  assert.throws(
    () => validateZigbeeNetworkBackup({
      format: "villa-bridge-zigbee-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      files: {
        "coordinator_backup.json": { data: "e30=", sha256: "wrong" },
        "database.db": { data: "e30=", sha256: "wrong" }
      }
    }),
    /bütünlük/
  );
});
