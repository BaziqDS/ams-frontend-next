import { describe, expect, it } from "vitest";
import {
  buildDetachedApprovalReview,
  formatDetachedApprovalAction,
  summarizeDetachedApprovalArgs,
} from "./copilotDetachedApproval";

describe("detached copilot approval copy", () => {
  it("formats compact approval action copy without noisy review context", () => {
    expect(formatDetachedApprovalAction("request_form_submit")).toBe(
      "Submit active AMS form",
    );

    expect(
      summarizeDetachedApprovalArgs({
        formId: "inspection_create",
        intent: "submit",
        approvalContext: { title: "hidden" },
        remarks: "Ready for review",
      }),
    ).toEqual([
      "Form: inspection create",
      "Remarks: Ready for review",
    ]);
  });

  it("builds form-aware approval metadata from live copilot context", () => {
    const review = buildDetachedApprovalReview(
      {
        name: "request_form_submit",
        args: { formId: "category-create", intent: "submit" },
      },
      {
        now: new Date("2026-05-23T10:15:00Z"),
        context: {
          readables: [
            {
              id: "__ams_runtime_context",
              value: {
                user: { username: "Insha Khan" },
              },
            },
            {
              id: "active-form",
              value: {
                activeForm: {
                  formId: "category-create",
                  title: "Create Category",
                  fields: [
                    { name: "name", label: "Category name", type: "string" },
                    {
                      name: "category_type",
                      label: "Category type",
                      required: true,
                      type: "select",
                      options: [{ label: "Fixed Asset", value: "FIXED_ASSET" }],
                    },
                    {
                      name: "parent",
                      label: "Parent category",
                      required: true,
                      type: "select",
                    },
                  ],
                  values: {},
                },
              },
            },
            {
              id: "__ams_activity_context",
              value: {
                recentActivity: [
                  {
                    kind: "form_values_set",
                    actor: "assistant",
                    formId: "category-create",
                    fields: ["name", "category_type"],
                    currentValues: {
                      name: "Computer Accessories",
                      category_type: "FIXED_ASSET",
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    );

    expect(review.title).toBe("Create Category");
    expect(review.metadata).toEqual([
      { label: "Form", value: "Create Category" },
      { label: "Requested by", value: "Insha Khan" },
      { label: "Filled by", value: "AMS Assistant" },
      { label: "Date", value: "23/05/2026" },
      { label: "Status", value: "Ready" },
    ]);
    expect(review.fields.slice(0, 3)).toEqual([
      { label: "Category name", value: "Computer Accessories", missing: false },
      { label: "Category type", value: "Fixed Asset (FIXED_ASSET)", missing: false },
      { label: "Parent category", value: "Not set", missing: true },
    ]);
  });
});
