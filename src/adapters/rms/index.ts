import type { RmsAdapter, RmsSourceConfig } from "../../types.js";
import { MockRmsAdapter } from "./mock-rms.js";
import { RoomPriceGenieAdapter } from "./roompricegenie.js";
import { IdeasAdapter } from "./ideas.js";

export function createRmsAdapter(config: RmsSourceConfig): RmsAdapter {
  switch (config.provider) {
    case "demo":
      return new MockRmsAdapter();
    case "roompricegenie":
      return new RoomPriceGenieAdapter(config);
    case "ideas":
      return new IdeasAdapter(config);
    default:
      throw new Error(
        `Unsupported RMS: "${config.provider}". Supported: demo, roompricegenie, ideas`,
      );
  }
}

export { MockRmsAdapter } from "./mock-rms.js";
export { RoomPriceGenieAdapter } from "./roompricegenie.js";
export { IdeasAdapter } from "./ideas.js";
