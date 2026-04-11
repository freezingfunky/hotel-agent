import type { PmsConfig } from "../types.js";

/**
 * Escape hatch: make a direct GET request to the PMS API.
 * Claude can use this for any data the pre-built tools don't cover.
 */
export async function rawQuery(
  config: PmsConfig,
  params: { endpoint: string; queryParams?: Record<string, string> },
): Promise<unknown> {
  const baseUrls: Record<string, string> = {
    guesty: "https://open-api.guesty.com/v1",
    hostaway: "https://api.hostaway.com/v1",
  };

  const baseUrl = baseUrls[config.pms];
  if (!baseUrl) throw new Error(`Unsupported PMS: ${config.pms}`);

  const path = params.endpoint.startsWith("/")
    ? params.endpoint
    : `/${params.endpoint}`;

  const url = new URL(`${baseUrl}${path}`);
  if (params.queryParams) {
    for (const [key, value] of Object.entries(params.queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const res = await fetch(url.toString(), { headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Auth failed (${res.status}). Check your API key. Response: ${body.slice(0, 200)}`,
      );
    }
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = await res.json();

  // Truncate very large responses to avoid flooding context
  const serialized = JSON.stringify(data);
  if (serialized.length > 50_000) {
    const truncated = truncateResponse(data);
    return {
      _note: `Response truncated (original: ${(serialized.length / 1024).toFixed(0)}KB). Showing first page of results. Use queryParams to filter further.`,
      data: truncated,
    };
  }

  return data;
}

function truncateResponse(data: unknown): unknown {
  if (Array.isArray(data)) {
    return {
      totalItems: data.length,
      showing: "first 20",
      items: data.slice(0, 20),
    };
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["results", "result", "data", "items", "reservations", "listings"]) {
      if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 20) {
        return {
          ...obj,
          [key]: (obj[key] as unknown[]).slice(0, 20),
          _truncated: `Showing 20 of ${(obj[key] as unknown[]).length} ${key}`,
        };
      }
    }
  }

  return data;
}
