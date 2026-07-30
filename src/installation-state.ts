import { readFile, rename, writeFile } from "node:fs/promises";

export interface InstallationState {
  onboardingComplete: boolean;
  onboardingCompletedAt: string | null;
}

const emptyInstallationState = (): InstallationState => ({
  onboardingComplete: false,
  onboardingCompletedAt: null
});

export const validateInstallationState = (value: unknown): InstallationState => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Kurulum durumu geçersiz.");
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.onboardingComplete !== "boolean") {
    throw new Error("Kurulum tamamlanma durumu geçersiz.");
  }
  const completedAt = candidate.onboardingCompletedAt;
  if (completedAt !== null && (
    typeof completedAt !== "string"
    || Number.isNaN(Date.parse(completedAt))
  )) {
    throw new Error("Kurulum tamamlanma zamanı geçersiz.");
  }
  return {
    onboardingComplete: candidate.onboardingComplete,
    onboardingCompletedAt: candidate.onboardingComplete ? completedAt : null
  };
};

export class InstallationStateStore {
  constructor(private readonly path: string) {}

  async get(): Promise<InstallationState> {
    try {
      return validateInstallationState(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyInstallationState();
      throw error;
    }
  }

  async completeOnboarding(): Promise<InstallationState> {
    const current = await this.get();
    if (current.onboardingComplete) return current;
    const value: InstallationState = {
      onboardingComplete: true,
      onboardingCompletedAt: new Date().toISOString()
    };
    const temporary = `${this.path}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.path);
    return value;
  }
}
