import type { BridgeConfig } from "../config.js";
import { AppServerTraeRuntimeAdapter } from "./AppServerTraeRuntimeAdapter.js";
import { ExecTraeRuntimeAdapter } from "./ExecTraeRuntimeAdapter.js";
import type { RuntimeAvailability, TraeRuntimeAdapter } from "./types.js";

export interface RuntimeSelection {
  adapter: TraeRuntimeAdapter;
  availability: RuntimeAvailability;
  fallbackReason?: string;
}

export async function createRuntimeAdapter(
  config: BridgeConfig,
): Promise<RuntimeSelection> {
  const execAdapter = new ExecTraeRuntimeAdapter(config);

  if (config.runtimePreference === "exec-json") {
    return {
      adapter: execAdapter,
      availability: await execAdapter.checkAvailability(),
    };
  }

  const appServerAdapter = new AppServerTraeRuntimeAdapter(config);
  const appServerAvailability = await appServerAdapter.checkAvailability();

  if (config.runtimePreference === "app-server") {
    return {
      adapter: appServerAdapter,
      availability: appServerAvailability,
    };
  }

  if (appServerAvailability.available) {
    return {
      adapter: appServerAdapter,
      availability: appServerAvailability,
    };
  }

  const execAvailability = await execAdapter.checkAvailability();
  return {
    adapter: execAdapter,
    availability: execAvailability,
    fallbackReason: appServerAvailability.message,
  };
}
