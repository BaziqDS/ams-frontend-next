import { describe, expect, it } from "vitest";

import {
  buildManualSubmitRequestedActivity,
  buildManualSubmitResultActivity,
} from "./copilotManualSubmitActivity";

describe("manual submit activity helpers", () => {
  it("builds user submit events that preserve the submitted record id", () => {
    expect(
      buildManualSubmitRequestedActivity({
        formId: "inspection_create",
        formTitle: "New Inspection Certificate",
        intent: "submit",
      }),
    ).toMatchObject({
      kind: "form_submit_requested",
      actor: "user",
      formId: "inspection_create",
      formTitle: "New Inspection Certificate",
      details: { intent: "submit", source: "manual" },
    });

    expect(
      buildManualSubmitResultActivity({
        formId: "inspection_create",
        formTitle: "New Inspection Certificate",
        intent: "submit",
        result: {
          ok: true,
          message: "Inspection certificate submitted successfully.",
          recordId: 42,
        },
      }),
    ).toMatchObject({
      kind: "form_submit_result",
      actor: "user",
      title: "Manual submit succeeded for New Inspection Certificate",
      formId: "inspection_create",
      result: {
        ok: true,
        recordId: 42,
      },
      details: { intent: "submit", source: "manual" },
    });
  });
});
