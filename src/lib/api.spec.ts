import { describe, expect, it, vi, afterEach } from "vitest";

import { apiFetch, ApiError, extractApiErrorDetails } from "@/lib/api";

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
        body: {
          detail: "Delete is blocked by existing dependencies.",
          delete_blockers: [
            "This location has stock registers.",
            "This location is used in stock entries.",
          ],
        },
      });
  });

  it("keeps nested DRF validation errors addressable by field path", () => {
    const body = {
      non_field_errors: ["Fix the highlighted inspection rows."],
      items: [
        { central_register: ["This field is required."] },
        { central_register_page_no: ["Enter a page number."] },
      ],
    };

    expect(extractApiErrorDetails(body)).toEqual({
      message:
        "Fix the highlighted inspection rows. items.0.central_register: This field is required. items.1.central_register_page_no: Enter a page number.",
      globalErrors: ["Fix the highlighted inspection rows."],
      fieldErrors: {
        "items.0.central_register": "This field is required.",
        "items.1.central_register_page_no": "Enter a page number.",
      },
    });
  });
});
