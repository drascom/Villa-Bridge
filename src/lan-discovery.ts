import { createSocket, type Socket } from "node:dgram";

export const villaBridgeDiscoveryProtocol = "villa-bridge-lan";
export const villaBridgeDiscoveryVersion = 1;
export const villaBridgeDiscoveryQuery = "VILLA_BRIDGE_DISCOVER_V1";
export const villaBridgeDiscoveryPort = 8093;

export type VillaBridgeNodeRole = "server" | "android" | "disabled";

export interface VillaBridgeDiscoveryRecord {
  protocol: typeof villaBridgeDiscoveryProtocol;
  version: typeof villaBridgeDiscoveryVersion;
  role: VillaBridgeNodeRole;
  mode: string;
  dashboardPort: number;
}

export interface LanDiscoveryResponder {
  port: number;
  close: () => Promise<void>;
}

export const resolveVillaBridgeNodeRole = (
  value = process.env.VILLA_BRIDGE_NODE_ROLE
): VillaBridgeNodeRole => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "server" || normalized === "android" || normalized === "disabled") {
    return normalized;
  }
  return process.platform === "android" ? "android" : "server";
};

export const createVillaBridgeDiscoveryRecord = (
  role: VillaBridgeNodeRole,
  mode: string,
  dashboardPort: number
): VillaBridgeDiscoveryRecord => ({
  protocol: villaBridgeDiscoveryProtocol,
  version: villaBridgeDiscoveryVersion,
  role,
  mode,
  dashboardPort
});

export const startLanDiscoveryResponder = async (
  record: VillaBridgeDiscoveryRecord,
  port = villaBridgeDiscoveryPort
): Promise<LanDiscoveryResponder | null> => {
  if (record.role !== "server") return null;
  const socket: Socket = createSocket({ type: "udp4", reuseAddr: true });
  socket.on("error", () => undefined);
  const response = Buffer.from(JSON.stringify(record));
  socket.on("message", (message, remote) => {
    if (message.toString("utf8") !== villaBridgeDiscoveryQuery) return;
    socket.send(response, remote.port, remote.address);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      socket.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      socket.off("error", onError);
      resolve();
    };
    socket.once("error", onError);
    socket.once("listening", onListening);
    socket.bind(port, "0.0.0.0");
  });

  const address = socket.address();
  return {
    port: typeof address === "object" ? address.port : port,
    close: () => new Promise<void>((resolve) => {
      socket.close(() => resolve());
    })
  };
};
