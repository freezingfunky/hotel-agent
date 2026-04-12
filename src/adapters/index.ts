import type { PmsAdapter, PmsConfig } from "../types.js";
import { MockAdapter } from "../mock-adapter.js";
import { GuestyAdapter } from "./guesty.js";
import { HostawayAdapter } from "./hostaway.js";
import { CloudbedsAdapter } from "./cloudbeds.js";
import { MewsAdapter } from "./mews.js";
import { ApaleoAdapter } from "./apaleo.js";

export function createAdapter(config: PmsConfig): PmsAdapter {
  switch (config.pms) {
    case "demo":
      return new MockAdapter();
    case "guesty":
      return new GuestyAdapter(config);
    case "hostaway":
      return new HostawayAdapter(config);
    case "cloudbeds":
      return new CloudbedsAdapter(config);
    case "mews":
      return new MewsAdapter(config);
    case "apaleo":
      return new ApaleoAdapter(config);
    default:
      throw new Error(
        `Unsupported PMS: "${config.pms}". Supported: demo, guesty, hostaway, cloudbeds, mews, apaleo`,
      );
  }
}

export { GuestyAdapter } from "./guesty.js";
export { HostawayAdapter } from "./hostaway.js";
export { CloudbedsAdapter } from "./cloudbeds.js";
export { MewsAdapter } from "./mews.js";
export { ApaleoAdapter } from "./apaleo.js";
