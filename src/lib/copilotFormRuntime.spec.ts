import { describe, expect, it } from "vitest";

import {
  createCopilotFormRuntimeState,
  normalizeCopilotFormPatchValues,
  normalizeCopilotSubmitResult,
  updateCopilotFormRuntimeState,
} from "./copilotFormRuntime";

describe("copilot form runtime state", () => {
  it("records user edits when a field changes outside an assistant patch", () => {
    const initial = createCopilotFormRuntimeState({
      name: "Old category",
      category_type: "FIXED_ASSET",
    });

    const next = updateCopilotFormRuntimeState(initial, {
      name: "New category",
      category_type: "FIXED_ASSET",
    });

    expect(next.dirtyFields).toEqual(["name"]);
    expect(next.touchedFields).toEqual(["name"]);
    expect(next.lastUserEdit).toMatchObject({
      field: "name",
      previousValue: "Old category",
      currentValue: "New category",
      source: "user",
    });
    expect(next.lastChange).toEqual(next.lastUserEdit);
  });

  it("does not mistake assistant patches for user edits", () => {
    const initial = createCopilotFormRuntimeState({
      name: "",
      code: "",
    });

    const next = updateCopilotFormRuntimeState(
      initial,
      {
        name: "Laptop",
        code: "IT-001",
      },
      { assistantPatchedFields: ["name", "code"] },
    );

    expect(next.dirtyFields).toEqual(["code", "name"]);
    expect(next.touchedFields).toEqual(["code", "name"]);
    expect(next.lastUserEdit).toBeNull();
    expect(next.lastChange).toMatchObject({
      fields: ["code", "name"],
      source: "assistant",
    });
  });
});

describe("normalizeCopilotSubmitResult", () => {
  it("preserves structured submit failures for the agent", () => {
    const result = normalizeCopilotSubmitResult({
      ok: false,
      errorType: "validation_error",
      message: "Inspection code already exists.",
      fieldErrors: { inspection_code: "Duplicate inspection code." },
    });

    expect(result).toEqual({
      ok: false,
      errorType: "validation_error",
      message: "Inspection code already exists.",
      fieldErrors: { inspection_code: "Duplicate inspection code." },
    });
  });

  it("marks ambiguous submit handlers as unverified", () => {
    expect(normalizeCopilotSubmitResult(undefined)).toMatchObject({
      ok: false,
      errorType: "unverified_submit_result",
    });
  });
});

describe("normalizeCopilotFormPatchValues", () => {
  it("normalizes date fields to browser date input format", () => {
    expect(
      normalizeCopilotFormPatchValues(
        [
          { name: "contract_date", type: "date" },
          { name: "date_of_inspection", type: "date" },
          { name: "name", type: "string" },
        ],
        {
          contract_date: "20 May 2026",
          date_of_inspection: "2026/05/21",
          name: "Inspection",
        },
        new Date("2026-05-20T10:00:00Z"),
      ),
    ).toEqual({
      contract_date: "2026-05-20",
      date_of_inspection: "2026-05-21",
      name: "Inspection",
    });
  });

  it("normalizes relative date words for date fields", () => {
    expect(
      normalizeCopilotFormPatchValues(
        [{ name: "date", type: "date" }],
        { date: "tomorrow" },
        new Date("2026-05-20T10:00:00Z"),
      ),
    ).toEqual({ date: "2026-05-21" });
  });
});
