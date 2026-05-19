import { describe, expect, it, vi, afterEach } from "vitest";

import { apiFetch, ApiError } from "@/lib/api";

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces delete blockers before generic detail text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      detail: "Delete is blocked by existing dependencies.",
      delete_blockers: [
        "This location has stock registers.",
        "This location is used in stock entries.",
      ],
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(apiFetch("/api/inventory/locations/2/", { method: "DELETE" }))
      .rejects
      .toMatchObject<ApiError>({
        status: 400,
        message: "This location has stock registers. This location is used in stock entries.",
      });
  });
});
