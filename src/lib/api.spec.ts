import { describe, expect, it, vi, afterEach } from "vitest";

import { apiFetch, ApiError, extractApiErrorDetails } from "@/lib/api";

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces delete blockers before generic detail text", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => new Response(JSON.stringify(String(url).endsWith('/csrf/') ? { csrfToken: 'test-token' } : {
      detail: "Delete is blocked by existing dependencies.",
      delete_blockers: [
        "This location has stock registers.",
        "This location is used in stock entries.",
      ],
    }), {
      status: String(url).endsWith('/csrf/') ? 200 : 400,
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

  it("adds CSRF headers without forcing a multipart content type", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push(init);
      return Response.json(String(url).endsWith('/csrf/') ? { csrfToken: 'test-token' } : { saved: true });
    }));
    const body = new FormData();
    body.set('first_name', 'Allowed');
    await apiFetch('/api/users/management/1/', { method: 'PATCH', body });
    const request = calls.at(-1)!;
    expect(new Headers(request.headers).get('X-CSRFToken')).toBe('test-token');
    expect(new Headers(request.headers).has('Content-Type')).toBe(false);
    expect(request.credentials).toBe('include');
  });

  it("refreshes an expired access cookie once before retrying a safe read", async () => {
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/csrf/')) return Response.json({ csrfToken: 'test-token' });
      if (String(url).endsWith('/refresh/')) return Response.json({ detail: 'refreshed' });
      reads += 1;
      return Response.json({ username: 'still-signed-in' }, { status: reads === 1 ? 401 : 200 });
    }));
    await expect(apiFetch('/auth/users/me/')).resolves.toEqual({ username: 'still-signed-in' });
    expect(reads).toBe(2);
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
