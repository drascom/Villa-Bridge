import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const safeModelPattern = /^[A-Za-z0-9._-]{1,64}$/;

const extensions = [
  { extension: "jpg", contentType: "image/jpeg" },
  { extension: "png", contentType: "image/png" }
] as const;

export interface DeviceImage {
  contentType: string;
  body: Buffer;
}

const maximumImageBytes = 2 * 1024 * 1024;

const contentTypeFor = (extension: string): string =>
  extensions.find((candidate) => candidate.extension === extension)?.contentType ?? "image/jpeg";

const extensionForContentType = (header: string | null): string | null => {
  const contentType = header?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) return null;
  return extensions.find((candidate) => candidate.contentType === contentType)?.extension ?? null;
};

export class DeviceImageCache {
  private readonly missing = new Set<string>();

  constructor(private readonly directory: string) {}

  async get(model: string): Promise<DeviceImage | null> {
    if (!safeModelPattern.test(model) || model === "." || model === "..") return null;
    const cached = await this.readFromDisk(model);
    if (cached) return cached;
    if (this.missing.has(model)) return null;
    const downloaded = await this.download(model);
    if (!downloaded) {
      this.missing.add(model);
      return null;
    }
    await this.writeToDisk(model, downloaded.extension, downloaded.body);
    return { contentType: contentTypeFor(downloaded.extension), body: downloaded.body };
  }

  private async readFromDisk(model: string): Promise<DeviceImage | null> {
    for (const { extension, contentType } of extensions) {
      try {
        return { contentType, body: await readFile(resolve(this.directory, `${model}.${extension}`)) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`Cihaz görseli önbellekten okunamadı: ${String(error)}`);
        }
      }
    }
    return null;
  }

  private async download(model: string): Promise<{ extension: string; body: Buffer } | null> {
    for (const { extension } of extensions) {
      try {
        const response = await fetch(
          `https://www.zigbee2mqtt.io/images/devices/${encodeURIComponent(model)}.${extension}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!response.ok) continue;
        const actualExtension = extensionForContentType(response.headers.get("content-type"));
        if (!actualExtension) {
          console.error(`Cihaz görseli resim değil (${model}.${extension}): ${response.headers.get("content-type") ?? "bilinmiyor"}`);
          continue;
        }
        const body = Buffer.from(await response.arrayBuffer());
        if (body.byteLength === 0 || body.byteLength > maximumImageBytes) {
          console.error(`Cihaz görseli boyutu geçersiz (${model}.${extension}): ${body.byteLength} bayt`);
          continue;
        }
        return { extension: actualExtension, body };
      } catch (error) {
        console.error(`Cihaz görseli indirilemedi (${model}.${extension}): ${String(error)}`);
      }
    }
    return null;
  }

  private async writeToDisk(model: string, extension: string, body: Buffer): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true });
      const path = resolve(this.directory, `${model}.${extension}`);
      const temporary = `${path}.tmp-${process.pid}`;
      await writeFile(temporary, body, { mode: 0o600 });
      await rename(temporary, path);
    } catch (error) {
      console.error(`Cihaz görseli önbelleğe yazılamadı: ${String(error)}`);
    }
  }
}
