import { describe, it, expect } from "vitest";
import { channelMix } from "../tools/channel-mix.js";
import { MockOtaAdapter } from "../adapters/ota/mock-ota.js";

describe("channel_mix tool", () => {
  const ota = new MockOtaAdapter();

  it("returns data for all 4 channels", async () => {
    const result = await channelMix(ota, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.dateRange.start).toBe("2026-03-01");
    expect(result.dateRange.end).toBe("2026-03-31");
    expect(result.channels.length).toBe(4);

    const names = result.channels.map((c) => c.channel);
    expect(names).toContain("Direct");
    expect(names).toContain("Booking.com");
    expect(names).toContain("Expedia");
    expect(names).toContain("Airbnb");
  });

  it("Direct has 0% commission", async () => {
    const result = await channelMix(ota, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    const direct = result.channels.find((c) => c.channel === "Direct")!;
    expect(direct.commissionPct).toBe(0);
    expect(direct.commissionPaid).toBe(0);
    expect(direct.netRevenue).toBe(direct.grossRevenue);
  });

  it("net = gross - commission for every channel", async () => {
    const result = await channelMix(ota, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    for (const ch of result.channels) {
      expect(ch.netRevenue).toBe(ch.grossRevenue - ch.commissionPaid);
    }
  });

  it("totals are correct", async () => {
    const result = await channelMix(ota, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    const sumGross = result.channels.reduce((s, c) => s + c.grossRevenue, 0);
    const sumComm = result.channels.reduce((s, c) => s + c.commissionPaid, 0);
    const sumNet = result.channels.reduce((s, c) => s + c.netRevenue, 0);

    expect(result.totalGrossRevenue).toBe(sumGross);
    expect(result.totalCommissions).toBe(sumComm);
    expect(result.totalNetRevenue).toBe(sumNet);
  });

  it("profitability ranks are 1-4 (unique)", async () => {
    const result = await channelMix(ota, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    const ranks = result.channels.map((c) => c.profitabilityRank).sort();
    expect(ranks).toEqual([1, 2, 3, 4]);
  });

  it("bestChannel and worstChannel are set", async () => {
    const result = await channelMix(ota, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.bestChannel).toBeTruthy();
    expect(result.worstChannel).toBeTruthy();
    expect(result.bestChannel).not.toBe(result.worstChannel);
  });

  it("verification has HIGH confidence", async () => {
    const result = await channelMix(ota, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.verification.confidence).toBe("HIGH");
    expect(result.verification.corrected).toBe(0);
  });

  it("defaults to 30-day window when no dates provided", async () => {
    const result = await channelMix(ota, {});
    const start = new Date(result.dateRange.start);
    const end = new Date(result.dateRange.end);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(days).toBe(30);
  });
});
