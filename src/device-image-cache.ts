import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeFileAtomic } from "./atomic-file.js";

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

// Upstream'de gerçekten olmayan model: uzun süre yeniden denenmez.
const notFoundRetryMs = 24 * 60 * 60 * 1000;
// Ağ/zaman aşımı hatası geçicidir: internet dönünce görsel gelsin diye kısa aralıkla,
// üst üste başarısızlıkta katlanarak geri çekilerek yeniden denenir.
const transientRetryMs = 60_000;
const transientRetryCeilingMs = 30 * 60_000;

interface NegativeCacheEntry {
  retryAt: number;
  attempts: number;
}

interface DownloadResult {
  image: { extension: string; body: Buffer } | null;
  transient: boolean;
}

const contentTypeFor = (extension: string): string =>
  extensions.find((candidate) => candidate.extension === extension)?.contentType ?? "image/jpeg";

const extensionForContentType = (header: string | null): string | null => {
  const contentType = header?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) return null;
  return extensions.find((candidate) => candidate.contentType === contentType)?.extension ?? null;
};

export class DeviceImageCache {
  private readonly missing = new Map<string, NegativeCacheEntry>();
  private warming = false;

  constructor(
    private readonly directory: string,
    private readonly warmConcurrency = 2,
    private readonly warmPauseMs = 250,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Verilen modelleri arka planda önden indirir. Aynı anda tek tur çalışır,
   * upstream'i yormamak için küçük gruplar hâlinde ve aralarında bekleyerek ilerler.
   * Hatalar yutulur; ısıtma başarısız olsa da servis etkilenmez.
   */
  async warm(models: string[]): Promise<void> {
    if (this.warming) return;
    this.warming = true;
    try {
      const pending = [...new Set(models)].filter(
        (model) => safeModelPattern.test(model) && !this.blocked(model)
      );
      for (let index = 0; index < pending.length; index += this.warmConcurrency) {
        const batch = pending.slice(index, index + this.warmConcurrency);
        await Promise.all(batch.map(async (model) => {
          try {
            await this.get(model);
          } catch (error) {
            console.error(`Cihaz görseli ön belleğe alınamadı (${model}): ${String(error)}`);
          }
        }));
        if (index + this.warmConcurrency < pending.length) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, this.warmPauseMs));
        }
      }
    } finally {
      this.warming = false;
    }
  }

  async get(model: string): Promise<DeviceImage | null> {
    if (!safeModelPattern.test(model) || model === "." || model === "..") return null;
    const cached = await this.readFromDisk(model);
    if (cached) return cached;
    if (this.blocked(model)) return null;
    const { image, transient } = await this.download(model);
    if (!image) {
      this.rememberFailure(model, transient);
      return null;
    }
    this.missing.delete(model);
    await this.writeToDisk(model, image.extension, image.body);
    return { contentType: contentTypeFor(image.extension), body: image.body };
  }

  /** Negatif önbellekteki model, yeniden deneme zamanı gelene kadar ağa çıkarılmaz. */
  private blocked(model: string): boolean {
    const entry = this.missing.get(model);
    return entry !== undefined && entry.retryAt > this.now();
  }

  private rememberFailure(model: string, transient: boolean): void {
    if (!transient) {
      this.missing.set(model, { retryAt: this.now() + notFoundRetryMs, attempts: 0 });
      return;
    }
    const attempts = (this.missing.get(model)?.attempts ?? 0) + 1;
    const delay = Math.min(transientRetryMs * 2 ** (attempts - 1), transientRetryCeilingMs);
    this.missing.set(model, { retryAt: this.now() + delay, attempts });
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

  private async download(model: string): Promise<DownloadResult> {
    let transient = false;
    for (const { extension } of extensions) {
      try {
        const response = await fetch(
          `https://www.zigbee2mqtt.io/images/devices/${encodeURIComponent(model)}.${extension}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!response.ok) {
          if (response.status !== 404) transient = true;
          continue;
        }
        const actualExtension = extensionForContentType(response.headers.get("content-type"));
        if (!actualExtension) {
          // Genelde captive portal / vekil sunucu araya girmiştir: geçici say, sonra tekrar dene.
          transient = true;
          console.error(`Cihaz görseli resim değil (${model}.${extension}): ${response.headers.get("content-type") ?? "bilinmiyor"}`);
          continue;
        }
        const body = Buffer.from(await response.arrayBuffer());
        if (body.byteLength === 0 || body.byteLength > maximumImageBytes) {
          console.error(`Cihaz görseli boyutu geçersiz (${model}.${extension}): ${body.byteLength} bayt`);
          continue;
        }
        return { image: { extension: actualExtension, body }, transient: false };
      } catch (error) {
        transient = true;
        console.error(`Cihaz görseli indirilemedi (${model}.${extension}): ${String(error)}`);
      }
    }
    return { image: null, transient };
  }

  private async writeToDisk(model: string, extension: string, body: Buffer): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true });
      const path = resolve(this.directory, `${model}.${extension}`);
      await writeFileAtomic(path, body, { mode: 0o600 });
    } catch (error) {
      console.error(`Cihaz görseli önbelleğe yazılamadı: ${String(error)}`);
    }
  }
}
