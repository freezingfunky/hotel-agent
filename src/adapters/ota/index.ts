import type { OtaAdapter, OtaSourceConfig } from "../../types.js";
import { MockOtaAdapter } from "./mock-ota.js";
import { BookingComAdapter } from "./booking.js";
import { ExpediaAdapter } from "./expedia.js";

export function createOtaAdapter(config: OtaSourceConfig): OtaAdapter {
  switch (config.provider) {
    case "demo":
      return new MockOtaAdapter();
    case "booking":
      return new BookingComAdapter(config);
    case "expedia":
      return new ExpediaAdapter(config);
    default:
      throw new Error(
        `Unsupported OTA: "${config.provider}". Supported: demo, booking, expedia`,
      );
  }
}

export { MockOtaAdapter } from "./mock-ota.js";
export { BookingComAdapter } from "./booking.js";
export { ExpediaAdapter } from "./expedia.js";
