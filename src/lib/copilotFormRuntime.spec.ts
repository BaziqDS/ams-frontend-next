import { describe, expect, it } from "vitest";

import {
  COPILOT_FORM_OPTION_PREVIEW_LIMIT,
  buildCopilotSetFormValuesParameters,
  buildCopilotFormContextFields,
  createCopilotFormRuntimeState,
  ensureValueInOptions,
  findInvalidCopilotSelectValues,
  normalizeCopilotFormPatchValues,
  normalizeCopilotSetValuesResponse,
  normalizeCopilotSubmitError,
  normalizeCopilotSubmitResult,
  searchCopilotFormOptions,
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
  it("exposes long option fields as truncated previews without bloating writable schemas", () => {
    const options = Array.from({ length: 30 }, (_unused, index) => ({
      value: String(index + 1),
      label: `Instance ${index + 1}`,
    }));
    const fields = [
      {
        name: "instances",
        label: "Instances",
        type: "array" as const,
        arrayItemType: "string" as const,
        options,
        dependsOn: ["item"],
        optionSource: "inventory.instances",
        resolver: "search_form_options" as const,
      },
    ];

    const [contextField] = buildCopilotFormContextFields(fields, { previewLimit: 3 });
    const parameters = buildCopilotSetFormValuesParameters(fields);

    expect(contextField).toMatchObject({
      name: "instances",
      optionsState: "truncated",
      optionsPreview: options.slice(0, 3),
      totalCount: 30,
      hasMore: true,
      dependsOn: ["item"],
      optionSource: "inventory.instances",
      resolver: "search_form_options",
    });
    expect(contextField).not.toHaveProperty("options");
    expect(
      parameters.values.properties?.instances.items,
    ).not.toHaveProperty("enum");
  });

  it("uses the global dropdown preview limit by default for every long select field", () => {
    const options = Array.from(
      { length: COPILOT_FORM_OPTION_PREVIEW_LIMIT + 5 },
      (_unused, index) => ({
        value: String(index + 1),
        label: `Option ${index + 1}`,
      }),
    );

    const [contextField] = buildCopilotFormContextFields([
      {
        name: "category",
        label: "Category",
        type: "select",
        options,
      },
    ]);

    expect(contextField.optionsState).toBe("truncated");
    expect(contextField.optionsPreview).toHaveLength(COPILOT_FORM_OPTION_PREVIEW_LIMIT);
    expect(contextField.totalCount).toBe(COPILOT_FORM_OPTION_PREVIEW_LIMIT + 5);
    expect(contextField.resolver).toBe("search_form_options");
    expect(contextField).not.toHaveProperty("options");
  });

  it("describes empty dropdowns explicitly in active form context and search results", () => {
    const fields = [
      {
        name: "department",
        label: "Department",
        type: "select" as const,
        options: [],
      },
    ];

    const [contextField] = buildCopilotFormContextFields(fields);
    expect(contextField).toMatchObject({
      name: "department",
      optionsState: "empty",
      totalCount: 0,
      hasMore: false,
      emptyReason: "No options exist for Department in the current form state.",
    });

    expect(searchCopilotFormOptions({
      fields,
      field: "department",
      query: "CSIT",
    })).toMatchObject({
      ok: false,
      status: "not_found",
      field: "department",
      optionsState: "empty",
      totalCount: 0,
      message: "No options exist for Department in the current form state.",
    });
  });

  it("caps invalid select error option previews with the same global dropdown limit", () => {
    const options = Array.from(
      { length: COPILOT_FORM_OPTION_PREVIEW_LIMIT + 10 },
      (_unused, index) => ({
        value: String(index + 1),
        label: `Category ${index + 1}`,
      }),
    );

    const failures = findInvalidCopilotSelectValues([
      {
        name: "category",
        label: "Category",
        type: "select",
        options,
      },
    ], {
      category: "999",
    });

    expect(failures).toEqual([
      {
        field: "category",
        value: "999",
        allowedOptions: options.slice(0, COPILOT_FORM_OPTION_PREVIEW_LIMIT),
      },
    ]);
  });

  it("resolves options by label even when the active form context only exposes a preview", () => {
    const options = Array.from({ length: 30 }, (_unused, index) => ({
      value: String(index + 1),
      label: `Instance ${index + 1}`,
    }));

    const result = searchCopilotFormOptions({
      fields: [
        {
          name: "instances",
          label: "Instances",
          type: "array",
          arrayItemType: "string",
          options,
          resolver: "search_form_options",
        },
      ],
      field: "instances",
      query: "Instance 30",
      previewLimit: 5,
    });

    expect(result).toMatchObject({
      ok: true,
      status: "matched",
      field: "instances",
      selected: { value: "30", label: "Instance 30" },
      totalCount: 30,
      hasMore: true,
      optionsState: "truncated",
    });
  });

  it("matches option labels when user text omits punctuation from the dropdown label", () => {
    expect(searchCopilotFormOptions({
      fields: [
        {
          name: "to_location",
          label: "Destination",
          type: "select",
          options: [
            { value: "7", label: "CSIT (Main Store)" },
            { value: "8", label: "Electrical Engineering (Main Store)" },
          ],
        },
      ],
      field: "to_location",
      query: "CSIT Main Store",
    })).toMatchObject({
      ok: true,
      status: "matched",
      selected: { value: "7", label: "CSIT (Main Store)" },
    });
  });

  it("selects a single strong fuzzy option match for voice transcription mistakes", () => {
    expect(searchCopilotFormOptions({
      fields: [
        {
          name: "items.0.item",
          label: "Item",
          type: "select",
          options: [
            { value: "3", label: "Core i7 (CPU-I7)" },
            { value: "4", label: "Monitor (MON)" },
          ],
        },
      ],
      field: "items.0.item",
      query: "Core I4",
    })).toMatchObject({
      ok: true,
      status: "matched",
      selected: { value: "3", label: "Core i7 (CPU-I7)" },
    });
  });

  it("keeps fuzzy option matches ambiguous when more than one candidate is plausible", () => {
    expect(searchCopilotFormOptions({
      fields: [
        {
          name: "items.0.item",
          label: "Item",
          type: "select",
          options: [
            { value: "3", label: "Core i5 (CPU-I5)" },
            { value: "4", label: "Core i7 (CPU-I7)" },
          ],
        },
      ],
      field: "items.0.item",
      query: "Core I4",
    })).toMatchObject({
      ok: true,
      status: "ambiguous",
      candidates: [
        { value: "3", label: "Core i5 (CPU-I5)" },
        { value: "4", label: "Core i7 (CPU-I7)" },
      ],
    });
  });

  it("searches nested array item option fields by dotted row path", () => {
    const result = searchCopilotFormOptions({
      fields: [
        {
          name: "items",
          label: "Line items",
          type: "array",
          arrayItemFields: [
            {
              name: "item",
              label: "Item",
              type: "select",
              options: [
                { value: "3", label: "Core i7 (CPU-I7)" },
                { value: "4", label: "Monitor (MON)" },
              ],
              dependsOn: ["from_location"],
              optionSource: "stockEntry.availableItems",
              resolver: "search_form_options",
            },
          ],
        },
      ],
      field: "items.0.item",
      query: "core i7",
    });

    expect(result).toMatchObject({
      ok: true,
      status: "matched",
      field: "items.0.item",
      selected: { value: "3", label: "Core i7 (CPU-I7)" },
    });
  });

  it("resolves row wildcard dependencies from flat dotted current values", () => {
    const result = searchCopilotFormOptions({
      fields: [
        {
          name: "items",
          label: "Line items",
          type: "array",
          arrayItemFields: [
            {
              name: "instances",
              label: "Instances",
              type: "array",
              arrayItemType: "string",
              options: [
                { value: "44", label: "SN-044" },
                { value: "45", label: "SN-045" },
              ],
              dependsOn: ["from_location", "items[].item"],
              optionsState: "requires_dependency",
              optionSource: "stockEntry.availableInstances",
              resolver: "search_form_options",
            },
          ],
        },
      ],
      field: "items.0.instances",
      query: "SN-045",
      currentValues: {
        entry_type: "ISSUE",
        from_location: "7",
        issue_target: "STORE",
        "items.0.item": "3",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      status: "matched",
      field: "items.0.instances",
      selected: { value: "45", label: "SN-045" },
    });
  });

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

describe("ensureValueInOptions", () => {
  const baseOptions = [
    { value: "", label: "No parent" },
    { value: "1", label: "Alpha" },
    { value: "2", label: "Beta" },
  ];

  it("appends a missing value with its label", () => {
    const result = ensureValueInOptions(baseOptions, "3", "Gamma");
    expect(result).toEqual([...baseOptions, { value: "3", label: "Gamma" }]);
  });

  it("returns the original array when the value already exists", () => {
    const result = ensureValueInOptions(baseOptions, "2", "Beta");
    expect(result).toBe(baseOptions);
  });

  it("returns the original array for null or empty values", () => {
    expect(ensureValueInOptions(baseOptions, null)).toBe(baseOptions);
    expect(ensureValueInOptions(baseOptions, "")).toBe(baseOptions);
    expect(ensureValueInOptions(baseOptions, undefined)).toBe(baseOptions);
  });

  it("uses stringified value as label when no label is given", () => {
    const result = ensureValueInOptions(baseOptions, 42);
    expect(result).toEqual([...baseOptions, { value: 42, label: "42" }]);
  });

  it("matches numeric values against string option values", () => {
    const result = ensureValueInOptions(baseOptions, 2, "Beta");
    expect(result).toBe(baseOptions);
  });
});
