import type { StrAdapter, StrSourceConfig } from "../../types.js";
import { MockStrAdapter } from "./mock-str.js";
import { AirDnaAdapter } from "./airdna.js";

export function createStrAdapter(config: StrSourceConfig): StrAdapter {
  switch (config.provider) {
    case "demo":
      return new MockStrAdapter();
    case "airdna":
      return new AirDnaAdapter(config);
    default:
      throw new Error(
        `Unsupported STR provider: "${config.provider}". Supported: demo, airdna`,
      );
  }
}

export { MockStrAdapter } from "./mock-str.js";
export { AirDnaAdapter } from "./airdna.js";
