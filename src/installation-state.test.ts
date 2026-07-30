import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  InstallationStateStore,
  validateInstallationState
} from "./installation-state.js";

test("yeni kurulum onboarding tamamlanmamış olarak başlar", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-installation-state-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const store = new InstallationStateStore(join(directory, "installation-state.json"));

  assert.deepEqual(await store.get(), {
    onboardingComplete: false,
    onboardingCompletedAt: null
  });
});

test("onboarding tamamlanması kurulum genelinde kalıcı ve idempotent saklanır", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "villa-installation-state-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "installation-state.json");
  const store = new InstallationStateStore(path);

  const first = await store.completeOnboarding();
  const second = await store.completeOnboarding();
  const persisted = JSON.parse(await readFile(path, "utf8"));

  assert.equal(first.onboardingComplete, true);
  assert.match(first.onboardingCompletedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(second, first);
  assert.deepEqual(persisted, first);
});

test("geçersiz kurulum durumu reddedilir", () => {
  assert.throws(() => validateInstallationState({ onboardingComplete: "yes" }));
  assert.throws(() => validateInstallationState({
    onboardingComplete: true,
    onboardingCompletedAt: "not-a-date"
  }));
});
