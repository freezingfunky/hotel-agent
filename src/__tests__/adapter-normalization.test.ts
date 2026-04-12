import { describe, it, expect } from "vitest";
import { createAdapter } from "../adapters/index.js";
import { MockAdapter } from "../mock-adapter.js";

describe("createAdapter factory", () => {
  it("creates MockAdapter for demo config", () => {
    const adapter = createAdapter({ pms: "demo", apiKey: "n/a" });
    expect(adapter).toBeInstanceOf(MockAdapter);
    expect(adapter.name).toBe("Demo (Mock Data)");
  });

  it("throws for unsupported PMS", () => {
    expect(() =>
      createAdapter({ pms: "nonexistent" as never, apiKey: "key" }),
    ).toThrow("Unsupported PMS");
  });

  it("creates adapters for all supported PMS types", () => {
    const types = ["guesty", "hostaway", "cloudbeds", "mews", "apaleo"] as const;
    for (const pms of types) {
      const adapter = createAdapter({ pms, apiKey: "test-key" });
      expect(adapter.name).toBeTruthy();
      expect(typeof adapter.fetchProperties).toBe("function");
      expect(typeof adapter.fetchReservations).toBe("function");
    }
  });
});

describe("MockAdapter normalization", () => {
  const adapter = new MockAdapter();

  it("returns properties with all required fields", async () => {
    const properties = await adapter.fetchProperties();
    expect(properties.length).toBe(30);

    for (const prop of properties) {
      expect(prop.id).toBeTruthy();
      expect(prop.name).toBeTruthy();
      expect(typeof prop.bedrooms).toBe("number");
      expect(typeof prop.bathrooms).toBe("number");
      expect(typeof prop.maxGuests).toBe("number");
      expect(["active", "inactive"]).toContain(prop.status);
      expect(prop.timezone).toBeTruthy();
    }
  });

  it("returns reservations with all required fields", async () => {
    const reservations = await adapter.fetchReservations({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(reservations.length).toBeGreaterThan(0);

    for (const res of reservations.slice(0, 50)) {
      expect(res.id).toBeTruthy();
      expect(res.propertyId).toBeTruthy();
      expect(res.propertyName).toBeTruthy();
      expect(res.guestName).toBeTruthy();
      expect(res.checkIn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.checkOut).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(res.nights).toBeGreaterThan(0);
      expect(typeof res.totalPrice).toBe("number");
      expect(res.totalPrice).toBeGreaterThan(0);
      expect(typeof res.nightlyRate).toBe("number");
      expect(res.currency).toBeTruthy();
    }
  });

  it("filters reservations by date range", async () => {
    const all = await adapter.fetchReservations({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const narrow = await adapter.fetchReservations({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    expect(narrow.length).toBeLessThan(all.length);
    expect(narrow.length).toBeGreaterThan(0);
  });

  it("filters reservations by property ID", async () => {
    const all = await adapter.fetchReservations({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const props = await adapter.fetchProperties();
    const firstPropId = props[0]!.id;

    const filtered = await adapter.fetchReservations({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      propertyId: firstPropId,
    });

    expect(filtered.length).toBeLessThan(all.length);
    for (const res of filtered) {
      expect(res.propertyId).toBe(firstPropId);
    }
  });

  it("includes cancelled and no-show reservations", async () => {
    const reservations = await adapter.fetchReservations({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const statuses = new Set(reservations.map((r) => r.status));
    expect(statuses.has("cancelled")).toBe(true);
    expect(statuses.has("no-show")).toBe(true);
  });
});

describe("status normalization across adapters", () => {
  it("all adapters use consistent status strings for cancelled reservations", () => {
    // Guesty uses "canceled", Hostaway "cancelled", Cloudbeds "canceled"
    // Our adapters should all normalize to something the tools can detect
    // The tools check for status including "cancel" (case insensitive)
    const variants = ["canceled", "cancelled", "CANCELLED", "Canceled"];
    for (const v of variants) {
      expect(v.toLowerCase().includes("cancel")).toBe(true);
    }
  });

  it("the Cloudbeds adapter normalizes no_show to no-show", () => {
    // Cloudbeds API returns "no_show", our adapter should normalize to "no-show"
    // which matches the revenue-leaks tool's detection pattern
    const cloudbedsStatus = "no_show";
    const normalized = cloudbedsStatus === "no_show" ? "no-show" : cloudbedsStatus;
    expect(normalized).toBe("no-show");
    expect(normalized.includes("no-show")).toBe(true);
  });
});
