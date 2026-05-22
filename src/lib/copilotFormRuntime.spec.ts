import { describe, expect, it } from "vitest";

import {
  buildCopilotSetFormValuesParameters,
  createCopilotFormRuntimeState,
  findInvalidCopilotSelectValues,
  normalizeCopilotFormPatchValues,
  normalizeCopilotSetValuesResponse,
  normalizeCopilotSubmitError,
  normalizeCopilotSubmitResult,
  updateCopilotFormRuntimeState,
  validateCopilotFormPatchValues,
} from "./copilotFormRuntime";
import { ApiError } from "./api";

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

describe("normalizeCopilotSetValuesResponse", () => {
  it("reports the actual fields applied by the form setter", () => {
    expect(
      normalizeCopilotSetValuesResponse({
        acceptedFields: ["items"],
        unknownFields: [],
        setterResult: {
          applied: [],
          ignored: ["items"],
          reason: "Items are read-only.",
        },
      }),
    ).toEqual({
      ok: false,
      applied: [],
      unknown: [],
      ignored: ["items"],
      result: {
        applied: [],
        ignored: ["items"],
        reason: "Items are read-only.",
      },
      errorType: "values_not_applied",
      message: "Items are read-only.",
    });
  });

  it("falls back to accepted fields when a setter returns no detail", () => {
    expect(
      normalizeCopilotSetValuesResponse({
        acceptedFields: ["contract_no"],
        unknownFields: ["bogus"],
        setterResult: undefined,
      }),
    ).toMatchObject({
      ok: true,
      applied: ["contract_no"],
      unknown: ["bogus"],
      ignored: [],
      result: null,
    });
  });
});

describe("copilot form value schemas", () => {
  it("builds strict parameters from writable form fields", () => {
    const parameters = buildCopilotSetFormValuesParameters([
      { name: "name", type: "string", label: "Name" },
      { name: "count", type: "number", label: "Count" },
      {
        name: "status",
        type: "select",
        label: "Status",
        options: [
          { label: "Draft", value: "DRAFT" },
          { label: "Complete", value: "COMPLETE" },
        ],
      },
      { name: "secret", type: "string", label: "Secret", readOnly: true },
    ]);

    expect(parameters.values).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        count: { type: "number" },
        status: { enum: ["DRAFT", "COMPLETE"] },
      },
    });
    expect(parameters.values.properties).not.toHaveProperty("secret");
  });

  it("validates patch values with zod before calling form setters", () => {
    const fields = [
      { name: "name", type: "string" },
      { name: "count", type: "number" },
      {
        name: "status",
        type: "select",
        options: [{ label: "Draft", value: "DRAFT" }],
      },
    ];

    expect(validateCopilotFormPatchValues(fields, {
      name: "Laptop",
      count: "5",
      status: "DRAFT",
    })).toEqual({
      ok: true,
      values: {
        name: "Laptop",
        count: 5,
        status: "DRAFT",
      },
    });

    expect(validateCopilotFormPatchValues(fields, {
      count: "not-a-number",
      typo: true,
    })).toMatchObject({
      ok: false,
      fieldErrors: {
        count: expect.any(String),
        values: expect.any(String),
      },
    });
  });

  it("validates strict array row schemas when forms provide array item fields", () => {
    const fields = [
      {
        name: "items",
        type: "array",
        arrayItemFields: [
          { name: "item_description", type: "string" },
          { name: "tendered_quantity", type: "number" },
        ],
      },
    ];

    expect(validateCopilotFormPatchValues(fields, {
      items: [{ item_description: "Soccer Balls", tendered_quantity: "50" }],
    })).toEqual({
      ok: true,
      values: {
        items: [{ item_description: "Soccer Balls", tendered_quantity: 50 }],
      },
    });

    expect(validateCopilotFormPatchValues(fields, {
      items: [{ item_description: "Soccer Balls", unexpected: true }],
    })).toMatchObject({
      ok: false,
      fieldErrors: {
        "items.0": expect.any(String),
      },
    });
  });

  it("supports primitive array schemas for multi-select field values", () => {
    const fields = [
      {
        name: "instances",
        type: "array",
        arrayItemType: "string",
        options: [
          { label: "SN-001", value: "4" },
          { label: "SN-002", value: "5" },
        ],
      },
    ];

    expect(buildCopilotSetFormValuesParameters(fields).values).toMatchObject({
      properties: {
        instances: {
          type: "array",
          items: { enum: ["4", "5"] },
        },
      },
    });

    const normalized = normalizeCopilotFormPatchValues(fields, {
      instances: [4, "5"],
    });

    expect(normalized).toEqual({ instances: ["4", "5"] });
    expect(validateCopilotFormPatchValues(fields, normalized)).toEqual({
      ok: true,
      values: { instances: ["4", "5"] },
    });
    expect(findInvalidCopilotSelectValues(fields, { instances: ["999"] })).toEqual([
      {
        field: "instances.0",
        value: "999",
        allowedOptions: [
          { label: "SN-001", value: "4" },
          { label: "SN-002", value: "5" },
        ],
      },
    ]);
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

  it("turns API validation failures into actionable field errors", () => {
    const result = normalizeCopilotSubmitError(
      new ApiError(400, "HTTP 400", {
        items: [
          { item: ["Select an item."] },
          { central_register: ["This field is required."] },
        ],
      }),
    );

    expect(result).toEqual({
      ok: false,
      errorType: "backend_error",
      message:
        "items.0.item: Select an item. items.1.central_register: This field is required.",
      status: 400,
      fieldErrors: {
        "items.0.item": "Select an item.",
        "items.1.central_register": "This field is required.",
      },
      globalErrors: undefined,
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

  it("normalizes select labels to option values", () => {
    expect(
      normalizeCopilotFormPatchValues(
        [
          {
            name: "department",
            type: "select",
            options: [
              { label: "NED", value: 4 },
              { label: "Main Store", value: 7 },
            ],
          },
        ],
        { department: "NED" },
      ),
    ).toEqual({ department: 4 });
  });

  it("expands dotted array row patch keys when the form exposes an array field", () => {
    const normalized = normalizeCopilotFormPatchValues(
      [
        {
          name: "items",
          type: "array",
          arrayItemFields: [
            { name: "item_description", type: "string" },
            { name: "tendered_quantity", type: "number" },
            {
              name: "item",
              type: "select",
              options: [{ label: "Laptop", value: 3 }],
            },
          ],
        },
      ],
      {
        "items.0.item_description": "Laptop - High Performance",
        "items.0.tendered_quantity": "10",
        "items.0.item": "Laptop",
        "items.1.item_description": "Wireless Mouse",
        "items.1.tendered_quantity": 10,
      },
    );

    expect(normalized).toEqual({
      items: [
        {
          item_description: "Laptop - High Performance",
          tendered_quantity: "10",
          item: 3,
        },
        {
          item_description: "Wireless Mouse",
          tendered_quantity: 10,
        },
      ],
    });
    expect(
      validateCopilotFormPatchValues(
        [
          {
            name: "items",
            type: "array",
            arrayItemFields: [
              { name: "item_description", type: "string" },
              { name: "tendered_quantity", type: "number" },
              {
                name: "item",
                type: "select",
                options: [{ label: "Laptop", value: 3 }],
              },
            ],
          },
        ],
        normalized,
      ),
    ).toEqual({
      ok: true,
      values: {
        items: [
          {
            item_description: "Laptop - High Performance",
            tendered_quantity: 10,
            item: 3,
          },
          {
            item_description: "Wireless Mouse",
            tendered_quantity: 10,
          },
        ],
      },
    });
  });

  it("preserves exact dotted field names when the form exposes them directly", () => {
    expect(
      normalizeCopilotFormPatchValues(
        [{ name: "items.0.central_register", type: "number" }],
        { "items.0.central_register": "5" },
      ),
    ).toEqual({ "items.0.central_register": "5" });
  });

  it("leaves unknown select labels unchanged so callers can reject them", () => {
    expect(
      normalizeCopilotFormPatchValues(
        [
          {
            name: "department",
            type: "select",
            options: [
              { label: "NED", value: 4 },
              { label: "Main Store", value: 7 },
            ],
          },
        ],
        { department: "Civil Engineering" },
      ),
    ).toEqual({ department: "Civil Engineering" });
  });

  it("reports unknown select labels after normalization", () => {
    const fields = [
      {
        name: "department",
        type: "select",
        options: [
          { label: "NED", value: 4 },
          { label: "Main Store", value: 7 },
        ],
      },
    ];

    const normalized = normalizeCopilotFormPatchValues(fields, {
      department: "Civil Engineering",
    });

    expect(findInvalidCopilotSelectValues(fields, normalized)).toEqual([
      {
        field: "department",
        value: "Civil Engineering",
        allowedOptions: [
          { label: "NED", value: 4 },
          { label: "Main Store", value: 7 },
        ],
      },
    ]);
  });

  it("reports invalid nested select labels inside array rows", () => {
    const fields = [
      {
        name: "items",
        type: "array",
        arrayItemFields: [
          {
            name: "item",
            type: "select",
            options: [{ label: "Laptop", value: 3 }],
          },
        ],
      },
    ];

    const normalized = normalizeCopilotFormPatchValues(fields, {
      items: [{ item: "Desktop" }],
    });

    expect(findInvalidCopilotSelectValues(fields, normalized)).toEqual([
      {
        field: "items.0.item",
        value: "Desktop",
        allowedOptions: [{ label: "Laptop", value: 3 }],
      },
    ]);
  });
});
