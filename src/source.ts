import type { JsonObject } from "./types.js";

export interface ZigbeeSource {
  start(): void | Promise<void>;
  stop(): Promise<void>;
  permitJoin(seconds: number): Promise<void>;
  setDevice(id: string, command: JsonObject): Promise<void>;
  renameDevice(id: string, name: string): Promise<void>;
  removeDevice(id: string, force?: boolean): Promise<void>;
  setHomeAssistantDiscovery(enabled: boolean): void | Promise<void>;
}
