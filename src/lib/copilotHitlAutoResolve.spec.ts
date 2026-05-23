import { describe, expect, it } from "vitest";
import {
  getHitlAutoRejectReason,
  hitlFormIdsEqual,
  type PendingCopilotHitl,
} from "./copilotHitlAutoResolve";
import type { CopilotActivityEvent } from "./copilotActivity";

function event(
  overrides: Partial<CopilotActivityEvent>,
): CopilotActivityEvent {
  return {
    id: "evt-1",
    at: "2026-05-23T10:00:00.000Z",
    actor: "user",
    kind: "form_submit_result",
    title: "event",
    ...overrides,
  } as CopilotActivityEvent;
}

const pending: PendingCopilotHitl = {
  formId: "inspection_detail_44_finance_review",
  route: "/inspections/44",
  at: 100,
};

describe("copilot HITL auto resolve", () => {
  it("matches form ids across dash/underscore spelling", () => {
    expect(
      hitlFormIdsEqual(
        "inspection-detail-44-finance-review",
        "inspection_detail_44_finance_review",
      ),
    ).toBe(true);
  });

  it("auto-rejects only after the user manual submit succeeds", () => {
    expect(
      getHitlAutoRejectReason({
        pending,
        event: event({
          formId: "inspection-detail-44-finance-review",
          result: { ok: true, recordId: 44 },
        }),
        currentRoute: "/inspections/44",
      }),
    ).toBe("user_submitted_manually");
  });

  it("keeps approval pending while a manual submit is only requested", () => {
    expect(
      getHitlAutoRejectReason({
        pending,
        event: event({
          kind: "form_submit_requested",
          formId: "inspection-detail-44-finance-review",
        }),
        currentRoute: "/inspections/44",
      }),
    ).toBeNull();
  });

  it("keeps approval pending when manual submit failed", () => {
    expect(
      getHitlAutoRejectReason({
        pending,
        event: event({
          formId: "inspection-detail-44-finance-review",
          result: { ok: false },
        }),
        currentRoute: "/inspections/44",
      }),
    ).toBeNull();
  });

  it("auto-rejects when the user closes the pending form", () => {
    expect(
      getHitlAutoRejectReason({
        pending,
        event: event({
          kind: "form_closed",
          formId: "inspection-detail-44-finance-review",
        }),
        currentRoute: "/inspections/44",
      }),
    ).toBe("user_closed_form");
  });

  it("auto-rejects when the user navigates away from the approval route", () => {
    expect(
      getHitlAutoRejectReason({
        pending,
        event: event({
          kind: "route_changed",
          route: "/stock-entries",
        }),
        currentRoute: "/stock-entries",
      }),
    ).toBe("user_navigated_away");
  });

  it("does not reject when unrelated form activity happens", () => {
    expect(
      getHitlAutoRejectReason({
        pending,
        event: event({
          formId: "stock-entry-create",
          result: { ok: true, recordId: 7 },
        }),
        currentRoute: "/inspections/44",
      }),
    ).toBeNull();
  });
});
