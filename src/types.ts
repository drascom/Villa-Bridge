export type JsonObject = Record<string, unknown>;

export interface BridgeDeviceDefinition {
  model?: string;
  vendor?: string;
  description?: string;
  exposes?: unknown[];
  options?: unknown[];
}

export interface BridgeDevice {
  ieee_address?: string;
  friendly_name?: string;
  model_id?: string;
  type?: string;
  disabled?: boolean;
  interview_completed?: boolean;
  interviewing?: boolean;
  supported?: boolean;
  network_address?: number;
  definition?: BridgeDeviceDefinition;
  endpoints?: Record<string, unknown>;
  endpoint_names?: Record<string, string>;
  date_code?: string;
  manufacturer?: string;
  power_source?: string;
  software_build_id?: string;
}

export interface BridgeGroup {
  id?: number;
  friendly_name?: string;
  members?: Array<{ ieee_address?: string; endpoint?: number }>;
  scenes?: Array<{ id?: number; name?: string }>;
}

export interface DeviceView {
  id: string;
  sourceName: string;
  name: string;
  type: string;
  model: string | null;
  image: DeviceImageView;
  vendor: string | null;
  description: string | null;
  supported: boolean;
  interviewCompleted: boolean;
  availability: "online" | "offline" | "unknown";
  lastSeen: string | null;
  stateUpdatedAt: string | null;
  features: string[];
  controls: DeviceControlView[];
  state: JsonObject;
}

export interface DeviceImageCandidate {
  model: string;
  label: "catalogMatch" | "miniModule" | "switchModule" | "wallSwitch" | "otherSwitch";
}

export interface DeviceImageView {
  model: string | null;
  candidates: DeviceImageCandidate[];
  selectionRequired: boolean;
  userSelected: boolean;
  preferenceKey: string;
}

export interface DeviceControlView {
  id: string;
  property: string;
  name: string;
  kind: "switch" | "level" | "temperature" | "color";
  value: boolean | number | string | null;
  min?: number;
  max?: number;
}

export interface GroupView {
  id: string;
  sourceName: string;
  name: string;
  members: number;
  state: JsonObject;
}
