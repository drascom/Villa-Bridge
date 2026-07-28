import QRCode from "qrcode";
import WebSocket from "ws";

export interface MatterStatus {
  online: boolean;
  commissioned: boolean;
  advertising: boolean;
  qrPairingCode: string;
  manualPairingCode: string;
  fabrics: Array<{ index: number; name: string }>;
  qrSvg: string;
}

interface MatterResponse {
  online?: boolean;
  commissioned?: boolean;
  advertising?: boolean;
  qrPairingCode?: string;
  manualPairingCode?: string;
  fabricInformations?: Array<{
    fabricIndex?: number;
    rootVendorName?: string;
    label?: string;
  }>;
}

export class MatterbridgeClient {
  constructor(private readonly wsUrl: string) {}

  async getStatus(): Promise<MatterStatus> {
    const response = await this.request({ id: "Matterbridge", server: true });
    return this.normalize(response);
  }

  async setCommissioning(open: boolean): Promise<MatterStatus> {
    await this.request({
      id: "Matterbridge",
      ...(open ? { startCommission: true } : { stopCommission: true })
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    return this.getStatus();
  }

  private async normalize(response: MatterResponse): Promise<MatterStatus> {
    const qrPairingCode = response.qrPairingCode ?? "";
    return {
      online: response.online === true,
      commissioned: response.commissioned === true,
      advertising: response.advertising === true,
      qrPairingCode,
      manualPairingCode: response.manualPairingCode ?? "",
      fabrics: (response.fabricInformations ?? []).map((fabric) => ({
        index: fabric.fabricIndex ?? 0,
        name: fabric.label || fabric.rootVendorName?.replace(/[()]/g, "") || "Bağlı platform"
      })),
      qrSvg: qrPairingCode
        ? await QRCode.toString(qrPairingCode, { type: "svg", margin: 1, width: 280, color: { dark: "#10233d", light: "#ffffff" } })
        : ""
    };
  }

  private async request(params: Record<string, unknown>): Promise<MatterResponse> {
    return await new Promise<MatterResponse>((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl);
      const id = Date.now() % 2_000_000_000;
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error("Matter bağlantısı zaman aşımına uğradı."));
      }, 5_000);
      const done = (error?: Error, response?: MatterResponse): void => {
        clearTimeout(timer);
        socket.close();
        if (error) reject(error);
        else resolve(response ?? {});
      };
      socket.once("open", () => {
        socket.send(JSON.stringify({
          id,
          sender: "VillaBridge",
          method: "/api/matter",
          src: "Frontend",
          dst: "Matterbridge",
          params
        }));
      });
      socket.on("message", (raw) => {
        let message: {
          id?: number;
          method?: string;
          error?: string;
          response?: MatterResponse;
        };
        try {
          message = JSON.parse(raw.toString()) as typeof message;
        } catch {
          return;
        }
        if (message.id !== id || message.method !== "/api/matter") return;
        if (message.error) done(new Error(message.error));
        else done(undefined, message.response);
      });
      socket.once("error", (error) => done(new Error(`Matter bağlantısı kurulamadı: ${error.message}`)));
    });
  }
}
