import fs from "node:fs";
import { MatterbridgeEndpoint } from "file:///var/lib/matterbridge/.npm-global/lib/node_modules/matterbridge/dist/export.js";

// The preload belongs only to the main Matterbridge process.
delete process.env.NODE_OPTIONS;

const aliasesPath =
  process.env.MATTERBRIDGE_NAME_ALIASES ??
  "/var/lib/matterbridge/.matterbridge/matterbridge-name-aliases.json";

let aliases = {};
try {
  const parsed = JSON.parse(fs.readFileSync(aliasesPath, "utf8"));
  aliases = Object.fromEntries(
    Object.entries(parsed).filter(
      ([key, value]) =>
        typeof key === "string" &&
        typeof value === "string" &&
        value.trim().length > 0 &&
        Buffer.byteLength(value.trim(), "utf8") <= 32,
    ),
  );
  console.log(`[Matterbridge Name Alias] Loaded ${Object.keys(aliases).length} aliases`);
} catch (error) {
  console.warn(`[Matterbridge Name Alias] Alias file could not be loaded: ${error.message}`);
}

const endpointPrototype = MatterbridgeEndpoint.prototype;
const originalCreateBasicInformation =
  endpointPrototype.createDefaultBridgedDeviceBasicInformationClusterServer;

if (!originalCreateBasicInformation.__nameAliasWrapped) {
  const wrappedCreateBasicInformation = function (...args) {
    const originalName = args[0];
    const serialNumber = args[1];
    const alias = aliases[serialNumber];
    if (alias) {
      args[0] = alias;
      console.log(`[Matterbridge Name Alias] ${serialNumber}: ${originalName} -> ${alias}`);
    }
    return originalCreateBasicInformation.apply(this, args);
  };
  Object.defineProperty(wrappedCreateBasicInformation, "__nameAliasWrapped", { value: true });
  endpointPrototype.createDefaultBridgedDeviceBasicInformationClusterServer =
    wrappedCreateBasicInformation;
}

const originalAddChild = endpointPrototype.addChildDeviceTypeWithClusterServer;
if (!originalAddChild.__nameAliasWrapped) {
  const wrappedAddChild = function (endpointName, ...args) {
    const child = originalAddChild.call(this, endpointName, ...args);
    const alias = this.serialNumber ? aliases[`${this.serialNumber}:${endpointName}`] : undefined;
    if (alias) {
      child.name = alias;
      child.deviceName = alias;
      void child.addUserLabel("name", alias).catch((error) => {
        console.warn(`[Matterbridge Name Alias] Child label could not be added: ${error.message}`);
      });
      console.log(`[Matterbridge Name Alias] ${this.serialNumber}:${endpointName} -> ${alias}`);
    }
    return child;
  };
  Object.defineProperty(wrappedAddChild, "__nameAliasWrapped", { value: true });
  endpointPrototype.addChildDeviceTypeWithClusterServer = wrappedAddChild;
}
