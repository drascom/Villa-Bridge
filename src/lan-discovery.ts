import { createHash } from "node:crypto";
import { createSocket, type Socket } from "node:dgram";
import { hostname } from "node:os";

export const villaBridgeDiscoveryProtocol = "villa-bridge-lan";
export const villaBridgeDiscoveryVersion = 1;
export const villaBridgeDiscoveryQuery = "VILLA_BRIDGE_DISCOVER_V1";
export const villaBridgeDiscoveryPort = 8093;

export type VillaBridgeNodeRole = "server" | "android" | "disabled";

/** Sahiplik beyanı (tablet-failover-plani.md §3.1). */
export type VillaBridgeOwnershipState = "owner" | "standby" | "claiming" | "releasing";

export interface VillaBridgeDiscoveryRecord {
  protocol: typeof villaBridgeDiscoveryProtocol;
  version: typeof villaBridgeDiscoveryVersion;
  role: VillaBridgeNodeRole;
  mode: string;
  dashboardPort: number;
  /** Kalıcı, cihaza özgü kimlik; tie-break ve log için. */
  nodeId: string;
  state: VillaBridgeOwnershipState;
  /** Her sahiplik devrinde artan sayaç; bayat düğüm ayırt edilir. */
  epoch: number;
  /** Koordinatör adresinin özeti; farklı koordinatörlü düğümler birbirini kilitlemesin. */
  coordinatorId: string | null;
  /** Sabit öncelik: server = 0, diğerleri = 1. Küçük olan kazanır. */
  priority: number;
  /** Kaydın gönderildiği an (epoch ms); bayatlama tespiti için. */
  sentAt: number;
}

export interface VillaBridgeDiscoveryRecordOptions {
  nodeId?: string;
  state?: VillaBridgeOwnershipState;
  epoch?: number;
  coordinatorId?: string | null;
  priority?: number;
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

export const villaBridgeNodePriority = (role: VillaBridgeNodeRole): number =>
  (role === "server" ? 0 : 1);

const shortDigest = (value: string, length = 12): string =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

/** Koordinatör adresini (ör. `tcp://192.168.0.248:6638`) özet olarak taşır, adresi sızdırmaz. */
export const villaBridgeCoordinatorId = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toLowerCase();
  return normalized ? shortDigest(normalized, 16) : null;
};

/** Yeniden başlatmalar arasında sabit kalan düğüm kimliği. */
export const resolveVillaBridgeNodeId = (
  role: VillaBridgeNodeRole,
  value = process.env.VILLA_BRIDGE_NODE_ID,
  host = hostname()
): string => {
  const normalized = value?.trim();
  if (normalized) return normalized.slice(0, 64);
  const prefix = role === "server" ? "srv" : role === "android" ? "tab" : "node";
  return `${prefix}-${shortDigest(`${role}:${host}`, 10)}`;
};

export const createVillaBridgeDiscoveryRecord = (
  role: VillaBridgeNodeRole,
  mode: string,
  dashboardPort: number,
  options: VillaBridgeDiscoveryRecordOptions = {}
): VillaBridgeDiscoveryRecord => ({
  protocol: villaBridgeDiscoveryProtocol,
  version: villaBridgeDiscoveryVersion,
  role,
  mode,
  dashboardPort,
  nodeId: options.nodeId ?? resolveVillaBridgeNodeId(role),
  state: options.state ?? "standby",
  epoch: Number.isInteger(options.epoch) ? Number(options.epoch) : 0,
  coordinatorId: options.coordinatorId ?? null,
  priority: Number.isInteger(options.priority) ? Number(options.priority) : villaBridgeNodePriority(role),
  sentAt: Date.now()
});

export const startLanDiscoveryResponder = async (
  record: VillaBridgeDiscoveryRecord,
  port = villaBridgeDiscoveryPort
): Promise<LanDiscoveryResponder | null> => {
  if (record.role === "disabled") return null;
  const socket: Socket = createSocket({ type: "udp4", reuseAddr: true });
  socket.on("error", () => undefined);
  socket.on("message", (message, remote) => {
    if (message.toString("utf8") !== villaBridgeDiscoveryQuery) return;
    // Kayıt gönderim anında damgalanır: `state`/`epoch` değişirse duyuru da güncel kalır.
    socket.send(Buffer.from(JSON.stringify({ ...record, sentAt: Date.now() })), remote.port, remote.address);
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
