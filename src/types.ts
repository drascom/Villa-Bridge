import type { DeviceCategory, DeviceRole } from "./device-category.js";

export type JsonObject = Record<string, unknown>;
export type JsonScalar = string | number | boolean;

export interface BridgeDeviceDefinition {
  model?: string;
  vendor?: string;
  description?: string;
  exposes?: unknown[];
  options?: unknown[];
  ota?: boolean;
  supports_ota?: boolean;
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
  configured_options?: {
    transition?: number;
    debounce?: number;
    retain?: boolean;
  };
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
  /** Arayüzde geçerli olan sınıf: kullanıcı rol seçtiyse o, seçmediyse tahmin. */
  category: DeviceCategory;
  /** Tanımdan çıkan tahmin — rolü "Otomatik"e döndürmek için saklanır. */
  detectedCategory: DeviceCategory;
  /** Kullanıcının seçimi; `auto` tahmini olduğu gibi bırakır. */
  role: DeviceRole;
  model: string | null;
  image: DeviceImageView;
  vendor: string | null;
  description: string | null;
  supported: boolean;
  interviewCompleted: boolean;
  preparing: boolean;
  availability: "online" | "offline" | "unknown";
  lastSeen: string | null;
  stateUpdatedAt: string | null;
  otaSupported: boolean;
  options: {
    transition: number;
    debounce: number;
    retain: boolean;
  };
  endpoints?: DeviceEndpointView[];
  features: string[];
  actionTypes?: string[];
  buttons?: DeviceButtonView[];
  lastAction?: DeviceLastActionView | null;
  alerts: DeviceAlertView[];
  controls: DeviceControlView[];
  state: JsonObject;
}

export interface DeviceAlertView {
  code: "low_battery" | "smoke" | "carbon_monoxide";
  severity: "warning" | "critical";
  value?: number;
  threshold?: number;
}

export interface DeviceEndpointBindingView {
  cluster: string;
  targetType: "device" | "group";
  targetId: string;
  targetEndpoint: number | null;
}

export interface DeviceEndpointView {
  id: number;
  name: string;
  inputClusters: Array<string | number>;
  outputClusters: Array<string | number>;
  bindings: DeviceEndpointBindingView[];
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

export interface DeviceButtonActionView {
  /** Ham Zigbee `action` değeri — kanonik kimlik budur, otomasyonlar buna bağlanır. */
  action: string;
  /** İnsan diline çevrilebilir basış kimliği (`single`, `double`, `hold`, `release`, …). */
  press: string;
}

export interface DeviceButtonView {
  id: string;
  name: string;
  kind: "numbered" | "named" | "single" | "ungrouped";
  number: number | null;
  key: string | null;
  actions: DeviceButtonActionView[];
}

export interface DeviceLastActionView {
  action: string;
  buttonId: string | null;
  at: string;
}

export interface DeviceControlView {
  id: string;
  property: string;
  name: string;
  kind:
    | "switch"
    | "level"
    | "temperature"
    | "color"
    | "cover"
    | "position"
    | "climate"
    | "lock"
    | "fan"
    | "siren"
    | "number"
    | "select";
  value: boolean | number | string | null;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  values?: JsonScalar[];
  valueOn?: JsonScalar;
  valueOff?: JsonScalar;
  valueToggle?: JsonScalar;
  adminOnly?: boolean;
}

export interface GroupView {
  id: string;
  sourceName: string;
  name: string;
  members: number;
  memberIds: string[];
  scenes: Array<{ id: number; name: string }>;
  state: JsonObject;
}

export interface DeviceEventView {
  sourceName: string;
  property: string;
  value: JsonScalar;
  at: string;
}
