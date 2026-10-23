import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { delimiter, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const androidRoot = resolve(repositoryRoot, "apps/android");
const isWindows = process.platform === "win32";

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

const javaHome = firstExisting([
  process.env.JAVA_HOME,
  "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
  "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
]);

const androidHome = firstExisting([
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.env.HOME && resolve(process.env.HOME, "Library/Android/sdk"),
  process.env.HOME && resolve(process.env.HOME, "Android/Sdk"),
  "/opt/homebrew/share/android-commandlinetools",
  "/usr/local/share/android-commandlinetools"
]);

if (!javaHome) {
  console.error("JDK 17 not found. Set JAVA_HOME or install OpenJDK 17.");
  process.exit(1);
}
if (!androidHome) {
  console.error("Android SDK not found. Set ANDROID_HOME or install Android command-line tools.");
  process.exit(1);
}

const gradleWrapper = resolve(androidRoot, isWindows ? "gradlew.bat" : "gradlew");
const javaBin = resolve(javaHome, "bin");
const result = spawnSync(
  gradleWrapper,
  ["-p", androidRoot, "assembleDebug", ...process.argv.slice(2)],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      JAVA_HOME: javaHome,
      ANDROID_HOME: androidHome,
      ANDROID_SDK_ROOT: androidHome,
      PATH: `${javaBin}${delimiter}${process.env.PATH ?? ""}`
    },
    stdio: "inherit"
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
