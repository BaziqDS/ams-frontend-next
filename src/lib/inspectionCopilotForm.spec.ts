import { describe, expect, it } from "vitest";
import {
  applyInspectionItemCopilotPatches,
  buildInspectionItemCopilotFields,
  parseInspectionItemFieldPath,
} from "./inspectionCopilotForm";

describe("inspection copilot form helpers", () => {
  it("parses dotted and bracket item field paths", () => {
    expect(parseInspectionItemFieldPath("items.0.central_register")).toEqual({
      index: 0,
      field: "central_register",
    });
    expect(parseInspectionItemFieldPath("items[2].central_register_page_no")).toEqual({
      index: 2,
      field: "central_register_page_no",
    });
    expect(parseInspectionItemFieldPath("central_register")).toBeNull();
  });

  it("patches nested central register fields without replacing existing item data", () => {
    const currentItems = [
      {
        id: 10,
        item_description: "core i5",
        accepted_quantity: 11,
        central_register: null,
        central_register_page_no: "",
      },
    ];

    const result = applyInspectionItemCopilotPatches({
      currentItems,
      values: {
        "items.0.central_register": "5",
        "items.0.central_register_page_no": "44",
      },
      blankItem: () => ({
        item_description: "",
        accepted_quantity: 0,
        central_register: null,
        central_register_page_no: "",
      }),
    });

    expect(result.applied).toEqual([
      "items.0.central_register",
      "items.0.central_register_page_no",
    ]);
    expect(result.ignored).toEqual([]);
    expect(result.nextItems[0]).toMatchObject({
      id: 10,
      item_description: "core i5",
      accepted_quantity: 11,
      central_register: 5,
      central_register_page_no: "44",
    });
  });

  it("merges bulk item patches over existing rows instead of blanking untouched fields", () => {
    const currentItems = [
      {
        id: 10,
        item_description: "core i5",
        accepted_quantity: 11,
        central_register: null,
        central_register_page_no: "",
      },
    ];

    const result = applyInspectionItemCopilotPatches({
      currentItems,
      values: {
        items: [{ central_register: 7, central_register_page_no: "50" }],
      },
      blankItem: () => ({
        item_description: "",
        accepted_quantity: 0,
        central_register: null,
        central_register_page_no: "",
      }),
    });

    expect(result.applied).toEqual(["items"]);
    expect(result.nextItems[0]).toMatchObject({
      id: 10,
      item_description: "core i5",
      accepted_quantity: 11,
      central_register: 7,
      central_register_page_no: "50",
    });
  });

  it("uses explicit row indexes in bulk item patches instead of array position", () => {
    const currentItems = [
      {
        id: 10,
        item_description: "rejected line",
        accepted_quantity: 0,
        central_register: null,
        central_register_page_no: "",
      },
      {
        id: 11,
        item_description: "accepted line",
        accepted_quantity: 3,
        central_register: null,
        central_register_page_no: "",
      },
    ];

    const result = applyInspectionItemCopilotPatches({
      currentItems,
      values: {
        items: [{ index: 1, central_register: 7, central_register_page_no: "50" }],
      },
      blankItem: () => ({
        item_description: "",
        accepted_quantity: 0,
        central_register: null,
        central_register_page_no: "",
      }),
    });

    expect(result.applied).toEqual(["items"]);
    expect(result.nextItems[0]).toMatchObject({
      id: 10,
      item_description: "rejected line",
      accepted_quantity: 0,
      central_register: null,
      central_register_page_no: "",
    });
    expect(result.nextItems[1]).toMatchObject({
      id: 11,
      item_description: "accepted line",
      accepted_quantity: 3,
      central_register: 7,
      central_register_page_no: "50",
    });
  });

  it("builds exact per-row writable fields for central register controls", () => {
    const fields = buildInspectionItemCopilotFields({
      items: [{ item_description: "core i5", accepted_quantity: 1 }],
      canEditStock: false,
      canEditCentral: true,
      departmentRegisterOptions: [],
      centralRegisterOptions: [{ id: 5, register_number: "CSR-1" }],
      itemOptions: [{ id: 9, name: "Processor", code: "ITM-0001" }],
    });

    expect(fields.map(field => field.name)).toEqual([
      "items.0.central_register",
      "items.0.central_register_page_no",
      "items.0.item",
      "items.0.batch_number",
      "items.0.manufactured_date",
      "items.0.expiry_date",
    ]);
    expect(fields[0].options).toEqual([{ label: "CSR-1", value: 5 }]);
    expect(fields[2].options).toEqual([{ label: "Processor (ITM-0001)", value: 9 }]);
  });
});
